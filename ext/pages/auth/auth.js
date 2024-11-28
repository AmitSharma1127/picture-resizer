// DOM Elements
const googleLoginBtn = document.getElementById("google-login");
const authStatus = document.getElementById("auth-status");
const loggedOutContent = document.getElementById("logged-out-content");
const loggedInContent = document.getElementById("logged-in-content");
const changeAccountBtn = document.getElementById("change-account");
const logoutBtn = document.getElementById("logout");
const userPhoto = document.getElementById("user-photo");
const userName = document.getElementById("user-name");
const userEmail = document.getElementById("user-email");

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
}

async function getAuthTokens(interactive = true, maxAttempts = 3) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(
                `Attempting to get tokens (attempt ${attempt}/${maxAttempts})...`
            );

            // Clear cached tokens first
            await new Promise(resolve => {
                chrome.identity.clearAllCachedAuthTokens(resolve);
            });

            // Request new OAuth token
            const oauthToken = await new Promise((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error("Token request timed out"));
                }, 30000);

                chrome.identity.getAuthToken({ interactive: true }, function(token) {
                    clearTimeout(timeoutId);
                    if (chrome.runtime.lastError) {
						console.log("error", chrome.runtime.lastError);
                        reject(chrome.runtime.lastError);
                    } else {
						console.log("OAuth token received successfully", token);
                        resolve(token);
                    }
                });
            });
			console.log("OAuth token received successfully", oauthToken);
            // Sign in to Firebase with OAuth token
            const credential = firebase.auth.GoogleAuthProvider.credential(null, oauthToken);
			console.log("credential", credential);
            const userCredential = await firebase.auth().signInWithCredential(credential);
			
            console.log("Firebase user signed in successfully", userCredential);
            // Get Firebase ID token
            const idToken = await userCredential.user.getIdToken(true);

            console.log("Tokens received successfully");
            return { oauthToken, idToken, userCredential };
        } catch (error) {
            console.error(`Token attempt ${attempt} failed:`, error);
            if (attempt === maxAttempts) {
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

function updateGoogleLoginButton(loading = false) {
    if (loading) {
        googleLoginBtn.innerHTML =
            "<img src='../../assets/icons/loader.gif' width='25' alt='Loading...' />";
        googleLoginBtn.disabled = true;
        googleLoginBtn.style.cursor = "not-allowed";
        googleLoginBtn.style.backgroundColor = "#ccc";
    } else {
        googleLoginBtn.innerHTML =
            '<img src="../../assets/svg/google.svg" alt="Google" class="icon">Continue with Google';
        googleLoginBtn.disabled = false;
        googleLoginBtn.style.cursor = "pointer";
        googleLoginBtn.style.backgroundColor = "#ffffff";
    }
}

// Google Auth Handler
async function handleGoogleSignIn() {
    try {
        console.log("Starting Google Sign In...");
        updateGoogleLoginButton(true);

        // Get both OAuth and Firebase ID tokens
        const { idToken, userCredential } = await getAuthTokens(true);
        console.log("Tokens received");

        // Send Firebase ID token to backend
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/signin`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${idToken}`,
                "Content-Type": "application/json"
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Backend authentication failed");
        }

        const backendResponse = await response.json();

        // Create user object
        const user = {
            uid: userCredential.user.uid,
            email: userCredential.user.email,
            displayName: userCredential.user.displayName,
            photoURL: userCredential.user.photoURL,
            token: idToken,
            tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry,
            backendData: backendResponse.user
        };

        // Store in chrome.storage
        await chrome.storage.local.set({ PR_pro_user: user });
        
        updateGoogleLoginButton(false);
        showSuccess(user);
        notifyExtension(user);

    } catch (error) {
        console.error("Detailed Auth Error:", error);

        let errorMessage = "Authentication failed: ";
        if (error.message.includes("timeout")) {
            errorMessage += "Request timed out. Please try again.";
        } else if (error.message.includes("revoked")) {
            errorMessage +=
                "Please remove the extension from your Google Account permissions and try again.";
        } else {
            errorMessage += error.message;
        }

        alert(errorMessage);
        updateGoogleLoginButton(false);

        // Cleanup on error
        try {
            await chrome.identity.clearAllCachedAuthTokens();
            await chrome.storage.local.remove("PR_pro_user");
            await firebase.auth().signOut();
        } catch (cleanupError) {
            console.error("Cleanup after error failed:", cleanupError);
        }
    }
}

async function verifySessionWithBackend() {
    try {
        const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
        if (!user || !user.token) return false;

        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/is-logged-in`, {
            headers: {
                Authorization: `Bearer ${user.token}`
            }
        });

        if (!response.ok) {
            throw new Error('Backend session invalid');
        }

        // Refresh the token if needed
        if (user.tokenExpiry - Date.now() < 300000) { // 5 minutes
            const newToken = await firebase.auth().currentUser?.getIdToken(true);
            if (newToken) {
                user.token = newToken;
                user.tokenExpiry = Date.now() + CONFIG.auth.tokenExpiry;
                await chrome.storage.local.set({ PR_pro_user: user });
            }
        }

        return true;
    } catch (error) {
        console.error("Session verification failed:", error);
        return false;
    }
}

async function handleChangeAccount() {
    try {
        updateGoogleLoginButton(true);

        const existingToken = await new Promise(resolve =>
            chrome.identity.getAuthToken({ interactive: false }, resolve)
        );

        if (existingToken) {
            await new Promise((resolve, reject) => {
                chrome.identity.removeCachedAuthToken({ token: existingToken }, () => {
                    fetch(`https://accounts.google.com/o/oauth2/revoke?token=${existingToken}`)
                        .then(() => resolve())
                        .catch(error => reject(error));
                });
            });
        }

        await chrome.identity.clearAllCachedAuthTokens();
        await firebase.auth().signOut();
        await chrome.storage.local.remove("PR_pro_user");

        showLoggedOut();
        setTimeout(() => handleGoogleSignIn(), 500);
    } catch (error) {
        console.error("Change Account Error:", error);
        alert(`Failed to change account: ${error.message}`);
        updateGoogleLoginButton(false);
    }
}

