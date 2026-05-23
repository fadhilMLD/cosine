// ============================================
// AUTHENTICATION SETUP
// ============================================

const loginPage = document.getElementById("loginPage");
const mainApp = document.querySelector(".main");

// Get logout button (could be logoutBtn or logoutBtnNav depending on page)
let logoutBtn = document.getElementById("logoutBtn") || document.getElementById("logoutBtnNav");

// Get user name/plan elements (could be different on different pages)
let userNameEl = document.getElementById("userName");
let userDisplayName = document.getElementById("userDisplayName");
let userDisplayPlan = document.getElementById("userDisplayPlan");

let authToken = null;
let currentUser = null;
let isGuest = false;

// Check if user is already logged in (from URL params or localStorage)
function initializeAuth() {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    const userFromUrl = params.get("user");
    
    authToken = tokenFromUrl || localStorage.getItem("authToken");
    
    if (tokenFromUrl) {
        localStorage.setItem("authToken", tokenFromUrl);
        try {
            currentUser = JSON.parse(userFromUrl);
            localStorage.setItem("currentUser", userFromUrl);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Failed to parse user data", e);
        }
    } else {
        const savedUser = localStorage.getItem("currentUser");
        if (savedUser) {
            try {
                currentUser = JSON.parse(savedUser);
            } catch (e) {
                console.error("Failed to parse saved user", e);
            }
        }
    }
    
    // Check if user is authenticated and has plan selected
    if (authToken && currentUser) {
        showMainApp();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    loginPage.classList.remove("hidden");
    mainApp.classList.add("hidden");
}

function showMainApp() {
    loginPage.classList.add("hidden");
    if (mainApp) mainApp.classList.remove("hidden");
    
    if (currentUser) {
        // Update navbar user display (for logged.html)
        if (userDisplayName) {
            userDisplayName.textContent = currentUser.name || "User";
        }
        if (userDisplayPlan) {
            const planDisplay = (currentUser.subscription_plan || "starter").toUpperCase();
            userDisplayPlan.textContent = planDisplay;
        }
        // Update username (for other pages)
        if (userNameEl) {
            userNameEl.textContent = currentUser.name || "User";
        }
    } else if (isGuest) {
        if (userNameEl) userNameEl.textContent = "Guest User";
    }
}

function handleCredentialResponse(response) {
    // The ID token is in response.credential
    const token = response.credential;
    
    // Validate token exists
    if (!token) {
        console.error("No credential received from Google");
        alert("Failed to get credentials from Google. Please try again.");
        return;
    }
    
    console.log("Google token received, sending to server...");
    console.log("Token length:", token.length);
    
    // Send token to backend for verification and JWT creation
    fetch(getApiUrl("/auth/google"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ token })
    })
    .then(res => {
        console.log("Response status:", res.status);
        if (!res.ok) {
            return res.text().then(text => {
                console.error("Error response:", text);
                throw new Error(`HTTP ${res.status}: ${text}`);
            });
        }
        return res.json();
    })
    .then(data => {
        console.log("Auth response data:", data);
        if (data.access_token) {
            authToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem("authToken", authToken);
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            // Redirect to plan selection page
            window.location.href = "plan.html";
        } else {
            console.error("No access token in response:", data);
            alert("Authentication failed: No token in response");
        }
    })
    .catch(err => {
        console.error("Auth error:", err);
        alert("Authentication error: " + err.message);
    });
}

function logout() {
    authToken = null;
    currentUser = null;
    isGuest = false;
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    window.location.href = "index.html";
}

if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
}

// ============================================
// CHAT APPLICATION
// ============================================

// Get both textareas and buttons (one on login page, one on main app)
const loginPageBox = document.querySelector(".loginPage textarea#promptBox");
const mainAppBox = document.querySelector(".main textarea#promptBox");
const loginPageBtn = document.querySelector(".loginPage button#sendBtn");
const mainAppBtn = document.querySelector(".main button#sendBtn");
const chatContainer = document.getElementById("chatContainer");

