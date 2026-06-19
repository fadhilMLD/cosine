// Configuration for API endpoints
const API_CONFIG = {
    // Use relative URLs when on cosine.live, ngrok only for local testing
    BASE_URL: window.location.hostname === 'cosine.live' ? '' : "https://paralyzingly-unspoken-dwayne.ngrok-free.dev",
    WS_URL: window.location.hostname === 'cosine.live' ? '' : "wss://paralyzingly-unspoken-dwayne.ngrok-free.dev"
};

// Helper function to build API URLs
function getApiUrl(path) {
    // If BASE_URL is empty, use relative path
    if (!API_CONFIG.BASE_URL) {
        return path; // This will be /api/plan-prices
    }
    return `${API_CONFIG.BASE_URL}${path}`;
}

function getWsUrl(path) {
    if (!API_CONFIG.WS_URL) {
        return path.startsWith('/') ? path : `/${path}`;
    }
    return `${API_CONFIG.WS_URL}${path}`;
}

// ============================================
// SESSION MANAGEMENT UTILITIES
// ============================================

/**
 * Clear all authentication data from localStorage
 * Use this before setting new auth data to prevent session collisions
 */
function clearAuthSession() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('currentProjectId');
    localStorage.removeItem('registeredEmail');
}

/**
 * Set new auth session data
 * @param {string} token - JWT access token
 * @param {object} user - User object from API
 */
function setAuthSession(token, user) {
    clearAuthSession();
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
}

// Log the current configuration for debugging
console.log('🔧 API Config:', {
    hostname: window.location.hostname,
    BASE_URL: API_CONFIG.BASE_URL || '(relative)',
    WS_URL: API_CONFIG.WS_URL || '(relative)'
});