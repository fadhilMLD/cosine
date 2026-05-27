// ============================================
// AUTHENTICATION SETUP
// ============================================

const loginPage = document.getElementById("loginPage");
const mainApp = document.querySelector(".main");
const logoutBtn = document.getElementById("logoutBtn");
const userNameEl = document.getElementById("userName");

let authToken = null;
let currentUser = null;
let isGuest = false;

function getStoredUser() {
    const rawUser = localStorage.getItem("currentUser") || localStorage.getItem("user");
    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser);
    } catch (e) {
        console.error("Failed to parse stored user", e);
        return null;
    }
}

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
        currentUser = getStoredUser();
    }
    
    // Show main app if authenticated or in test mode, otherwise show login page
    if (authToken && currentUser) {
        showMainApp();
    } else {
        showLoginPage();
    }
}


function showLoginPage() {
    hideAccessDenied();
    loginPage.classList.remove("hidden");
    mainApp.classList.add("hidden");
}

function showMainApp() {
    hideAccessDenied();
    loginPage.classList.add("hidden");
    mainApp.classList.remove("hidden");
    if (currentUser) {
        userNameEl.textContent = currentUser.name || "User";
    } else if (isGuest) {
        userNameEl.textContent = "Guest User";
    }
}

function showAccessDenied(message) {
    const panel = document.getElementById("accessDenied");
    const messageEl = document.getElementById("accessDeniedMessage");
    if (panel) {
        panel.classList.remove("hidden");
    }
    if (messageEl && message) {
        messageEl.textContent = message;
    }
    if (loginPage) {
        loginPage.classList.add("hidden");
    }
    if (mainApp) {
        mainApp.classList.add("hidden");
    }
}