// Use a getter to always get the visible textarea
function getActiveBox() {
    return loginPageBox.offsetParent !== null ? loginPageBox : mainAppBox;
}

function getActiveSendBtn() {
    return loginPageBox.offsetParent !== null ? loginPageBtn : mainAppBtn;
}

const baseWidth = 420;
const maxWidth = 900;
const baseFont = 26;
const minFont = 16;
const maxHeight = 250;
const widthStep = 40;
const textPadding = 40;
const averageGlyphWidth = 0.58;
const heavyTextThreshold = 20000;

let resizeFrame = 0;
let chatStarted = false;

function resetBoxSize(box) {
    box.style.width = baseWidth + "px";
    box.style.fontSize = baseFont + "px";
    box.style.height = "60px";
}

function getLongestLineLength(text, maxScanLength) {
    let maxLine = 0;
    let currentLine = 0;
    const scanLimit = Math.min(text.length, maxScanLength);

    for (let i = 0; i < scanLimit; i++) {
        if (text[i] === "\n") {
            if (currentLine > maxLine) {
                maxLine = currentLine;
            }
            currentLine = 0;
            continue;
        }
        currentLine++;
    }

    if (currentLine > maxLine) {
        maxLine = currentLine;
    }

    return maxLine;
}

function applyBoxLayout(box) {
    const value = box.value;

    if (value.length > 0) {
        box.classList.add("active");
    } else {
        box.classList.remove("active");
        resetBoxSize(box);
        return;
    }

    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, maxHeight) + "px";

    if (value.length >= heavyTextThreshold) {
        box.style.width = maxWidth + "px";
        box.style.fontSize = minFont + "px";
        return;
    }

    const longestLine = getLongestLineLength(value, heavyTextThreshold);
    const estimatedTextWidth = (longestLine * baseFont * averageGlyphWidth) + textPadding;
    const targetWidth = Math.min(maxWidth, Math.max(baseWidth, Math.ceil(estimatedTextWidth)));
    const widthGrowth = Math.ceil((targetWidth - baseWidth) / widthStep);
    const newWidth = Math.min(maxWidth, baseWidth + (Math.max(0, widthGrowth) * widthStep));
    const newFont = Math.max(minFont, baseFont - Math.max(0, widthGrowth));

    box.style.width = newWidth + "px";
    box.style.fontSize = newFont + "px";
}

function queueBoxLayout(box) {
    if (resizeFrame !== 0) {
        return;
    }

    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        applyBoxLayout(box);
    });
}

// Setup event listeners for both textareas
[loginPageBox, mainAppBox].forEach(box => {
    box.addEventListener("input", () => {
        queueBoxLayout(box);
    });

    box.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            sendPrompt();
        }
    });
});

function activateChatUI(){
if(chatStarted) return
chatStarted=true
// Show main app and hide login page
loginPage.classList.add("hidden")
mainApp.classList.remove("hidden")
document.body.classList.add("chat-mode")
chatContainer.classList.remove("hidden")
}

function addMessage(sender, text) {
    const msg = document.createElement("div");
    const senderSpan = document.createElement("span");
    senderSpan.className = "senderLabel";
    
    let senderClass = "botMsg";
    let senderName = sender;

    if (sender === "user") {
        senderClass = "userMsg";
        senderName = "You";
    } else if (sender === "System") {
        senderClass = "systemMsg";
    } else if (sender === "Summary") {
        senderClass = "summaryMsg";
        senderName = "📋 Summary";
    } else {
        // For agents like Generator, Negator, etc.
        senderClass = "agentMsg";
    }

    senderSpan.innerText = senderName;
    msg.className = senderClass;
    
    // Add agent-specific class
    if (sender !== "user" && sender !== "System" && sender !== "Summary") {
        msg.classList.add(`agent-${sender.toLowerCase().replace(/\s+/g, "-")}`);
    }
    
    msg.innerText = text;
    msg.prepend(senderSpan);

    // Add typing class if text is just dots
    if (text.match(/^\.+$/)) {
        msg.classList.add("typing");
    }

    chatContainer.appendChild(msg);
    // Scroll the window to the bottom to show new messages
    window.scrollTo(0, document.body.scrollHeight);
}

