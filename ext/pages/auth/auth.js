// auth.js
class AuthManager {
    constructor() {
        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        }
        this.auth = firebase.auth();
        this.googleProvider = new firebase.auth.GoogleAuthProvider();
        
        this.port = chrome.runtime.connect({ name: "auth-page-" + Date.now() });
        this.setupListeners();
        this.initializeUI();
    }

    setupListeners() {
        document.getElementById("google-login")?.addEventListener("click", () => this.handleGoogleSignIn());
        document.getElementById("change-account")?.addEventListener("click", () => this.handleChangeAccount());
        document.getElementById("logout")?.addEventListener("click", () => this.handleLogout());
    }

    async initializeUI() {
        const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
        if (user && user.tokenExpiry > Date.now()) {
            await this.validateSession(user);
        } else {
            this.showLoggedOut();
        }
    }

    async validateSession(user) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/is-logged-in`, {
                headers: { Authorization: `Bearer ${user.token}` }
            });
            
            if (!response.ok) throw new Error('Session invalid');
            
            this.showSuccess(user);
            this.notifyExtension(user);
        } catch (error) {
            await this.cleanup();
            this.showLoggedOut();
        }
    }

    async handleGoogleSignIn() {
        try {
            const token = await this.getAuthToken(true);
            const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            const userCred = await this.auth.signInWithCredential(credential);
            const idToken = await userCred.user.getIdToken(true);

            const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/signin`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) throw new Error("Authentication failed");

            const { user: backendUser } = await response.json();
            const userData = {
                uid: userCred.user.uid,
                email: userCred.user.email,
                displayName: userCred.user.displayName,
                photoURL: userCred.user.photoURL,
                token: idToken,
                tokenExpiry: Date.now() + 3600000 * 24 * 30, // 1 hour
                backendData: backendUser
            };

            await chrome.storage.local.set({ PR_pro_user: userData });
            this.showSuccess(userData);
            this.notifyExtension(userData);
        } catch (error) {
            console.error("Sign in error:", error);
            if (error.code === "auth/user-disabled") {
                alert("Your account has been disabled. Please contact support.");
            }
            await this.cleanup();
            this.showLoggedOut();
        }
    }

    async handleChangeAccount() {
        try {
            // First perform cleanup
            await this.cleanup();
            
            // Remove all existing cached tokens explicitly
            await this.removeAllCachedTokens();
			
			// signout from firebase
			await this.auth.signOut();
            
            // Small delay to ensure cleanup is processed
            

			this.port.postMessage({ type: "LOGOUT_REQUEST" });
			await new Promise(resolve => setTimeout(resolve, 1500));
            // Get new token with forced account selection
            const token = await this.getAuthToken(true);
			const provider = new firebase.auth.GoogleAuthProvider();
			provider.setCustomParameters({
				prompt: 'select_account'
			});
            const credential = provider.credential(null, token);
            const userCred = await this.auth.signInWithCredential(credential);
            const idToken = await userCred.user.getIdToken(true);

            const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/signin`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${idToken}`,
                    "Content-Type": "application/json"
                }
            });

            if (!response.ok) throw new Error("Authentication failed");

            const { user: backendUser } = await response.json();
            const userData = {
                uid: userCred.user.uid,
                email: userCred.user.email,
                displayName: userCred.user.displayName,
                photoURL: userCred.user.photoURL,
                token: idToken,
                tokenExpiry: Date.now() + 3600000, // 1 hour
                backendData: backendUser
            };

            await chrome.storage.local.set({ PR_pro_user: userData });
            this.showSuccess(userData);
            this.notifyExtension(userData);
        } catch (error) {
            console.error("Change account error:", error);
            await this.cleanup();
            this.showLoggedOut();
        }
    }

    async removeAllCachedTokens() {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: false }, async (token) => {
                if (token) {
                    try {
                        // Remove token from Chrome's cache
                        await new Promise(innerResolve => {
                            chrome.identity.removeCachedAuthToken({ token }, innerResolve);
                        });
                        
                        // Revoke token with Google
                        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                        
                        // Recursively remove any remaining tokens
                        await this.removeAllCachedTokens();
                    } catch (error) {
                        console.error("Error removing cached token:", error);
                    }
                }
                resolve();
            });
        });
    }


    async handleLogout() {
        try {
            await this.cleanup();
			console.log("Logging out");
            // Notify other parts of the extension
            this.port.postMessage({ type: "LOGOUT_REQUEST" });
			this.showLoggedOut();
        } catch (error) {
            console.error("Logout error:", error);
            // Force cleanup even if there's an error
            await this.cleanup();
            this.showLoggedOut();
        }
    }

    async cleanup() {
    try {
        // Clear all cached tokens first
        await new Promise(resolve => {
            chrome.identity.clearAllCachedAuthTokens(resolve);
        });
        
        try {
            // Get current token - don't throw if it fails
            const token = await new Promise(resolve => {
                chrome.identity.getAuthToken({ interactive: false }, (token) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);  // Resolve with null instead of rejecting
                    } else {
                        resolve(token);
                    }
                });
            });
            
            if (token) {
                await new Promise(resolve => {
                    chrome.identity.removeCachedAuthToken({ token }, resolve);
                });
                
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
            }
        } catch (tokenError) {
            // Ignore token-related errors
            console.debug('Token cleanup skipped:', tokenError.message);
        }

        // Sign out from Firebase
        if (this.auth.currentUser) {
            await this.auth.signOut();
        }
        
        // Clear local storage
        await chrome.storage.local.remove("PR_pro_user");
        
    } catch (error) {
        console.debug("Cleanup completed with non-critical errors:", error);
        await chrome.storage.local.remove("PR_pro_user");
    }
}

	getAuthToken(interactive) {
    return new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ 
            interactive,
            scopes: ['openid', 'email', 'profile']
        }, token => {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
            } else {
                resolve(token);
            }
        });
    });
}

    showSuccess(user) {
        document.getElementById("logged-out-content").classList.add("hidden");
        document.getElementById("logged-in-content").classList.remove("hidden");
        document.getElementById("user-photo").src = user.photoURL || "../../assets/svg/user-default.svg";
        document.getElementById("user-name").textContent = user.displayName;
        document.getElementById("user-email").textContent = user.email;
    }

    showLoggedOut() {
        document.getElementById("logged-out-content").classList.remove("hidden");
        document.getElementById("logged-in-content").classList.add("hidden");
    }

    notifyExtension(user) {
        this.port.postMessage({ type: "AUTH_STATE_CHANGED", user });
    }
}

// Initialize the auth manager when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
});