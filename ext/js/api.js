const API = {
  async getToken() {
    if (CONFIG.IS_DEV) {
      return CONFIG.DEV_USER.token;
    }
    const user = await AuthHelper.getCurrentUser();
    return user?.token;
  },

  async resizeImage(imageUrl, width, height) {
    try {
      const token = await this.getToken();
      if (!token && !CONFIG.IS_DEV) throw new Error('Not authenticated');

      if (CONFIG.IS_DEV) {
        // Mock API response for development
        return {
          success: true,
          resizedUrl: imageUrl, // Just return original URL in dev mode
          width,
          height
        };
      }

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/resize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: imageUrl, width, height })
      });

      if (!response.ok) throw new Error('Resize failed');
      return await response.json();

    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  },

  async getHistory() {
    try {
      if (CONFIG.IS_DEV) {
        // Return mock history data
        return [{
          id: 'dev-1',
          originalUrl: 'https://example.com/image.jpg',
          resizedUrl: 'https://example.com/image-resized.jpg',
          width: 800,
          height: 600,
          timestamp: Date.now()
        }];
      }

      const token = await this.getToken();
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(`${CONFIG.API_BASE_URL}/api/history`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to fetch history');
      return await response.json();

    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  }
};