let socket;
let socketReady = false;
let pendingPrompt = null;
let typingMessages = {};  // Track typing messages by speaker

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    // Build WebSocket URL with token if authenticated
    let wsUrl = getWsUrl("/ws");
    if (authToken) {
        wsUrl += "?token=" + authToken;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket connection established.");
        socketReady = true;
        if (pendingPrompt) {
            socket.send(pendingPrompt);
            pendingPrompt = null;
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.is_typing) {
            // Handle typing indicator
            const speaker = data.speaker;
            const dots = data.dots || ".";
            
            if (!typingMessages[speaker]) {
                // Create new typing message
                typingMessages[speaker] = true;
                addMessage(speaker, dots);
            } else {
                // Update the text node of the last message from this speaker
                const lastMsg = chatContainer.lastElementChild;
                if (lastMsg && lastMsg.textContent.includes(speaker)) {
                    // Find and update only the text node (not the senderLabel span)
                    const textNode = Array.from(lastMsg.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.textContent = dots;
                    }
                }
            }
        } else {
            // Handle actual message
            delete typingMessages[data.speaker];
            
            // Replace last typing message or add new message
            const lastMsg = chatContainer.lastElementChild;
            if (lastMsg && lastMsg.textContent.includes(data.speaker) && lastMsg.textContent.match(/^[.\s\w]+$/)) {
                // Replace typing dots with actual message
                const textNode = Array.from(lastMsg.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.textContent = data.message;
                }
                lastMsg.classList.remove("typing");
            } else {
                // Add as new message
                addMessage(data.speaker, data.message);
            }
        }
    };

    socket.onclose = () => {
        console.log("WebSocket connection closed.");
        socketReady = false;
        addMessage("System", "Connection to server lost. Please refresh.");
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addMessage("System", "A connection error occurred.");
    };
}

async function sendPrompt() {
    const box = getActiveBox();
    const prompt = box.value.trim();

    if (!prompt) {
        return;
    }

    // If user is not authenticated, set them as guest
    if (!authToken) {
        isGuest = true;
        activateChatUI();
        addMessage("System", "Guest Mode: Limited to 10 messages. Sign in for unlimited access.");
    }

    activateChatUI();
    addMessage("user", prompt);
    box.value = "";
    box.classList.remove("active");
    resetBoxSize(box);

    if (!socketReady) {
        pendingPrompt = prompt;
        setupWebSocket();
    } else {
        socket.send(prompt);
    }
}

// Setup button event listener for both buttons
[loginPageBtn, mainAppBtn].forEach(btn => {
    btn.addEventListener("click", sendPrompt);
});

// Initialize authentication on page load
// ============================================
// HISTORY PAGE
// ============================================

const debatePage = document.getElementById("debatePage");
const historyPage = document.getElementById("historyPage");
const debateDetailPage = document.getElementById("debateDetailPage");
const historyList = document.getElementById("historyList");
const debateDetail = document.getElementById("debateDetail");

console.log("Page elements:", { debatePage, historyPage, debateDetailPage });

function showDebatePage(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    console.log("showDebatePage called");
    
    // Remove active from all pages
    debatePage.classList.remove("active");
    historyPage.classList.remove("active");
    debateDetailPage.classList.remove("active");
    
    // Add active to debate page
    debatePage.classList.add("active");
    
    // Show chat if in chat mode
    if (chatStarted) {
        chatContainer.classList.remove("hidden");
    }
    
    console.log("Debate page active:", debatePage.classList.contains("active"));
}

