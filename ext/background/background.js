// background.js
// Store active port connections
let ports = new Map();

// Listen for connections from extension pages
chrome.runtime.onConnect.addListener(port => {
	// Store the connection with a unique identifier
	ports.set(port.name, port);

	// Remove port when disconnected
	port.onDisconnect.addListener(() => {
		ports.delete(port.name);
	});

	// Listen for messages on this port
	port.onMessage.addListener(message => {
		if (message.type === "AUTH_STATE_CHANGED") {
			// Broadcast to all connected ports except sender
			ports.forEach((p, portName) => {
				if (p !== port) {
					try {
						p.postMessage(message);
					} catch (error) {
						console.error(`Failed to send to port ${portName}:`, error);
						ports.delete(portName);
					}
				}
			});
		}
	});
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
	// Initialize storage
	chrome.storage.local.set({ history: [] });
});
