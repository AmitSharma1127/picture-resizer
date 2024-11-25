// Listen for auth state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
	if (message.type === "AUTH_STATE_CHANGED") {
		// Broadcast to all extension pages
		chrome.runtime.sendMessage(message);
	}
});

// Handle installation
chrome.runtime.onInstalled.addListener(() => {
	// Initialize storage
	chrome.storage.local.set({ history: [] });
});
