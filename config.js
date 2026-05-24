// Configuration for API endpoints
const API_CONFIG = {
    BASE_URL: "https://paralyzingly-unspoken-dwayne.ngrok-free.dev",
    WS_URL: "wss://paralyzingly-unspoken-dwayne.ngrok-free.dev"
};

// Helper function to build API URLs
function getApiUrl(path) {
    return `${API_CONFIG.BASE_URL}${path}`;
}

function getWsUrl(path) {
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