function showHistoryPage(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    console.log("showHistoryPage called");
    
    // Remove active from all pages
    debatePage.classList.remove("active");
    historyPage.classList.remove("active");
    debateDetailPage.classList.remove("active");
    
    // Add active to history page
    historyPage.classList.add("active");
    
    // Hide chat container
    chatContainer.classList.add("hidden");
    
    // Load and display history
    loadDebateHistory();
    
    console.log("History page active:", historyPage.classList.contains("active"));
}

function loadDebateHistory() {
    if (!authToken) {
        historyList.innerHTML = '<div class="noHistoryMsg">Please log in to view your history</div>';
        return;
    }

    fetch(getApiUrl("/debates/history"), {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
            "ngrok-skip-browser-warning": "true"
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        displayDebateHistory(data.debates || []);
    })
    .catch(error => {
        console.error("Error loading debate history:", error);
        historyList.innerHTML = '<div class="noHistoryMsg">Error loading history. Please try again.</div>';
    });
}

function displayDebateHistory(debates) {
    if (!debates || debates.length === 0) {
        historyList.innerHTML = '<div class="noHistoryMsg">No debates yet. Start one to see it here!</div>';
        return;
    }

    historyList.innerHTML = "";
    
    debates.forEach(debate => {
        const debateId = debate._id;
        const topic = debate.topic;
        const created = new Date(debate.created_at);
        const dateStr = created.toLocaleDateString() + " " + created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const item = document.createElement("div");
        item.className = "historyItem";
        item.innerHTML = `
            <h3>${topic}</h3>
            <p>${dateStr}</p>
        `;
        
        item.addEventListener("click", () => {
            showDebateDetail(debateId, topic);
        });
        
        historyList.appendChild(item);
    });
}

function showDebateDetail(debateSessionId, topic) {
    debatePage.classList.remove("active");
    historyPage.classList.remove("active");
    debateDetailPage.classList.add("active");
    chatContainer.classList.add("hidden");
    
    loadDebateMessages(debateSessionId, topic);
}

function loadDebateMessages(debateSessionId, topic) {
    if (!authToken) {
        debateDetail.innerHTML = '<div class="noHistoryMsg">Please log in to view debate details</div>';
        return;
    }

    fetch(getApiUrl(`/debates/${debateSessionId}/messages`), {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`,
            "ngrok-skip-browser-warning": "true"
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        displayDebateMessages(data.messages || [], topic);
    })
    .catch(error => {
        console.error("Error loading debate messages:", error);
        debateDetail.innerHTML = '<div class="noHistoryMsg">Error loading debate. Please try again.</div>';
    });
}

function displayDebateMessages(messages, topic) {
    debateDetail.innerHTML = `<h2>${topic}</h2>`;
    
    if (!messages || messages.length === 0) {
        debateDetail.innerHTML += '<div class="noHistoryMsg">No messages in this debate</div>';
        return;
    }

    messages.forEach(msg => {
        const timestamp = new Date(msg.timestamp);
        const timeStr = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const msgEl = document.createElement("div");
        msgEl.className = "debateMessage";
        msgEl.innerHTML = `
            <div class="speaker">${msg.speaker}</div>
            <div class="content">${escapeHtml(msg.message)}</div>
            <div class="timestamp">${timeStr}</div>
        `;
        
        debateDetail.appendChild(msgEl);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize the debate page as active on load
function initializePage() {
    console.log("Initializing page");
    
    // Make sure debate page is shown by default
    if (debatePage) {
        debatePage.classList.add("active");
        console.log("Debate page initialized as active");
    }
    
    if (historyPage) {
        historyPage.classList.remove("active");
    }
    
    if (debateDetailPage) {
        debateDetailPage.classList.remove("active");
    }
}

// Run on load
document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM Content Loaded");
    initializeAuth();
    initializePage();
});