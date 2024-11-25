// DOM Elements
const imagePreview = document.getElementById("image-preview");
const originalSize = document.getElementById("original-size");
const fileSize = document.getElementById("file-size");
const widthInput = document.getElementById("width");
const heightInput = document.getElementById("height");
const lockAspect = document.getElementById("lock-aspect");
const lockIcon = document.getElementById("lock-icon");
const estimatedSize = document.getElementById("estimated-size");
const sizeReduction = document.getElementById("size-reduction");
const resizeBtn = document.getElementById("resize-btn");
const cancelBtn = document.getElementById("cancel-btn");
const closeBtn = document.getElementById("close-btn");
const resizeText = document.getElementById("resize-text");
const resizeLoader = document.getElementById("resize-loader");

// State
let aspectRatio = 1;
let isAspectLocked = true;
let originalWidth = 0;
let originalHeight = 0;
let originalFileSize = 0;

// Initialize
async function init() {
	try {
		const params = new URLSearchParams(window.location.search);
		const imageUrl = params.get("image");

		if (!imageUrl) {
			throw new Error("No image URL provided");
		}

		// Load image and get dimensions
		const img = new Image();
		img.onload = async () => {
			originalWidth = img.naturalWidth;
			originalHeight = img.naturalHeight;
			aspectRatio = originalWidth / originalHeight;

			imagePreview.src = imageUrl;
			originalSize.textContent = `${originalWidth}×${originalHeight}`;

			// Set initial dimensions
			widthInput.value = originalWidth;
			heightInput.value = originalHeight;

			// Get and show file size
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
		alert("Failed to initialize resize dialog");
		window.close();
	}
}

// Handle Aspect Ratio Lock
lockAspect.addEventListener("click", () => {
	isAspectLocked = !isAspectLocked;
	lockIcon.src = `../../assets/svg/${isAspectLocked ? "lock" : "unlock"}.svg`;
	if (isAspectLocked) {
		const width = parseInt(widthInput.value);
		heightInput.value = Math.round(width / aspectRatio);
	}
	updateSizeEstimation();
});

// Handle Dimension Inputs
widthInput.addEventListener("input", () => {
	const width = parseInt(widthInput.value);
	if (isAspectLocked && width) {
		heightInput.value = Math.round(width / aspectRatio);
	}
	updateSizeEstimation();
});

heightInput.addEventListener("input", () => {
	const height = parseInt(heightInput.value);
	if (isAspectLocked && height) {
		widthInput.value = Math.round(height * aspectRatio);
	}
	updateSizeEstimation();
});

// Handle Presets
document.querySelectorAll(".preset-btn").forEach(btn => {
	btn.addEventListener("click", () => {
		const { width, height } = btn.dataset;
		widthInput.value = width;
		heightInput.value = height;
		updateSizeEstimation();
	});
});

// Update Size Estimation
function updateSizeEstimation() {
	const width = parseInt(widthInput.value);
	const height = parseInt(heightInput.value);

	if (!width || !height || !originalFileSize) {
		estimatedSize.textContent = "Unknown";
		sizeReduction.textContent = "-";
		return;
	}

	// Estimate new file size based on pixel ratio
	// Estimate new file size based on pixel ratio
	const pixelRatio = width * height / (originalWidth * originalHeight);
	const estimatedBytes = Math.round(originalFileSize * pixelRatio);

	estimatedSize.textContent = API.formatBytes(estimatedBytes);

	// Calculate size reduction percentage
	const reduction = Math.round((1 - pixelRatio) * 100);
	sizeReduction.textContent =
		reduction > 0 ? `-${reduction}%` : `+${Math.abs(reduction)}%`;
	sizeReduction.style.color = reduction > 0 ? "var(--success)" : "var(--error)";
}

// Validate Dimensions
function validateDimensions() {
	const width = parseInt(widthInput.value);
	const height = parseInt(heightInput.value);

	if (!width || !height) {
		throw new Error("Please enter valid dimensions");
	}

	if (width < CONFIG.MIN_IMAGE_WIDTH || width > CONFIG.MAX_IMAGE_WIDTH) {
		throw new Error(
			`Width must be between ${CONFIG.MIN_IMAGE_WIDTH} and ${CONFIG.MAX_IMAGE_WIDTH} pixels`
		);
	}

	if (height < CONFIG.MIN_IMAGE_HEIGHT || height > CONFIG.MAX_IMAGE_HEIGHT) {
		throw new Error(
			`Height must be between ${CONFIG.MIN_IMAGE_HEIGHT} and ${CONFIG.MAX_IMAGE_HEIGHT} pixels`
		);
	}

	return { width, height };
}

// Handle Resize
async function handleResize() {
	try {
		// Validate dimensions
		const { width, height } = validateDimensions();

		// Show loading state
		resizeText.classList.add("hidden");
		resizeLoader.classList.remove("hidden");
		resizeBtn.disabled = true;

		// Get current image URL
		const imageUrl = imagePreview.src;

		// Call resize API
		const result = await API.resizeImage(imageUrl, width, height);

		// Save to history
		await StorageHelper.addToHistory({
			originalUrl: imageUrl,
			resizedUrl: result.resizedUrl,
			originalWidth,
			originalHeight,
			width,
			height
		});

		// Close window with success status
		window.close();
	} catch (error) {
		console.error("Resize error:", error);
		alert(error.message || "Failed to resize image");

		// Reset loading state
		resizeText.classList.remove("hidden");
		resizeLoader.classList.add("hidden");
		resizeBtn.disabled = false;
	}
}

// Add Custom Preset
function addCustomPreset(name, width, height) {
	const presetsContainer = document.querySelector(".preset-buttons");

	const button = document.createElement("button");
	button.className = "preset-btn";
	button.dataset.width = width;
	button.dataset.height = height;

	button.innerHTML = `
        <span class="preset-name">${name}</span>
        <span class="preset-size">${width}×${height}</span>
    `;

	button.addEventListener("click", () => {
		widthInput.value = width;
		heightInput.value = height;
		updateSizeEstimation();
	});

	presetsContainer.appendChild(button);
}

// Add Common Social Media Presets
function addSocialMediaPresets() {
	const presets = [
		{ name: "Instagram", width: 1080, height: 1080 },
		{ name: "Story", width: 1080, height: 1920 },
		{ name: "Twitter", width: 1200, height: 675 },
		{ name: "Facebook", width: 1200, height: 630 }
	];

	presets.forEach(preset =>
		addCustomPreset(preset.name, preset.width, preset.height)
	);
}

// Event Listeners
resizeBtn.addEventListener("click", handleResize);

cancelBtn.addEventListener("click", () => {
	window.close();
});

closeBtn.addEventListener("click", () => {
	window.close();
});

// Handle keyboard shortcuts
document.addEventListener("keydown", e => {
	if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
		handleResize();
	} else if (e.key === "Escape") {
		window.close();
	}
});

// Prevent form submission
document.addEventListener("submit", e => e.preventDefault());

// Initialize
init();
addSocialMediaPresets();

// Add keyboard shortcuts info
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
