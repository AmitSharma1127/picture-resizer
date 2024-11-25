import { auth, db } from "../../src/firebase-config";
import {
	collection,
	query,
	where,
	orderBy,
	getDocs,
	deleteDoc
} from "firebase/firestore";

// DOM Elements
const historyList = document.getElementById("history-list");
const historyCount = document.getElementById("history-count");
const emptyState = document.getElementById("empty-state");
const clearHistoryBtn = document.getElementById("clear-history");

// Load History
async function loadHistory() {
	const user = auth.currentUser;
	if (!user) {
		window.location.href = "auth.html";
		return;
	}

	const historyRef = collection(db, "history");
	const q = query(
		historyRef,
		where("userId", "==", user.uid),
		orderBy("timestamp", "desc")
	);

	try {
		const snapshot = await getDocs(q);
		const history = [];

		snapshot.forEach(doc => {
			history.push({ id: doc.id, ...doc.data() });
		});

		displayHistory(history);
	} catch (error) {
		console.error("Failed to load history:", error);
	}
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
          <img src="assets/copy.svg" alt="Copy" class="icon">
          Copy URL
        </button>
        <button class="btn-secondary delete-btn" data-id="${item.id}">
          <img src="assets/trash.svg" alt="Delete" class="icon">Delete
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
			'<img src="assets/check.svg" alt="Copied" class="icon">Copied!';
		setTimeout(() => {
			button.innerHTML = originalContent;
		}, 2000);
	});

	// Delete handler
	div.querySelector(".delete-btn").addEventListener("click", async e => {
		const id = e.target.closest(".delete-btn").dataset.id;
		await deleteHistoryItem(id);
	});

	return div;
}

// Delete History Item
async function deleteHistoryItem(id) {
	try {
		await deleteDoc(doc(db, "history", id));
		await loadHistory(); // Refresh the list
	} catch (error) {
		console.error("Failed to delete history item:", error);
	}
}

// Clear All History
clearHistoryBtn.addEventListener("click", async () => {
	if (!confirm("Are you sure you want to clear all history?")) {
		return;
	}

	const user = auth.currentUser;
	const historyRef = collection(db, "history");
	const q = query(historyRef, where("userId", "==", user.uid));

	try {
		const snapshot = await getDocs(q);
		const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
		await Promise.all(deletePromises);
		await loadHistory(); // Refresh the list
	} catch (error) {
		console.error("Failed to clear history:", error);
	}
});

// Initialize
loadHistory();
