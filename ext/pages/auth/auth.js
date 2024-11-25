// DOM Elements
const googleLoginBtn = document.getElementById("google-login");
const authStatus = document.getElementById("auth-status");

// Initialize Firebase
if (!firebase.apps.length) {
	firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
}

// Google Auth Handler
async function handleGoogleSignIn() {
	try {
		console.log("Starting Google Sign In...");

		// Get OAuth token using chrome.identity
		const token = await new Promise((resolve, reject) => {
			chrome.identity.getAuthToken({ interactive: true }, function(token) {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(token);
				}
			});
		});

		// Create credential with the token
		const credential = firebase.auth.GoogleAuthProvider.credential(null, token);

		// Sign in to Firebase with credential
		const userCredential = await firebase
			.auth()
			.signInWithCredential(credential);
		console.log("Google Sign In successful:", userCredential);

		// Create user object
		const user = {
			uid: userCredential.user.uid,
			email: userCredential.user.email,
			displayName: userCredential.user.displayName,
			photoURL: userCredential.user.photoURL,
			token: await userCredential.user.getIdToken(),
			tokenExpiry: Date.now() + CONFIG.auth.tokenExpiry
		};

		// Store in chrome.storage
		await chrome.storage.local.set({ user });

		// Show success and notify extension
		showSuccess();
		notifyExtension(user);
	} catch (error) {
		console.error("Auth Error:", error);
		alert(`Authentication failed: ${error.message}`);
	}
}

// Show success message
function showSuccess() {
	googleLoginBtn.style.display = "none";
	authStatus.classList.remove("hidden");
}

// Notify extension about login
function notifyExtension(user) {
	chrome.runtime.sendMessage({
		type: "AUTH_STATE_CHANGED",
		user
	});
}

// Add click handler
googleLoginBtn.addEventListener("click", handleGoogleSignIn);

// Check for existing session
(async () => {
	try {
		const { user } = await chrome.storage.local.get("user");
		if (user) {
			showSuccess();
			notifyExtension(user);
		}
	} catch (error) {
		console.error("Session check error:", error);
	}
})();
