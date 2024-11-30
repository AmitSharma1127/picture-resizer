const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const emptyState = document.getElementById("empty-state");
const clearHistoryBtn = document.getElementById("clear-history");

// Load History
async function loadHistory() {
	try {
		const history = await getHistory();
		console.log("Loaded history:", history);
		displayHistory(history);
	} catch (error) {
		console.error("Error loading history:", error);
	}
}

// Get History from Chrome Storage
async function getHistory() {
	try {
		const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
		if (!user) return [];
		console.log(user);
		const { history = {} } = await chrome.storage.local.get("history");
		return history[user.uid] || [];
	} catch (error) {
		console.error("Error getting history:", error);
		return [];
	}
}
// Save History to Chrome Storage
async function saveHistory(historyItems) {
	const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
	if (!user) return;

	const { history = {} } = await chrome.storage.local.get("history");
	history[user.uid] = historyItems;
	console.log("saving history");
	console.log(history);
	await chrome.storage.local.set({ history });
}

// Display History
function displayHistory(history) {
	historyCount.textContent = `${history.length} items`;

	if (history.length === 0) {
		historyList.classList.add("hidden");
		emptyState.classList.remove("hidden");
		return;
	}

	historyList.classList.remove("hidden");
	emptyState.classList.add("hidden");
	historyList.innerHTML = "";

	history.forEach(item => {
		const historyItem = createHistoryItem(item);
		historyList.appendChild(historyItem);
	});
}

// Create History Item
function createHistoryItem(item) {
	const div = document.createElement("div");
	div.className = "history-item";

	div.innerHTML = `
    <img src="${item.resizedUrl}" alt="" class="history-image">
    <div class="history-details">
      <div class="history-date">
        ${new Date(item.timestamp).toLocaleDateString()}
      </div>
      <div class="history-dimensions">
        <div class="dimension-group">
          <div class="dimension-label">Original</div>
          <div class="dimension-value">${item.originalWidth}x${item.originalHeight}</div>
        </div>
        <div class="dimension-group">
          <div class="dimension-label">Resized</div>
          <div class="dimension-value">${item.width}x${item.height}</div>
        </div>
      </div>
      <div class="history-actions">
        <button class="btn-secondary copy-btn" data-url="${item.resizedUrl}">
          <img src="../../assets/svg/copy.svg" alt="Copy" class="icon">
          Copy URL
        </button>
        <button class="btn-secondary delete-btn" data-id="${item.id}">
          <img src="../../assets/svg/trash.svg" alt="Delete" class="icon">Delete
        </button>
      </div>
    </div>
  `;

	// Copy URL handler
	div.querySelector(".copy-btn").addEventListener("click", async e => {
		const url = e.target.closest(".copy-btn").dataset.url;
		await navigator.clipboard.writeText(url);

		// Show temporary success message
		const button = e.target.closest(".copy-btn");
		const originalContent = button.innerHTML;
		button.innerHTML =
			'<img width="25" src="../../assets/svg/check.svg" alt="Copied" class="icon">Copied!';
		setTimeout(() => {
			button.innerHTML = originalContent;
		}, 2000);
	});

	// Delete handler
	div.querySelector(".delete-btn").addEventListener("click", async e => {
		const id = e.target.closest(".delete-btn").dataset.id;
		console.log("Delete item with ID:", id);
		await deleteHistoryItem(id);
	});

	return div;
}

// Delete History Item
async function deleteHistoryItem(id) {
	const history = await getHistory();
	console.log("Deleting item with ID:", id);
	const updatedHistory = history.filter(item => item.id !== Number(id));
	console.log("Updated history:", updatedHistory);
	await saveHistory(updatedHistory);
	await loadHistory();
}

// Clear All History
clearHistoryBtn.addEventListener("click", async () => {
	if (!confirm("Are you sure you want to clear all history?")) return;

	const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
	if (!user) return;

	const { history = {} } = await chrome.storage.local.get("history");
	delete history[user.uid];
	await chrome.storage.local.set({ history });
	await loadHistory();
});

// Initialize
loadHistory();