function hideAccessDenied() {
    const panel = document.getElementById("accessDenied");
    if (panel) {
        panel.classList.add("hidden");
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
            showMainApp();
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
    clearAuthSession();
    showLoginPage();
    location.reload();
}

logoutBtn.addEventListener("click", logout);

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
let isDebateActive = false;  // Track if debate is running
let currentMessageCount = 0;  // Track messages generated
let messageLimit = 0;  // Set based on user plan
let isPaused = false;  // Track pause state
let currentProjectState = { hasPrompt: false };

function getSelectedAgents() {
    const mapping = {
        cfo: "CFO Agent",
        ops: "Operations Agent",
        mkt: "Market Agent",
        dev: "Devil's Advocate"
    };

    return Array.from(activeAgents).map(key => mapping[key]).filter(Boolean);
}

function updateMessageLimit() {
    const limitEl = document.getElementById('messageLimit');
    if (!limitEl || !isDebateActive) return;
    
    if (currentMessageCount >= messageLimit) {
        limitEl.textContent = `⚠️ Message limit reached (${currentMessageCount}/${messageLimit})`;
        limitEl.classList.add('warning');
    } else if (currentMessageCount >= messageLimit * 0.8) {
        limitEl.textContent = `Messages: ${currentMessageCount}/${messageLimit} (Approaching limit)`;
        limitEl.classList.remove('warning');
        limitEl.classList.add('warning');
    } else {
        limitEl.textContent = `Messages: ${currentMessageCount}/${messageLimit}`;
        limitEl.classList.remove('warning');
    }
    
    if (isDebateActive) {
        limitEl.classList.remove('hidden');
    }
}

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    // Validate project_id is available
    if (!currentProjectId) {
        console.error("Cannot establish WebSocket: No project selected");
        alert("Please select a project first");
        window.location.href = 'projects.html';
        return;
    }

    // Build WebSocket URL with token and project_id
    let wsUrl = getWsUrl("/ws");
    if (authToken) {
        wsUrl += "?token=" + authToken + "&project_id=" + encodeURIComponent(currentProjectId);
    } else {
        console.error("Cannot establish WebSocket: User not authenticated");
        alert("Please log in first");
        return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket connection established for project: " + currentProjectId);
        socketReady = true;
        if (pendingPrompt) {
            socket.send(pendingPrompt);
            pendingPrompt = null;
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Update message count if provided
        if (data.message_count !== undefined) {
            currentMessageCount = data.message_count;
            messageLimit = data.message_limit || messageLimit;
            updateMessageLimit();
        }
        
        // Handle different message types
        if (data.type === "typing" && data.is_typing) {
            // Handle typing indicator
            const speaker = data.speaker;
            const dots = data.dots || ".";
            
            if (!typingMessages[speaker]) {
                typingMessages[speaker] = true;
                addMessage(speaker, dots);
            } else {
                const lastMsg = chatContainer.lastElementChild;
                if (lastMsg && lastMsg.textContent.includes(speaker)) {
                    const textNode = Array.from(lastMsg.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.textContent = dots;
                    }
                }
            }
        } else if (data.type === "summary") {
            // Handle summary message
            addMessage("📝 Summary", data.message);
            displaySummary(data.message);
        } else if (data.type === "pause") {
            // Handle pause notification
            isPaused = true;
            document.getElementById('pauseBtn').classList.add('hidden');
            document.getElementById('resumeBtn').classList.remove('hidden');
            addMessage("System", data.message);
        } else if (data.type === "error") {
            // Handle error message
            addMessage("⚠️ Error", data.message);
        } else {
            // Handle regular message
            delete typingMessages[data.speaker];
            
            const lastMsg = chatContainer.lastElementChild;
            if (lastMsg && lastMsg.textContent.includes(data.speaker) && lastMsg.textContent.match(/^[.\s\w]+$/)) {
                const textNode = Array.from(lastMsg.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                if (textNode) {
                    textNode.textContent = data.message;
                }
                lastMsg.classList.remove("typing");
            } else {
                addMessage(data.speaker, data.message);
            }
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket connection closed.", event.code, event.reason);
        socketReady = false;
        
        // Handle different close codes
        let message = "Connection to server lost. Please refresh.";
        if (event.code === 1008) {
            // Policy violation - authentication or project validation failed
            if (event.reason === "Project ID required") {
                message = "No project selected. Please select a project first.";
                setTimeout(() => window.location.href = 'projects.html', 2000);
            } else if (event.reason === "Project not found or access denied") {
                message = "Project not found or you don't have access to it.";
                setTimeout(() => window.location.href = 'projects.html', 2000);
            } else if (event.reason === "Authentication required") {
                message = "Authentication required. Please log in first.";
                setTimeout(() => window.location.href = 'signin.html', 2000);
            } else if (event.reason === "Invalid token") {
                message = "Your session has expired. Please log in again.";
                setTimeout(() => window.location.href = 'signin.html', 2000);
            }
        }
        addMessage("System", message);
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
        addMessage("System", "Guest Mode: Limited to 25 messages. Sign in for full access.");
    }

    activateChatUI();
    addMessage("user", prompt);
    box.value = "";
    box.classList.remove("active");
    resetBoxSize(box);

    // Get selected agents
    const selectedAgents = getSelectedAgents();
    
    if (!currentProjectState.hasPrompt) {
        currentProjectState.hasPrompt = true;
        document.body.classList.add("project-started");

        // Mark debate as active
        isDebateActive = true;
        currentMessageCount = 0;
        
        // Set message limit based on user plan
        if (currentUser && currentUser.plan) {
            const planLimits = { "Free": 25, "Pro": 40, "Master": 80 };
            messageLimit = planLimits[currentUser.plan] || 25;
        } else {
            messageLimit = 25; // Default to free plan limit
        }
        
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) pauseBtn.classList.remove('hidden');
        
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) resumeBtn.classList.add('hidden');
        
        // Clear previous summaries
        const summaryList = document.getElementById('summaryList');
        if (summaryList) summaryList.innerHTML = '';
        const summarySection = document.getElementById('summarySection');
        if (summarySection) summarySection.classList.add('hidden');

        // Prepare message data with agents
        const messageData = JSON.stringify({
            topic: prompt,
            agents: selectedAgents,
            settings: getProjectSettingsPayload()
        });

        if (!socketReady) {
            pendingPrompt = messageData;
            setupWebSocket();
        } else {
            socket.send(messageData);
        }
    } else {
        const messageData = JSON.stringify({
            action: "user_message",
            message: prompt
        });

        if (!socketReady) {
            pendingPrompt = messageData;
            setupWebSocket();
        } else {
            socket.send(messageData);
        }
    }
}

function displaySummary(summaryText) {
    const summarySection = document.getElementById('summarySection');
    const summaryList = document.getElementById('summaryList');
    
    if (summarySection && summaryList) {
        summarySection.classList.remove('hidden');
        summaryList.textContent = summaryText;
    }
}

function setupPauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ action: 'pause' }));
                isPaused = true;
                pauseBtn.classList.add('hidden');
                resumeBtn.classList.remove('hidden');
            }
        });
    }
    
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ action: 'change_agents', agents: getSelectedAgents() }));
                socket.send(JSON.stringify({ action: 'resume' }));
                isPaused = false;
                pauseBtn.classList.remove('hidden');
                resumeBtn.classList.add('hidden');
            }
        });
    }
}

