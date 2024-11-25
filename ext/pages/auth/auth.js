// DOM Elements
const googleLoginBtn = document.getElementById("google-login");
const authStatus = document.getElementById("auth-status");

// Google Auth
function initializeGoogleAuth() {
	const CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID";
	const REDIRECT_URI = chrome.identity.getRedirectURL();

	return {
		async signIn() {
			const authUrl =
				`https://accounts.google.com/o/oauth2/v2/auth?` +
				`client_id=${CLIENT_ID}` +
				`&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
				`&response_type=token` +
				`&scope=profile email`;

			try {
				const token = await new Promise((resolve, reject) => {
					chrome.identity.launchWebAuthFlow(
						{
							url: authUrl,
							interactive: true
						},
						redirectUrl => {
							if (chrome.runtime.lastError) {
								reject(chrome.runtime.lastError);
							} else {
								// Extract token from redirect URL
								const url = new URL(redirectUrl);
								const hash = url.hash.substring(1);
								const params = new URLSearchParams(hash);
								resolve(params.get("access_token"));
							}
						}
					);
				});

				// Get user info with token
				const userInfo = await fetch(
					"https://www.googleapis.com/oauth2/v3/userinfo",
					{
						headers: { Authorization: `Bearer ${token}` }
					}
				).then(res => res.json());

				// Save user info
				const user = {
					uid: userInfo.sub,
					email: userInfo.email,
					displayName: userInfo.name,
					photoURL: userInfo.picture,
					token
				};

				await chrome.storage.local.set({ user });

				showSuccess();
				notifyExtension(user);
			} catch (error) {
				console.error("Auth Error:", error);
				alert("Authentication failed. Please try again.");
			}
		}
	};
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

// Initialize auth
const auth = initializeGoogleAuth();

// Add click handler
googleLoginBtn.addEventListener("click", () => auth.signIn());
