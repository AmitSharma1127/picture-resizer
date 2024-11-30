// DOM Elements
const imagePreview = document.getElementById("image-preview");
const originalSize = document.getElementById("original-size");
const fileSize = document.getElementById("file-size");
const estimatedSize = document.getElementById("estimated-size");
const sizeReduction = document.getElementById("size-reduction");
const resizeBtn = document.getElementById("resize-btn");
const cancelBtn = document.getElementById("cancel-btn");
const closeBtn = document.getElementById("close-btn");
const resizeText = document.getElementById("resize-text");
const resizeLoader = document.getElementById("resize-loader");

// Notification
const notification = document.getElementById("notification");
const notificationMessage = document.getElementById("notification-message");

// State
let originalWidth = 0;
let originalHeight = 0;
let originalFileSize = 0;

function showNotification(type, message, duration = 3000) {
	const notification = document.getElementById("notification");
	const messageEl = document.getElementById("notification-message");
	const progress = notification.querySelector(".notification-progress");

	progress.style.animation = "none";
	progress.offsetHeight;
	progress.style.animation = null;

	messageEl.textContent = message;
	notification.className = `notification ${type}`;

	setTimeout(() => {
		notification.classList.remove("hidden");
	}, 10);

	const hideTimeout = setTimeout(() => {
		hideNotification();
	}, duration);

	notification.dataset.timeoutId = hideTimeout;
}

function hideNotification() {
	const notification = document.getElementById("notification");
	notification.classList.add("hidden");

	if (notification.dataset.timeoutId) {
		clearTimeout(Number(notification.dataset.timeoutId));
		delete notification.dataset.timeoutId;
	}
}

document
	.querySelector(".notification-close")
	.addEventListener("click", hideNotification);

// Initialize
async function init() {
	try {
		const params = new URLSearchParams(window.location.search);
		const imageUrl = params.get("image");
		const width = params.get("width");
		const height = params.get("height");

		if (!imageUrl) throw new Error("No image URL provided");

		if (imageUrl.startsWith("blob:")) {
			originalWidth = parseInt(width);
			originalHeight = parseInt(height);

			imagePreview.src = imageUrl;
			originalSize.textContent = `${originalWidth}×${originalHeight}`;

			originalFileSize = originalWidth * originalHeight * 4;
			fileSize.textContent = API.formatBytes(originalFileSize) + " (estimated)";
			updateSizeEstimation();
			return;
		}

		const img = new Image();
		img.onload = async () => {
			originalWidth = img.naturalWidth;
			originalHeight = img.naturalHeight;

			imagePreview.src = imageUrl;
			originalSize.textContent = `${originalWidth}×${originalHeight}`;

			try {
				const response = await fetch(imageUrl);
				originalFileSize = parseInt(
					response.headers.get("content-length") || 0
				);
				fileSize.textContent = API.formatBytes(originalFileSize);
				updateSizeEstimation();
			} catch (error) {
				console.error("Error fetching file size:", error);
				fileSize.textContent = "Size unknown";
			}
		};

		img.onerror = () => {
			throw new Error("Failed to load image");
		};
		img.src = imageUrl;
	} catch (error) {
		console.error("Initialization error:", error);
		showNotification("error", "Failed to initialize resize dialog");
		window.close();
	}
}

function parseDimensions(dimString) {
	const match = dimString.match(/(\d+)\s*[xX]\s*(\d+)/);
	if (match) {
		return {
			width: parseInt(match[1]),
			height: parseInt(match[2])
		};
	}
	return null;
}

function parseCommand(command) {
	command = command.toLowerCase().trim();
	const directDims = parseDimensions(command);
	if (directDims) return directDims;

	const match = command.match(/(?:resize\s+to\s+)?(\d+)\s*[xX]\s*(\d+)/);
	if (match) {
		return {
			width: parseInt(match[1]),
			height: parseInt(match[2])
		};
	}
	return null;
}