// Setup button event listener for both buttons
[loginPageBtn, mainAppBtn].forEach(btn => {
    btn.addEventListener("click", sendPrompt);
});
// ============================================
// PROJECT SETTINGS
// ============================================

function setupProjectSettings() {
    const messageSlider = document.getElementById('messageSlider');
    const messageCount = document.getElementById('messageCount');
    const webSearchCheckbox = document.getElementById('webSearchCheckbox');
    
    if (messageSlider && messageCount) {
        // Update the message count display when slider changes
        messageSlider.addEventListener('input', (e) => {
            messageCount.textContent = e.target.value;
            // Save to localStorage for persistence
            localStorage.setItem('messageSliderValue', e.target.value);
        });
        
        // Load saved value from localStorage
        const savedValue = localStorage.getItem('messageSliderValue');
        if (savedValue) {
            messageSlider.value = savedValue;
            messageCount.textContent = savedValue;
        }
    }
    
    if (webSearchCheckbox) {
        // Load saved state from localStorage
        const savedState = localStorage.getItem('webSearchEnabled');
        if (savedState !== null) {
            webSearchCheckbox.checked = savedState === 'true';
        }
        
        // Save state when checkbox changes
        webSearchCheckbox.addEventListener('change', (e) => {
            localStorage.setItem('webSearchEnabled', e.target.checked);
        });
    }
}

function getProjectSettingsPayload() {
    const messageSlider = document.getElementById('messageSlider');
    const webSearchCheckbox = document.getElementById('webSearchCheckbox');

    return {
        message_count: messageSlider ? Number(messageSlider.value) : null,
        web_search_enabled: webSearchCheckbox ? webSearchCheckbox.checked : false
    };
}

// Setup button event listener for both buttons
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
var activeAgents = new Set(['cfo', 'ops', 'mkt', 'dev']);

function toggleAgent(btn) {
    const agent = btn.dataset.agent;
    if (activeAgents.has(agent)) {
        if (activeAgents.size === 1) return;  // Must keep at least one agent
        activeAgents.delete(agent);
        btn.className = 'agent-toggle';
    } else {
        activeAgents.add(agent);
        btn.className = `agent-toggle active-${agent}`;
    }
}

function setupAgentToggles() {
    const agentButtons = document.querySelectorAll('.agent-toggle');
    agentButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            toggleAgent(this);
        });
    });
}

function initializePage() {
    console.log("Initializing page");
    console.log("debatePage element:", debatePage);
    
    // Make sure debate page is shown by default
    if (debatePage) {
        debatePage.classList.add("active");
        console.log("Debate page classList:", debatePage.classList);
        console.log("Debate page display check:", window.getComputedStyle(debatePage).display);
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
    loadProjectFromUrl();
    setupAgentToggles();  // Setup agent toggle button handlers
    setupPauseButton();  // Setup pause/resume button handlers
    setupProjectSettings();  // Setup message slider and web search checkbox
});

// ============================================
// PROJECT INITIALIZATION FROM URL
// ============================================

let currentProjectId = null;

