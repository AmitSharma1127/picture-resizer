// auth-token-manager.js
class AuthTokenManager {
    static async refreshToken(forceNew = false) {
        try {
            // Skip token refresh entirely if not forced
            if (!forceNew) {
                return null;
            }

            // Only proceed with auth flow if explicitly requested
            return new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({ interactive: true }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(token);
                    }
                });
            });
        } catch (error) {
            console.error('Token refresh failed:', error);
            throw error;
        }
    }

    static async validateToken(token) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.ok;
        } catch (error) {
            console.error('Token validation failed:', error);
            return false;
        }
    }

    static async revokeToken(token) {
        if (!token) return;
        
        try {
            // Remove from Chrome's cache first
            await new Promise((resolve) => {
                chrome.identity.removeCachedAuthToken({ token }, resolve);
            });

            // Then revoke it
            const response = await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
            if (!response.ok) {
                throw new Error(`Token revocation failed: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Token revocation error:', error);
            // Continue cleanup even if revocation fails
        }
    }

    static async cleanup() {
        try {
            // Get current token
            const token = await new Promise(resolve => 
                chrome.identity.getAuthToken({ interactive: false }, resolve)
            );

            if (token) {
                await this.revokeToken(token);
            }

            // Clear all cached tokens
            await new Promise(resolve => 
                chrome.identity.clearAllCachedAuthTokens(resolve)
            );

            // Sign out from Firebase if available
            if (typeof firebase !== 'undefined' && firebase.auth?.()?.currentUser) {
                await firebase.auth().signOut();
            }

            // Clear stored user data
            await chrome.storage.local.remove('PR_pro_user');

        } catch (error) {
            console.error('Cleanup failed:', error);
            // Don't throw - complete as much cleanup as possible
        }
    }

    static async handleAccountSwitch() {
        try {
            // Step 1: Full cleanup
            await this.cleanup();

            // Step 2: Force new token with user interaction
            const token = await this.refreshToken(true);
            if (!token) {
                throw new Error('Failed to obtain new token');
            }

            // Step 3: Sign in to Firebase
            const credential = firebase.auth.GoogleAuthProvider.credential(null, token);
            const userCredential = await firebase.auth().signInWithCredential(credential);

            // Step 4: Get fresh ID token
            const idToken = await userCredential.user.getIdToken(true);

            return {
                token,
                idToken,
                userCredential
            };

        } catch (error) {
            console.error('Account switch failed:', error);
            await this.cleanup();
            throw error;
        }
    }
}

// Make it available globally
window.AuthTokenManager = AuthTokenManager;