function updateSizeEstimation() {
	const dimensions = parseCommand(commandInput.value);

	if (!dimensions || !originalFileSize) {
		estimatedSize.textContent = "Unknown";
		sizeReduction.textContent = "-";
		return;
	}

	const pixelRatio =
		dimensions.width * dimensions.height / (originalWidth * originalHeight);
	const estimatedBytes = Math.round(originalFileSize * pixelRatio);

	estimatedSize.textContent = API.formatBytes(estimatedBytes);

	const reduction = Math.round((1 - pixelRatio) * 100);
	sizeReduction.textContent =
		reduction > 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`;
	sizeReduction.style.color = reduction > 0 ? "var(--success)" : "var(--error)";
}

function validateDimensions(dimensions) {
	if (!dimensions) {
		throw new Error("Please enter valid dimensions");
	}

	if (
		dimensions.width < CONFIG.MIN_IMAGE_WIDTH ||
		dimensions.width > CONFIG.MAX_IMAGE_WIDTH
	) {
		throw new Error(
			`Width must be between ${CONFIG.MIN_IMAGE_WIDTH} and ${CONFIG.MAX_IMAGE_WIDTH} pixels`
		);
	}

	if (
		dimensions.height < CONFIG.MIN_IMAGE_HEIGHT ||
		dimensions.height > CONFIG.MAX_IMAGE_HEIGHT
	) {
		throw new Error(
			`Height must be between ${CONFIG.MIN_IMAGE_HEIGHT} and ${CONFIG.MAX_IMAGE_HEIGHT} pixels`
		);
	}

	return dimensions;
}

async function getCurrentUser() {
	const { PR_pro_user: user } = await chrome.storage.local.get("PR_pro_user");
	return user;
}

async function handleResize() {
	try {
		const dimensions = validateDimensions(parseCommand(commandInput.value));
		const user = await getCurrentUser();
		if (!user) throw new Error("User not authenticated");

		resizeText.classList.add("hidden");
		resizeLoader.classList.remove("hidden");
		resizeBtn.disabled = true;

		const imageUrl = imagePreview.src;
		const result = await API.resizeImage(
			imageUrl,
			dimensions.width,
			dimensions.height
		);

		const historyItem = {
			id: Math.floor(Math.random() * 1000000000),
			userId: user.uid,
			originalUrl: imageUrl,
			resizedUrl: CONFIG.API_BASE_URL + result.resizedUrl,
			originalWidth,
			originalHeight,
			width: dimensions.width,
			height: dimensions.height,
			timestamp: Date.now()
		};

		const { history = {} } = await chrome.storage.local.get("history");
		if (!history[user.uid]) {
			history[user.uid] = [];
		}
		history[user.uid] = [historyItem, ...history[user.uid]];
		await chrome.storage.local.set({ history });

		window.close();
	} catch (error) {
		console.error("Resize error:", error);
		showNotification("error", error.message || "Failed to resize image");
		resizeText.classList.remove("hidden");
		resizeLoader.classList.add("hidden");
		resizeBtn.disabled = false;
	}
}

function processCommand() {
	const command = commandInput.value;
	const dimensions = parseCommand(command);

	if (dimensions) {
		try {
			if (
				dimensions.width < CONFIG.MIN_IMAGE_WIDTH ||
				dimensions.width > CONFIG.MAX_IMAGE_WIDTH ||
				dimensions.height < CONFIG.MIN_IMAGE_HEIGHT ||
				dimensions.height > CONFIG.MAX_IMAGE_HEIGHT
			) {
				showNotification(
					"warning",
					`Dimensions must be between ${CONFIG.MIN_IMAGE_WIDTH}×${CONFIG.MIN_IMAGE_HEIGHT} and ${CONFIG.MAX_IMAGE_WIDTH}×${CONFIG.MAX_IMAGE_HEIGHT} pixels`
				);
				return;
			}

			updateSizeEstimation();
		} catch (error) {
			showNotification(
				"error",
				"Invalid dimensions. Please check the size limits."
			);
		}
	} else {
		showNotification(
			"error",
			"Could not understand the command. Please use format: 1024x1024"
		);
	}
}

const commandInput = document.getElementById("command-input");
const commandSubmit = document.getElementById("command-submit");

commandInput.addEventListener("keyup", e => {
	if (e.key === "Enter") {
		processCommand();
	}
});

commandSubmit.addEventListener("click", processCommand);

resizeBtn.addEventListener("click", handleResize);
cancelBtn.addEventListener("click", () => window.close());
closeBtn.addEventListener("click", () => window.close());

document.addEventListener("keydown", e => {
	if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
		handleResize();
	} else if (e.key === "Escape") {
		window.close();
	}
});

document.addEventListener("submit", e => e.preventDefault());

init();

const shortcutsInfo = document.createElement("div");
shortcutsInfo.className = "shortcuts-info";
shortcutsInfo.innerHTML = `
    <div class="shortcut">
        <kbd>${navigator.platform.includes("Mac")
					? "⌘"
					: "Ctrl"}</kbd> + <kbd>Enter</kbd>
        <span>Resize</span>
    </div>
    <div class="shortcut">
        <kbd>Esc</kbd>
        <span>Cancel</span>
    </div>
`;
document.querySelector(".action-buttons").appendChild(shortcutsInfo);
