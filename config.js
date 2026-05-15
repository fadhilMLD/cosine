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
