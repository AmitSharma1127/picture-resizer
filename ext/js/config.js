const CONFIG = {
    IS_DEV: false,
    API_BASE_URL: "http://localhost:3000",
    FIREBASE_CONFIG: {
        apiKey: "AIzaSyAED1M1QdLZrF_oFNrh8DKA6hSZGuYTBrk",
        authDomain: "picture-resize-a0471.firebaseapp.com",
        projectId: "picture-resize-a0471",
        storageBucket: "picture-resize-a0471.firebasestorage.app",
        messagingSenderId: "999707026020",
        appId: "1:999707026020:web:2a9aac4b664f11cd6db571",
        measurementId: "G-XYX0HVV5E3"
    },
    endpoints: {
        signUp: "/api/auth/signup",
        signIn: "/api/auth/signin",
        isLoggedIn: "/api/auth/is-logged-in",
        refreshToken: "/api/auth/refresh-token"
    },
    auth: {
        tokenExpiry: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
        refreshThreshold: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    },
    DEV_USER: {
        uid: 'dev-user-123',
        email: 'dev@example.com',
        displayName: 'Dev User',
        photoURL: '../assets/svg/default-avatar.svg',
        token: 'dev-token-123',
        tokenExpiry: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    MIN_IMAGE_WIDTH: 10,
    MAX_IMAGE_WIDTH: 8192,
    MIN_IMAGE_HEIGHT: 10,
    MAX_IMAGE_HEIGHT: 8192,
};


const StorageHelper = {
    async getHistory() {
        // if (CONFIG.IS_DEV) {
        //     return this.getMockHistory();
        // }
        const { history } = await chrome.storage.local.get('history');
        return history || [];
    },

    async addToHistory(item) {
        try {
            const history = await this.getHistory();
            const newHistory = [{
                ...item,
                timestamp: Date.now()
            }, ...history];

            // Keep only last 50 items
            const trimmedHistory = newHistory.slice(0, 50);
            await chrome.storage.local.set({ history: trimmedHistory });
            
            return true;
        } catch (error) {
            console.error('Failed to add to history:', error);
            return false;
        }
    },

    async clearHistory() {
        try {
            await chrome.storage.local.set({ history: [] });
            return true;
        } catch (error) {
            console.error('Failed to clear history:', error);
            return false;
        }
    },

    getMockHistory() {
        return [
            {
                originalUrl: 'https://example.com/image1.jpg',
                resizedUrl: 'https://example.com/image1-resized.jpg',
                originalWidth: 1920,
                originalHeight: 1080,
                width: 800,
                height: 450,
                timestamp: Date.now() - 1000 * 60 * 60 // 1 hour ago
            },
            {
                originalUrl: 'https://example.com/image2.jpg',
                resizedUrl: 'https://example.com/image2-resized.jpg',
                originalWidth: 1080,
                originalHeight: 1080,
                width: 500,
                height: 500,
                timestamp: Date.now() - 1000 * 60 * 60 * 2 // 2 hours ago
            }
        ];
    }
};

// Auth helper using Firebase
const AuthHelper = {
    // Set current user (used in dev mode and normal auth)
    async setCurrentUser(userData) {
        await this.storeUserData(userData);
        return userData;
    },

    // Store user data in chrome.storage
    async storeUserData(userData) {
        await chrome.storage.local.set({ PR_pro_user: userData });
    },

    async signUp(email, password, displayName) {
        try {
            const userCredential = await firebase.auth()
                .createUserWithEmailAndPassword(email, password);
            
            await userCredential.user.updateProfile({ displayName });
            
            // Get long-lived token
            const token = await this.getCustomToken(userCredential.user);
            
            // Store user info with expiry
            const userData = {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: displayName,
                photoURL: userCredential.user.photoURL,
                token: token,
                tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry
            };

            await this.setCurrentUser(userData);
            return userCredential.user;
        } catch (error) {
            console.error('SignUp Error:', error);
            throw error;
        }
    },

    async signIn(email, password) {
        try {
            const userCredential = await firebase.auth()
                .signInWithEmailAndPassword(email, password);
            
            // Get long-lived token
            const token = await this.getCustomToken(userCredential.user);
            
            // Store user info with expiry
            const userData = {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: userCredential.user.displayName,
                photoURL: userCredential.user.photoURL,
                token: token,
                tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry
            };

            await this.setCurrentUser(userData);
            return userCredential.user;
        } catch (error) {
            console.error('SignIn Error:', error);
            throw error;
        }
    },

    async signInWithGoogle() {
        try {
			console.log('signInWithGoogle');
            const provider = new firebase.auth.GoogleAuthProvider();
			console.log('provider', provider);
            const userCredential = await firebase.auth().signInWithPopup(provider);
			console.log('userCredential', userCredential);
            // Get long-lived token
            const token = await this.getCustomToken(userCredential.user);
            console.log('token', token);
            // Store user info with expiry
            const userData = {
                uid: userCredential.user.uid,
                email: userCredential.user.email,
                displayName: userCredential.user.displayName,
                photoURL: userCredential.user.photoURL,
                token: token,
                tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry
            };

            await this.setCurrentUser(userData);
            return userCredential.user;
        } catch (error) {
            console.error('Google SignIn Error:', error);
            throw error;
        }
    },

    async getCustomToken(user) {
        // In dev mode, return a mock token
        if (CONFIG.IS_DEV) {
            return 'dev-token-123';
        }

        // Request custom token from your backend
        const idToken = await user.getIdToken();
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/custom-token`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get custom token');
        }

        const { token } = await response.json();
        return token;
    },

    async getCurrentUser() {
        try {
            const { user } = await chrome.storage.local.get('PR_pro_user');
            
            if (!user) {
                return null;
            }

            // In dev mode, don't check token expiry
            if (CONFIG.IS_DEV) {
                return user;
            }

            // Check if token needs refresh
            if (this.shouldRefreshToken(user.tokenExpiry)) {
                return await this.refreshUserSession(user);
            }

            return user;
        } catch (error) {
            console.error('GetCurrentUser Error:', error);
            return null;
        }
    },

    shouldRefreshToken(tokenExpiry) {
        const timeUntilExpiry = tokenExpiry - Date.now();
        return timeUntilExpiry < CONFIG.auth.refreshThreshold;
    },

    async refreshUserSession(user) {
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}${CONFIG.endpoints.refreshToken}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${user.token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const { token } = await response.json();
            
            const updatedUser = {
                ...user,
                token,
                tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry
            };

            await this.setCurrentUser(updatedUser);
            return updatedUser;
        } catch (error) {
            console.error('Token Refresh Error:', error);
            await this.logout();
            return null;
        }
    },

    async getIdToken() {
        const user = await this.getCurrentUser();
        return user?.token;
    },

    // Renamed from signOut to logout to match usage
    async logout() {
        if (!CONFIG.IS_DEV) {
            await firebase.auth().signOut();
        }
        await chrome.storage.local.remove('PR_pro_user');
    }
};