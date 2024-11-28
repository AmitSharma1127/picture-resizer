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

// check-oauth-config.js
function checkOAuthConfig() {
    // 1. Check manifest permissions
    const manifest = chrome.runtime.getManifest();
    console.log("=== OAuth Configuration Check ===");
    
    // Check required permissions
    const requiredPermissions = ['identity'];
    const missingPermissions = requiredPermissions.filter(p => !manifest.permissions.includes(p));
    console.log("Permissions Check:", missingPermissions.length === 0 ? "✓" : "✗");
    if (missingPermissions.length > 0) {
        console.error("Missing permissions:", missingPermissions);
    }

    // Check OAuth2 config
    if (!manifest.oauth2) {
        console.error("❌ Missing oauth2 configuration in manifest");
        return;
    }

    // Check client ID format
    const clientId = manifest.oauth2.client_id;
    console.log("Client ID:", clientId);
    if (!clientId || !clientId.endsWith('.apps.googleusercontent.com')) {
        console.error("❌ Invalid client ID format. Should end with .apps.googleusercontent.com");
        return;
    }

    // Check required scopes
    const requiredScopes = [
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
    ];
    const missingScopes = requiredScopes.filter(s => !manifest.oauth2.scopes.includes(s));
    console.log("Scopes Check:", missingScopes.length === 0 ? "✓" : "✗");
    if (missingScopes.length > 0) {
        console.error("Missing scopes:", missingScopes);
    }

    // Test OAuth token retrieval
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
            console.error("Token retrieval failed:", chrome.runtime.lastError.message);
        } else {
            console.log("Token retrieval test: ✓");
            console.log("Token available:", !!token);
        }
    });

    console.log("Extension ID:", chrome.runtime.id);
}

// Run check when the script loads
// document.addEventListener('DOMContentLoaded', checkOAuthConfig);

// Initialize UI based on auth state
async function refreshAuthToken() {
    try {
        // Clear existing tokens first
        await new Promise((resolve) => {
            chrome.identity.clearAllCachedAuthTokens(resolve);
        });

        // Get new token with interactive mode
        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(token);
                }
            });
        });

        return token;
    } catch (error) {
        console.error('Token refresh failed:', error);
        throw error;
    }
}
async function initializeUI() {
    try {
        authCheck.classList.remove('hidden');
        
        try {
            // Try to get stored user first
            const { PR_pro_user } = await chrome.storage.local.get('PR_pro_user');
            
            if (PR_pro_user) {
                // If we have a stored user, try to refresh the token
                try {
                    await refreshAuthToken();
                    showAuthenticatedUI(PR_pro_user);
                    await detectImages();
                } catch (tokenError) {
                    console.error('Token refresh failed:', tokenError);
                    // If token refresh fails, clear storage and show login
                    await chrome.storage.local.remove('PR_pro_user');
                    showUnauthenticatedUI();
                }
            } else {
                showUnauthenticatedUI();
            }
        } catch (error) {
            console.error('Storage access error:', error);
            showUnauthenticatedUI();
        }

        authCheck.classList.add('hidden');
    } catch (error) {
        console.error('Initialization error:', error);
        authCheck.classList.add('hidden');
        showUnauthenticatedUI();
    }
}

// UI State Functions
function showAuthenticatedUI(user) {
    console.log('Authenticated as:', user);
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
                    <img src="../assets/svg/error.svg" width="25" alt="Error" class="error-icon">
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
        console.log('Detection error:', error);
        imageGrid.innerHTML = `
            <div class="error-state">
                <img src="../assets/svg/error.svg"  width="25" alt="Error" class="error-icon">
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
    try {
        // Clear everything first
        await new Promise((resolve) => {
            chrome.identity.clearAllCachedAuthTokens(resolve);
        });
        await chrome.storage.local.remove('PR_pro_user');
        
        // Open auth page in new tab
        chrome.tabs.create({ url: 'pages/auth/auth.html' });
    } catch (error) {
        console.error('Login initialization error:', error);
        alert('Failed to initialize login. Please try again.');
    }
});

logoutBtn.addEventListener('click', async () => {
    try {
        // Get current token
        const token = await new Promise(resolve => 
            chrome.identity.getAuthToken({ interactive: false }, resolve)
        );
        
        if (token) {
            // Remove from cache
            await new Promise(resolve => 
                chrome.identity.removeCachedAuthToken({ token }, resolve)
            );
            
            // Revoke the token
            try {
                await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
            } catch (revokeError) {
                console.error('Token revocation failed:', revokeError);
                // Continue with logout even if revocation fails
            }
        }

        // Clear everything
        await new Promise(resolve => chrome.identity.clearAllCachedAuthTokens(resolve));
        await chrome.storage.local.remove('PR_pro_user');
        
        showUnauthenticatedUI();
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout. Please try again.');
    }
});

refreshBtn.addEventListener('click', detectImages);
viewHistoryBtn.addEventListener('click', () => {
    const popupContainer = document.querySelector('.container');
    
    const linkElement = document.createElement('link');
    linkElement.rel = 'stylesheet';
    linkElement.href = '../pages/history/history.css';
    document.head.appendChild(linkElement);
    
    fetch(chrome.runtime.getURL('pages/history/history.html'))
        .then(response => response.text())
        .then(html => {
            // Create temporary container to extract content
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = html;
            
            // Get content within body
            const historyContent = tempContainer.querySelector('.container').innerHTML;
            
            // Replace popup content
            popupContainer.innerHTML = historyContent;
            
            // Add back button to header
            const headerLeft = document.querySelector('.header-left');
            const backButton = document.createElement('button');
            backButton.className = 'btn-icon';
            backButton.innerHTML = '<img src="../assets/svg/left-arrow.svg" alt="Back" class="icon">';
            backButton.addEventListener('click', () => window.location.reload());
            headerLeft.insertBefore(backButton, headerLeft.firstChild);
            
            // Load history.js script
            const script = document.createElement('script');
            script.src = '../pages/history/history.js';
            document.body.appendChild(script);
        });
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
        console.log('Detection error:', error);
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
            <img src="../assets/svg/error.svg" width="25" alt="Error" class="error-icon">
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

// popup.js
// Create a port connection
const port = chrome.runtime.connect({ name: 'popup-' + Date.now() });

// Listen for auth state changes
port.onMessage.addListener(async (message) => {
    if (message.type === "AUTH_STATE_CHANGED") {
        const user = message.user;
        if (user) {
            try {
                // Ensure we have a fresh token
                await refreshAuthToken();
                await chrome.storage.local.set({ PR_pro_user: user });
                showAuthenticatedUI(user);
                detectImages();
            } catch (error) {
                console.error('Auth state change error:', error);
                showUnauthenticatedUI();
            }
        } else {
            await chrome.storage.local.remove('PR_pro_user');
            showUnauthenticatedUI();
        }
    }
});

// Clean up when popup closes
window.addEventListener('unload', () => {
    port.disconnect();
});