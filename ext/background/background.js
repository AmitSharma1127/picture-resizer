class BackgroundManager {
	constructor() {
		this.authPorts = new Set();
		this.setupListeners();
	}

	setupListeners() {
		chrome.runtime.onConnect.addListener(port => {
			if (
				port.name.startsWith("popup-") ||
				port.name.startsWith("auth-page-")
			) {
				this.authPorts.add(port);
				port.onDisconnect.addListener(() => this.authPorts.delete(port));
				port.onMessage.addListener(msg => this.handleMessage(msg));
			}
		});
	}

	handleMessage(message) {
		switch (message.type) {
			case "LOGOUT_REQUEST":
				console.log("Logging out user");
				this.broadcastAuthState(null);
				break;
			case "AUTH_STATE_CHANGED":
				this.broadcastAuthState(message.user);
				break;
		}
	}

	broadcastAuthState(user) {
		console.log("Broadcasting auth state", user);
		const message = { type: "AUTH_STATE_CHANGED", user };
		this.authPorts.forEach(port => {
			try {
				port.postMessage(message);
			} catch (error) {
				this.authPorts.delete(port);
			}
		});
	}
}

new BackgroundManager();
