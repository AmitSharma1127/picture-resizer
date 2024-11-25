const CONFIG = {
	IS_DEV: true,
	API_BASE_URL: "http://localhost:3000",

	DEV_USER: {
		uid: "dev-user-123",
		email: "dev@example.com",
		displayName: "Dev User",
		photoURL: "../assets/svg/default-avatar.svg",
		token: "dev-token-123"
	}
};

const AuthHelper = {
	async getCurrentUser() {
		if (CONFIG.IS_DEV) {
			return CONFIG.DEV_USER;
		}

		const { user } = await chrome.storage.local.get("user");
		return user;
	},

	async setCurrentUser(user) {
		await chrome.storage.local.set({ user });
	},

	async logout() {
		await chrome.storage.local.remove("user");
	},

	isAuthenticated() {
		return CONFIG.IS_DEV
			? true
			: chrome.storage.local.get("user").then(({ user }) => !!user);
	}
};
