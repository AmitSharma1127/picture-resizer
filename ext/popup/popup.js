class PopupManager {
    constructor() {
        this.port = chrome.runtime.connect({ name: 'popup-' + Date.now() });
        this.initializeElements();
        this.setupListeners();
        this.initializeUI();
    }

    initializeElements() {
        this.elements = {
            authCheck: document.getElementById('auth-check'),
            notAuthenticated: document.getElementById('not-authenticated'),
            authenticated: document.getElementById('authenticated'),
            loginBtn: document.getElementById('login-btn'),
            logoutBtn: document.getElementById('logout-btn'),
            userAvatar: document.getElementById('user-avatar'),
            userName: document.getElementById('user-name'),
            imageGrid: document.getElementById('image-grid'),
            imageCount: document.getElementById('image-count'),
            refreshBtn: document.getElementById('refresh-btn'),
            viewHistoryBtn: document.getElementById('view-history'),
            imageDetection: document.getElementById('image-detection'),
            noImages: document.getElementById('no-images'),
            imagesFound: document.getElementById('images-found'),
            uploadBtn: document.createElement('button'),
            fileInput: document.createElement('input')
        };

        this.elements.fileInput.type = 'file';
        this.elements.fileInput.accept = 'image/*';
        this.elements.fileInput.className = 'hidden';

        this.elements.uploadBtn.className = 'btn-secondary has-popover';
        this.elements.uploadBtn.innerHTML = `
            <img src="../assets/svg/upload.svg" alt="Upload" class="icon">
            <div class="popover">Upload</div>
        `;

        if (this.elements.logoutBtn) {
            this.elements.logoutBtn.className += ' has-popover';
            this.elements.logoutBtn.innerHTML = `
                <img src="../assets/svg/logout.svg" alt="Logout" class="icon">
                <div class="popover">Logout</div>
            `;
        }
    }

    setupListeners() {
        // Auth related listeners
        this.elements.loginBtn?.addEventListener('click', () => this.handleLogin());
        this.elements.logoutBtn?.addEventListener('click', () => this.handleLogout());
        this.elements.refreshBtn?.addEventListener('click', () => this.detectImages());
        this.elements.viewHistoryBtn?.addEventListener('click', () => this.showHistory());
        this.elements.uploadBtn.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => this.handleLocalUpload(e));

        // Listen for auth state changes from background
        this.port.onMessage.addListener(async (message) => {
            if (message.type === "AUTH_STATE_CHANGED") {
                await this.handleAuthStateChange(message.user);
            }
        });

        // Cleanup on popup close
        window.addEventListener('unload', () => this.port.disconnect());
    }

    async handleLocalUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${CONFIG.API_BASE_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');
        
        const { url } = await response.json();
        const img = new Image();
        
        img.onload = () => {
            chrome.windows.create({
                url: `pages/resize/resize.html?image=${encodeURIComponent(url)}&width=${img.width}&height=${img.height}`,
                type: 'popup',
                width: 420,
                height: 700
            });
        };
        
        img.src = url;
    } catch (error) {
        console.error('Upload error:', error);
        this.showError('Failed to upload image');
    }
}

    async initializeUI() {
        try {
            this.elements.authCheck?.classList.remove('hidden');
            const { PR_pro_user: user } = await chrome.storage.local.get('PR_pro_user');
            
            if (user && user.tokenExpiry > Date.now()) {
                try {
                    const response = await fetch(`${CONFIG.API_BASE_URL}/api/auth/is-logged-in`, {
                        headers: { Authorization: `Bearer ${user.token}` }
                    });

                    if (response.ok) {
                        await this.handleAuthStateChange(user);
                    } else {
                        throw new Error('Session invalid');
                    }
                } catch (error) {
                    console.error('Session validation failed:', error);
                    await this.cleanup();
                    this.showUnauthenticatedUI();
                }
            } else {
                this.showUnauthenticatedUI();
            }
        } catch (error) {
            console.error('Initialization error:', error);
            this.showUnauthenticatedUI();
        } finally {
            this.elements.authCheck?.classList.add('hidden');
        }
    }

    async handleAuthStateChange(user) {
        if (user) {
            try {
                await chrome.storage.local.set({ PR_pro_user: user });
                this.showAuthenticatedUI(user);
                await this.detectImages();
            } catch (error) {
                console.error('Auth state change error:', error);
                await this.cleanup();
                this.showUnauthenticatedUI();
            }
        } else {
            await this.cleanup();
            this.showUnauthenticatedUI();
        }
    }

    async handleLogin() {
        try {
            await this.cleanup();
            chrome.tabs.create({ url: 'pages/auth/auth.html' });
        } catch (error) {
            console.error('Login error:', error);
            alert('Failed to initialize login. Please try again.');
        }
    }

    handleLogout() {
        this.port.postMessage({ type: "LOGOUT_REQUEST" });
    }

    async cleanup() {
        try {
            const token = await new Promise(resolve => 
                chrome.identity.getAuthToken({ interactive: false }, resolve)
            );

            if (token) {
                await chrome.identity.removeCachedAuthToken({ token });
                try {
                    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                } catch (revokeError) {
                    console.error("Token revocation failed:", revokeError);
                }
            }

            await chrome.identity.clearAllCachedAuthTokens();
            
            // Check if Firebase is available and initialized before trying to use it
            if (typeof firebase !== 'undefined' && firebase.auth) {
                try {
                    const currentUser = firebase.auth().currentUser;
                    if (currentUser) {
                        await firebase.auth().signOut();
                    }
                } catch (firebaseError) {
                    console.error('Firebase cleanup error:', firebaseError);
                    // Continue with other cleanup even if Firebase fails
                }
            }

            await chrome.storage.local.remove("PR_pro_user");
        } catch (error) {
            console.error('Cleanup error:', error);
            // Still try to remove local storage even if other cleanup steps fail
            try {
                await chrome.storage.local.remove("PR_pro_user");
            } catch (storageError) {
                console.error('Storage cleanup error:', storageError);
            }
        }
    }

    showAuthenticatedUI(user) {
        this.elements.authenticated?.classList.remove('hidden');
        this.elements.notAuthenticated?.classList.add('hidden');
        
        if (this.elements.userAvatar) {
            this.elements.userAvatar.src = user.photoURL || '../assets/svg/default-avatar.png';
        }
        if (this.elements.userName) {
            this.elements.userName.textContent = user.displayName || user.email;
        }

        if (CONFIG.IS_DEV) {
            const devBadge = document.createElement('div');
            devBadge.className = 'dev-badge';
            devBadge.textContent = 'DEV MODE';
            this.elements.authenticated?.appendChild(devBadge);
        }

        const headerActions = document.querySelector('.header-actions');
        if (headerActions) {
            headerActions.insertBefore(this.elements.uploadBtn, this.elements.viewHistoryBtn.nextSibling);
            headerActions.appendChild(this.elements.fileInput);
        }
    }

    showUnauthenticatedUI() {
        this.elements.authenticated?.classList.add('hidden');
        this.elements.notAuthenticated?.classList.remove('hidden');
    }

    async detectImages() {
        try {
            // Show detection state
            this.elements.imageDetection?.classList.remove('hidden');
            this.elements.noImages?.classList.add('hidden');
            this.elements.imagesFound?.classList.add('hidden');

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab) throw new Error('No active tab found');
            
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) {
                this.showNoImages('Cannot scan images on this page');
                return;
            }

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                    return Array.from(document.images)
                        .map(img => ({
                            src: img.src,
                            width: img.naturalWidth || img.width,
                            height: img.naturalHeight || img.height,
                            alt: img.alt || ''
                        }))
                        .filter(img => {
                            const isValidSize = img.width > 10 && img.height > 10;
                            const isValidSrc = !img.src.startsWith('data:') && 
                                             !img.src.startsWith('blob:') &&
                                             img.src.trim() !== '';
                            return isValidSize && isValidSrc;
                        });
                }
            });

            if (!results?.[0]?.result) throw new Error('No results from script execution');
            
            const images = results[0].result;
            this.displayImages(images);
        } catch (error) {
            console.error('Detection error:', error);
            this.showError(error.message);
        } finally {
            this.elements.imageDetection?.classList.add('hidden');
        }
    }

    displayImages(images) {
        this.elements.imageDetection?.classList.add('hidden');
        this.elements.noImages?.classList.add('hidden');
        this.elements.imagesFound?.classList.remove('hidden');

        if (!images?.length) {
            this.showNoImages();
            return;
        }

        const fragment = document.createDocumentFragment();
        images.forEach(img => fragment.appendChild(this.createImageCard(img)));
        
        if (this.elements.imageGrid) {
            this.elements.imageGrid.innerHTML = '';
            this.elements.imageGrid.appendChild(fragment);
        }
        
        if (this.elements.imageCount) {
            this.elements.imageCount.textContent = 
                `${images.length} image${images.length === 1 ? '' : 's'} found`;
        }

        // Add the grid-ready class to trigger animations
        setTimeout(() => {
            this.elements.imageGrid?.classList.add('grid-ready');
        }, 0);
    }

    createImageCard(img) {
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
            this.handleResize(img);
        });
        
        return card;
    }

    handleResize(img) {
        chrome.windows.create({
            url: `pages/resize/resize.html?image=${encodeURIComponent(img.src)}&width=${img.width}&height=${img.height}`,
            type: 'popup',
            width: 420,
            height: 700
        });
    }

    showNoImages(message = 'No images found on this page') {
        this.elements.imageDetection?.classList.add('hidden');
        this.elements.imagesFound?.classList.add('hidden');
        this.elements.noImages?.classList.remove('hidden');
        
        if (this.elements.noImages) {
            this.elements.noImages.innerHTML = `
                <div class="empty-state">
                    <img src="../assets/svg/empty.svg" alt="No images" class="empty-icon">
                    <p>${message}</p>
                    <button id="refresh-empty" class="btn-secondary">
                        <img src="../assets/svg/refresh.svg" alt="Refresh" class="icon">
                        Refresh
                    </button>
                </div>
            `;
            
            document.getElementById('refresh-empty')?.addEventListener('click', 
                () => this.detectImages()
            );
        }
        
        if (this.elements.imageCount) {
            this.elements.imageCount.textContent = '0 images found';
        }
    }

    showError(message) {
        this.elements.imageDetection?.classList.add('hidden');
        this.elements.imagesFound?.classList.add('hidden');
        this.elements.noImages?.classList.remove('hidden');
        
        if (this.elements.noImages) {
            this.elements.noImages.innerHTML = `
                <div class="error-state">
                    <img src="../assets/svg/error.svg" width="25" alt="Error" class="error-icon">
                    <p>${message || 'Failed to scan images'}</p>
                    <button id="retry-btn" class="btn-secondary">
                        <img src="../assets/svg/refresh.svg" alt="Retry" class="icon">
                        Retry
                    </button>
                </div>
            `;
            
            document.getElementById('retry-btn')?.addEventListener('click', 
                () => this.detectImages()
            );
        }
    }

    showHistory() {
        const popupContainer = document.querySelector('.container');
        
        const linkElement = document.createElement('link');
        linkElement.rel = 'stylesheet';
        linkElement.href = '../pages/history/history.css';
        document.head.appendChild(linkElement);
        
        fetch(chrome.runtime.getURL('pages/history/history.html'))
            .then(response => response.text())
            .then(html => {
                const tempContainer = document.createElement('div');
                tempContainer.innerHTML = html;
                
                const historyContent = tempContainer.querySelector('.container').innerHTML;
                popupContainer.innerHTML = historyContent;
                
                const headerLeft = document.querySelector('.header-left');
                const backButton = document.createElement('button');
                backButton.className = 'btn-icon';
                backButton.innerHTML = '<img src="../assets/svg/left-arrow.svg" alt="Back" class="icon">';
                backButton.addEventListener('click', () => window.location.reload());
                headerLeft.insertBefore(backButton, headerLeft.firstChild);
                
                const script = document.createElement('script');
                script.src = '../pages/history/history.js';
                document.body.appendChild(script);
            });
    }
}

// Initialize popup
new PopupManager();