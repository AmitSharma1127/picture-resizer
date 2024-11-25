// DOM Elements
const authCheck = document.getElementById('auth-check');
const notAuthenticated = document.getElementById('not-authenticated');
const authenticated = document.getElementById('authenticated');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userAvatar = document.getElementById('user-avatar');
const userName = document.getElementById('user-name');
const imageGrid = document.getElementById('image-grid');
const imageCount = document.getElementById('image-count');
const refreshBtn = document.getElementById('refresh-btn');
const viewHistoryBtn = document.getElementById('view-history');

// Initialize UI based on auth state
async function initializeUI() {
    try {
        let user;
        
        if (CONFIG.IS_DEV) {
            await AuthHelper.setCurrentUser(CONFIG.DEV_USER);
            user = CONFIG.DEV_USER;
        } else {
            const result = await chrome.storage.local.get('user');
            user = result.user;
        }

        authCheck.classList.add('hidden');
        
        if (user) {
            showAuthenticatedUI(user);
            await detectImages();
        } else {
            showUnauthenticatedUI();
        }
    } catch (error) {
        console.error('Initialization error:', error);
        authCheck.classList.add('hidden');
        showUnauthenticatedUI();
    }
}

// UI State Functions
function showAuthenticatedUI(user) {
    authenticated.classList.remove('hidden');
    notAuthenticated.classList.add('hidden');
    
    userAvatar.src = user.photoURL || '../assets/svg/default-avatar.png';
    userName.textContent = user.displayName || user.email;

    if (CONFIG.IS_DEV) {
        const devBadge = document.createElement('div');
        devBadge.className = 'dev-badge';
        devBadge.textContent = 'DEV MODE';
        authenticated.appendChild(devBadge);
    }
}

function showUnauthenticatedUI() {
    authenticated.classList.add('hidden');
    notAuthenticated.classList.remove('hidden');
}

// Image Detection Logic
async function detectImages() {
    try {
        // Show loading state
        imageGrid.innerHTML = `
            <div class="loading-state">
                <div class="loader"></div>
                <p>Scanning for images...</p>
            </div>
        `;

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }

        // Check if we can access the tab
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
            imageGrid.innerHTML = `
                <div class="empty-state">
                    <img src="../assets/svg/error.svg" alt="Error" class="error-icon">
                    <p>Cannot scan images on this page</p>
                </div>
            `;
            imageCount.textContent = '0 images found';
            return;
        }

        console.log('Executing script on tab:', tab.id);

        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    const images = Array.from(document.images);
                    console.log('Found raw images:', images.length);
                    
                    return images.map(img => ({
                        src: img.src,
                        width: img.naturalWidth || img.width,
                        height: img.naturalHeight || img.height,
                        alt: img.alt || ''
                    })).filter(img => {
                        const isValidSize = img.width > 10 && img.height > 10;
                        const isValidSrc = !img.src.startsWith('data:') && 
                                         !img.src.startsWith('blob:') &&
                                         img.src.trim() !== '';
                        return isValidSize && isValidSrc;
                    });
                }
            });

            console.log('Script execution results:', results);

            if (!results || !results[0]) {
                throw new Error('No results from script execution');
            }

            const images = results[0].result;
            console.log('Filtered images:', images.length);
            displayImages(images);

        } catch (scriptError) {
            console.error('Script execution error:', scriptError);
            throw new Error(`Failed to execute script: ${scriptError.message}`);
        }

    } catch (error) {
        console.error('Detection error:', error);
        imageGrid.innerHTML = `
            <div class="error-state">
                <img src="../assets/svg/error.svg" alt="Error" class="error-icon">
                <p>${error.message || 'Failed to scan images'}</p>
                <button id="retry-btn" class="btn-secondary">
                    <img src="../assets/svg/refresh.svg" alt="Retry" class="icon">
                    Retry
                </button>
            </div>
        `;
        
        document.getElementById('retry-btn')?.addEventListener('click', detectImages);
    }
}

// Display Images
function displayImages(images) {
	if (!imageGrid.classList.contains('hidden')) {
		imageGrid.classList.add('hidden');
	}

    if (!images || images.length === 0) {
		console.log('No images found');
        imageGrid.innerHTML = `
            <div class="empty-state">
                <img src="../assets/svg/empty.svg" alt="No images" class="empty-icon">
                <p>No images found on this page</p>
                <button id="refresh-empty" class="btn-secondary">
                    <img src="../assets/svg/refresh.svg" alt="Refresh" class="icon">
                    Refresh
                </button>
            </div>
        `;
        
        document.getElementById('refresh-empty')?.addEventListener('click', detectImages);
		console.log('Images found:', 0);
        imageCount.textContent = '0 images found';
		imageGrid.classList.remove('hidden');
        return;
    }

    const fragment = document.createDocumentFragment();
    
    images.forEach(img => {
		console.log('Image found:', img);
        const card = createImageCard(img);
        fragment.appendChild(card);
    });
    console.log('Images found:', images.length);
    imageGrid.innerHTML = '';
    imageGrid.appendChild(fragment);
    imageCount.textContent = `${images.length} image${images.length === 1 ? '' : 's'} found`;
	imageGrid.classList.remove('hidden');
	
}