function restoreProjectHistory(projectData) {
    if (!projectData) {
        return;
    }

    const messages = Array.isArray(projectData.messages) ? projectData.messages : [];

    activateChatUI();
    document.body.classList.add("project-started");
    chatContainer.innerHTML = "";

    const summaryList = document.getElementById('summaryList');
    const summarySection = document.getElementById('summarySection');
    if (summaryList) summaryList.innerHTML = '';
    if (summarySection) summarySection.classList.add('hidden');

    messages.forEach(entry => {
        if (!entry || !entry.message) {
            return;
        }
        const speaker = entry.speaker || "System";
        addMessage(speaker, entry.message);
    });

    if (projectData.summary) {
        displaySummary(projectData.summary);
    }
}

function loadProjectFromUrl() {
    // Extract projectId from hash (e.g., #/project/[projectId])
    const hash = window.location.hash;
    console.log("Current hash:", hash);
    const match = hash.match(/#\/project\/(.+)$/);
    
    console.log("Match result:", match);
    
    if (match && match[1]) {
        currentProjectId = match[1];
        console.log("Project ID found:", currentProjectId);
        loadProjectDetails(currentProjectId);
    } else if (localStorage.getItem('currentProjectId')) {
        // Fallback to localStorage for backward compatibility
        currentProjectId = localStorage.getItem('currentProjectId');
        console.log("Project ID from localStorage:", currentProjectId);
        loadProjectDetails(currentProjectId);
    } else {
        // No project selected - redirect to projects page
        console.log("No project ID found, redirecting to projects page");
        window.location.href = 'projects.html';
    }
}

async function loadProjectDetails(projectId) {
    const token = localStorage.getItem('authToken');
    
    if (!token || !projectId) {
        console.log("No token or projectId, blocking project load");
        showAccessDenied("You must be signed in to open this project.");
        return;
    }

    try {
        console.log("Attempting to fetch project details for:", projectId);
        const response = await fetch(getApiUrl(`/projects/${projectId}`), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            }
        });

        console.log("Fetch response status:", response.status);
        
        if (response.status === 401) {
            clearAuthSession();
            showAccessDenied("Your session expired. Please sign in again.");
            return;
        }

        if (response.status === 403) {
            showAccessDenied("You do not have access to this project.");
            return;
        }

        if (response.status === 404) {
            showAccessDenied("Project not found or access denied.");
            return;
        }

        if (!response.ok) {
            showAccessDenied("Unable to load this project right now.");
            return;
        }

        const data = await response.json();
        console.log("Project data received:", data);
        const projectNameEl = document.getElementById('projectName');
        
        if (projectNameEl && data.name) {
            projectNameEl.textContent = `Project: ${data.name}`;
        }
        
        const getFileExtension = (value) => {
            const text = String(value || "");
            const dotIndex = text.lastIndexOf(".");
            if (dotIndex > 0 && dotIndex < text.length - 1) {
                return text.slice(dotIndex + 1);
            }
            return "";
        };

        const getFileDisplayName = (file) => {
            if (typeof file === "string") {
                return file;
            }

            if (!file || typeof file !== "object") {
                return "Unnamed file";
            }

            const rawName = file.original_name || file.name || file.stored_name || "";
            if (rawName) {
                return rawName;
            }

            const ext = file.extension || file.ext || getFileExtension(rawName);
            if (ext) {
                return `.${ext}`;
            }

            return "Unnamed file";
        };

        // Populate uploaded files list
        const filesList = document.getElementById('uploadedFilesList');
        if (filesList && data.files && Array.isArray(data.files)) {
            if (data.files.length > 0) {
                filesList.innerHTML = data.files.map(file => {
                    const label = getFileDisplayName(file);
                    return `<div class="fileItem">📄 ${escapeHtml(String(label))}</div>`;
                }).join('');
            } else {
                filesList.innerHTML = '<p style="color: var(--text3); font-size: 13px; padding: 16px;">No files uploaded</p>';
            }
        }

        currentProjectState = { hasPrompt: Boolean(data.has_prompt) };
        if (currentProjectState.hasPrompt) {
            restoreProjectHistory(data);
        } else {
            document.body.classList.remove("project-started");
        }
    } catch (error) {
        console.error('Error loading project details:', error);
        showAccessDenied("Unable to verify access to this project.");
    }
}