async function handleLogout() {
    try {
        const existingToken = await new Promise(resolve =>
            chrome.identity.getAuthToken({ interactive: false }, resolve)
        );

        if (existingToken) {
            await new Promise(resolve =>
                chrome.identity.removeCachedAuthToken({ token: existingToken }, resolve)
            );
        }

        await firebase.auth().signOut();
        await chrome.storage.local.remove("PR_pro_user");

        // Call backend logout if needed
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/signout`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${existingToken}`
                }
            });
        } catch (error) {
            console.error("Backend logout failed:", error);
        }

        showLoggedOut();
        notifyExtension(null);
    } catch (error) {
        console.error("Logout Error:", error);
        alert(`Logout failed: ${error.message}`);
    }
}

function showSuccess(user) {
    loggedOutContent.classList.add("hidden");
    loggedInContent.classList.remove("hidden");

    userPhoto.src = user.photoURL || "../../assets/svg/user-default.svg";
    userName.textContent = user.displayName;
    userEmail.textContent = user.email;
}

function showLoggedOut() {
    loggedOutContent.classList.remove("hidden");
    loggedInContent.classList.add("hidden");
}

// Port connection for extension communication
const port = chrome.runtime.connect({ name: "auth-page-" + Date.now() });

function notifyExtension(user) {
    try {
        port.postMessage({
            type: "AUTH_STATE_CHANGED",
            user
        });
    } catch (error) {
        console.error("Failed to notify extension:", error);
    }
}

// Event Listeners
googleLoginBtn.addEventListener("click", () => handleGoogleSignIn());
changeAccountBtn.addEventListener("click", handleChangeAccount);
logoutBtn.addEventListener("click", handleLogout);

// Check for existing session
(async () => {
    try {
        const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
        if (user && user.tokenExpiry > Date.now()) {
            try {
                const { idToken } = await getAuthTokens(false);
                const isValidBackendSession = await verifySessionWithBackend();

                if (isValidBackendSession) {
                    // Update token if needed
                    if (idToken !== user.token) {
                        user.token = idToken;
                        user.tokenExpiry = Date.now() + CONFIG.auth.tokenExpiry;
                        await chrome.storage.local.set({ PR_pro_user: user });
                    }
                    showSuccess(user);
                    notifyExtension(user);
                } else {
                    throw new Error("Backend session invalid");
                }
            } catch (error) {
                console.error("Session validation failed:", error);
                await chrome.storage.local.remove("PR_pro_user");
                showLoggedOut();
            }
        }
    } catch (error) {
        console.error("Session check error:", error);
    }
})();

// Cleanup on page unload
window.addEventListener("unload", () => {
    port.disconnect();
});