// Create Image Card
function createImageCard(img) {
    const card = document.createElement('div');
    card.className = 'image-card';
    
    card.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${img.src}" 
                 alt="${img.alt}" 
                 class="image-preview"
                 onerror="this.onerror=null; this.src='../assets/svg/broken-image.svg';">
            <div class="image-dimensions">${img.width} × ${img.height}</div>
        </div>
        <div class="image-actions">
            <button class="btn-primary resize-btn">
                <img src="../assets/svg/resize.svg" alt="Resize" class="icon">
                Resize
            </button>
        </div>
    `;
    
    // Add loading animation
    const previewImg = card.querySelector('.image-preview');
    previewImg.addEventListener('load', () => {
        card.classList.add('loaded');
    });
    
    // Add resize handler
    card.querySelector('.resize-btn').addEventListener('click', () => {
        handleResize(img);
    });
    
    return card;
}

// Handle Image Resize
function handleResize(img) {
    chrome.windows.create({
        url: `pages/resize/resize.html?image=${encodeURIComponent(img.src)}&width=${img.width}&height=${img.height}`,
        type: 'popup',
        width: 420,
        height: 700
    });
}

// Event Listeners
loginBtn.addEventListener('click', async () => {
    if (CONFIG.IS_DEV) {
        await AuthHelper.setCurrentUser(CONFIG.DEV_USER);
        showAuthenticatedUI(CONFIG.DEV_USER);
        await detectImages();
    } else {
        chrome.tabs.create({ url: 'pages/auth/auth.html' });
    }
});

logoutBtn.addEventListener('click', async () => {
    await AuthHelper.logout();
    showUnauthenticatedUI();
});

refreshBtn.addEventListener('click', detectImages);

viewHistoryBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'pages/history/history.html' });
});

const imageDetection = document.getElementById('image-detection');
const noImages = document.getElementById('no-images');
const imagesFound = document.getElementById('images-found');

// Image Detection Logic
async function detectImages() {
    try {
        // Show detection state, hide other states
        imageDetection.classList.remove('hidden');
        noImages.classList.add('hidden');
        imagesFound.classList.add('hidden');

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
            throw new Error('No active tab found');
        }

        // Check if we can access the tab
        if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
            showNoImages('Cannot scan images on this page');
            return;
        }

        console.log('Executing script on tab:', tab.id);

        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const images = Array.from(document.images);
                console.log('Found raw images:', images.length);
                
                return images.map(img => ({
                    src: img.src,
                    width: img.naturalWidth || img.width,
                    height: img.naturalHeight || img.height,
                    alt: img.alt || ''
                })).filter(img => {
                    const isValidSize = img.width > 10 && img.height > 10;
                    const isValidSrc = !img.src.startsWith('data:') && 
                                     !img.src.startsWith('blob:') &&
                                     img.src.trim() !== '';
                    return isValidSize && isValidSrc;
                });
            }
        });

        console.log('Script execution results:', results);

        if (!results || !results[0]) {
            throw new Error('No results from script execution');
        }

        const images = results[0].result;
        console.log('Filtered images:', images.length);
        
        // Hide detection state
        imageDetection.classList.add('hidden');

        if (!images || images.length === 0) {
            showNoImages();
        } else {
            displayImages(images);
        }

    } catch (error) {
        console.error('Detection error:', error);
        showError(error.message);
    }
}

// Show No Images State
function showNoImages(message = 'No images found on this page') {
    imageDetection.classList.add('hidden');
    imagesFound.classList.add('hidden');
    noImages.classList.remove('hidden');
    
    noImages.querySelector('p').textContent = message;
    imageCount.textContent = '0 images found';
}

// Show Error State
function showError(message) {
    imageDetection.classList.add('hidden');
    imagesFound.classList.add('hidden');
    noImages.classList.remove('hidden');
    
    noImages.innerHTML = `
        <div class="empty-state">
            <img src="../assets/svg/error.svg" alt="Error" class="error-icon">
            <p>${message || 'Failed to scan images'}</p>
            <button id="refresh-empty" class="btn-secondary">
                <img src="../assets/svg/refresh.svg" alt="Retry" class="icon">
                Retry
            </button>
        </div>
    `;
    
    document.getElementById('refresh-empty')?.addEventListener('click', detectImages);
}

// Display Images
function displayImages(images) {
    console.log('Displaying images:', images);

    // Show images found state
    imageDetection.classList.add('hidden');
    noImages.classList.add('hidden');
    imagesFound.classList.remove('hidden');

    const fragment = document.createDocumentFragment();
    
    images.forEach(img => {
        console.log('Creating card for image:', img);
        const card = createImageCard(img);
        fragment.appendChild(card);
    });
    
    imageGrid.innerHTML = '';
    imageGrid.appendChild(fragment);
    imageCount.textContent = `${images.length} image${images.length === 1 ? '' : 's'} found`;

    // Add the grid-ready class to trigger animations
    setTimeout(() => {
        imageGrid.classList.add('grid-ready');
    }, 0);
}

// Create Image Card
function createImageCard(img) {
    const card = document.createElement('div');
    card.className = 'image-card';
    
    const imageUrl = img.src.startsWith('http') ? img.src : `https:${img.src}`;
    
    card.innerHTML = `
        <div class="image-preview-wrapper">
            <img src="${imageUrl}" 
                 alt="${img.alt}" 
                 class="image-preview"
                 onerror="this.onerror=null; this.src='../assets/svg/broken-image.svg';">
            <div class="image-dimensions">${img.width} × ${img.height}</div>
        </div>
        <div class="image-actions">
            <button class="btn-primary resize-btn">
                <img src="../assets/svg/resize.svg" alt="Resize" class="icon">
                Resize
            </button>
        </div>
    `;
    
    // Add loading animation
    const previewImg = card.querySelector('.image-preview');
    previewImg.addEventListener('load', () => {
        card.classList.add('loaded');
    });
    
    // Add resize handler
    card.querySelector('.resize-btn').addEventListener('click', () => {
        handleResize(img);
    });
    
    return card;
}

// Initialize
initializeUI();