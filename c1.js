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
    const rawUser = localStorage.getItem("currentUser") || localStorage.getItem("user") || sessionStorage.getItem("currentUser") || sessionStorage.getItem("user");
    if (!rawUser) {
        return null;
    }

    try {
        return JSON.parse(rawUser);
    } catch (e) {
        console.error("Failed to parse stored user", e);
        return { name: rawUser };
    }
}

// Check if user is already logged in (from URL params or localStorage)
function initializeAuth() {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token") || params.get("access_token");
    const userFromUrl = params.get("user");
    
    const storedToken = tokenFromUrl || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    authToken = storedToken;
    
    if (tokenFromUrl) {
        localStorage.setItem("authToken", tokenFromUrl);
        sessionStorage.setItem("authToken", tokenFromUrl);
        try {
            const parsedUser = JSON.parse(userFromUrl || '{}');
            currentUser = parsedUser;
            if (parsedUser) {
                localStorage.setItem("currentUser", JSON.stringify(parsedUser));
                sessionStorage.setItem("currentUser", JSON.stringify(parsedUser));
            }
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Failed to parse user data", e);
        }
    } else {
        currentUser = getStoredUser();
    }
    
    // Show main app if authenticated or in test mode, otherwise show login page
    if (authToken) {
        if (!currentUser) {
            const storedUser = localStorage.getItem("currentUser") || localStorage.getItem("user") || sessionStorage.getItem("currentUser") || sessionStorage.getItem("user");
            if (storedUser) {
                try {
                    currentUser = JSON.parse(storedUser);
                } catch (e) {
                    currentUser = { name: storedUser };
                }
            }
        }
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
    const token = response.credential;
    
    if (!token) {
        console.error("No credential received from Google");
        alert("Failed to get credentials from Google. Please try again.");
        return;
    }
    
    console.log("Google token received, sending to server...");
    
    fetch(getApiUrl("/auth/google"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ token })
    })
    .then(res => {
        if (!res.ok) {
            return res.text().then(text => {
                throw new Error(`HTTP ${res.status}: ${text}`);
            });
        }
        return res.json();
    })
    .then(data => {
        if (data.access_token) {
            authToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem("authToken", authToken);
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            showMainApp();
        } else {
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

const loginPageBox = document.querySelector(".loginPage textarea#promptBox");
const mainAppBox = document.querySelector(".main textarea#promptBox");
const loginPageBtn = document.querySelector(".loginPage button#sendBtn");
const mainAppBtn = document.querySelector(".main button#sendBtn");
const chatContainer = document.getElementById("chatContainer");

// ============================================
// MESSAGE PERSISTENCE
// ============================================

function getChatStorageKey() {
    const projectId = currentProjectId || "default_project";
    return `chat_history_${projectId}`;
}

function saveMessageToStorage(sender, text, messageType = "message") {
    try {
        const storageKey = getChatStorageKey();
        const messages = JSON.parse(localStorage.getItem(storageKey) || "[]");
        
        messages.push({
            sender: sender,
            text: text,
            messageType: messageType,
            timestamp: new Date().toISOString()
        });
        
        if (messages.length > 500) {
            messages.splice(0, messages.length - 500);
        }
        
        localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
        console.error("Failed to save message to storage:", e);
    }
}

function loadMessagesFromStorage() {
    try {
        const storageKey = getChatStorageKey();
        const messages = JSON.parse(localStorage.getItem(storageKey) || "[]");
        
        chatContainer.innerHTML = "";
        
        messages.forEach(msg => {
            const msg_elem = document.createElement("div");
            const senderSpan = document.createElement("span");
            senderSpan.className = "senderLabel";
            
            let senderClass = "botMsg";
            let senderName = msg.sender;

            if (msg.sender === "user") {
                senderClass = "userMsg";
                senderName = "You";
            } else if (msg.sender === "System") {
                senderClass = "systemMsg";
                senderName = "System";
            } else {
                senderClass = "agentMsg";
                senderName = msg.sender || "Qweet";
            }

            senderSpan.innerText = senderName;
            msg_elem.className = senderClass;
            msg_elem.dataset.messageType = msg.messageType;
            msg_elem.dataset.speaker = msg.sender;
            msg_elem.innerHTML = formatGeneratedText(msg.text);
            msg_elem.prepend(senderSpan);

            if (msg.text && msg.text.match(/^\.+$/)) {
                msg_elem.classList.add("typing");
            }

            chatContainer.appendChild(msg_elem);
        });
        
        window.scrollTo(0, document.body.scrollHeight);
        
        return messages.length > 0;
    } catch (e) {
        console.error("Failed to load messages from storage:", e);
        return false;
    }
}

function clearChatHistory() {
    try {
        const storageKey = getChatStorageKey();
        localStorage.removeItem(storageKey);
        chatContainer.innerHTML = "";
    } catch (e) {
        console.error("Failed to clear chat history:", e);
    }
}

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

function activateChatUI() {
    if (chatStarted) return;
    chatStarted = true;
    loginPage.classList.add("hidden");
    mainApp.classList.remove("hidden");
    document.body.classList.add("chat-mode");
    chatContainer.classList.remove("hidden");

    const hasMessages = loadMessagesFromStorage();
    if (hasMessages) {
        console.log("Loaded previous chat history from storage");
    }
}

function addMessage(sender, text, messageType = "message") {
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
        senderName = "System";
    } else if (sender === "Summary") {
        senderClass = "summaryMsg";
        senderName = "Summary";
    } else if (sender === "Qweet" || sender === "QWEET") {
        senderClass = "qweetMsg";
        senderName = "Qweet";
    } else {
        senderClass = "agentMsg";
        senderName = sender || "Agent";
    }

    senderSpan.innerText = senderName;
    msg.className = senderClass;
    msg.dataset.messageType = messageType;
    msg.dataset.speaker = sender;
    msg.innerHTML = formatGeneratedText(text);
    msg.prepend(senderSpan);

    if (text.match(/^\.+$/)) {
        msg.classList.add("typing");
    }

    chatContainer.appendChild(msg);
    window.scrollTo(0, document.body.scrollHeight);
    
    saveMessageToStorage(sender, text, messageType);
}

function updateMessageElement(element, sender, text, typing = false) {
    if (!element) {
        return;
    }

    const senderSpan = element.querySelector('.senderLabel');
    element.innerHTML = '';
    if (senderSpan) {
        element.appendChild(senderSpan);
    } else {
        const newSenderSpan = document.createElement('span');
        newSenderSpan.className = 'senderLabel';
        newSenderSpan.innerText = sender || 'Qweet';
        element.appendChild(newSenderSpan);
    }

    element.dataset.speaker = sender || 'Qweet';
    element.insertAdjacentHTML('beforeend', formatGeneratedText(text));
    element.classList.toggle('typing', typing);
}

// ============================================
// WEBSOCKET HANDLING
// ============================================

let socket;
let socketReady = false;
let pendingPrompt = null;
let typingMessages = {};
let isDebateActive = false;
let currentMessageCount = 0;
let messageLimit = 0;
let isPaused = false;
let currentProjectState = { hasPrompt: false };
let promptSettingsLocked = false;
let currentDebateStatus = "Idle";

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
}

function formatGeneratedText(text) {
    const escaped = escapeHtml(text);
    const doubleTokens = [];
    const withDoubleTokens = escaped.replace(/\*\*([\s\S]+?)\*\*/g, (_, inner) => {
        const token = `__DOUBLE_TOKEN_${doubleTokens.length}__`;
        doubleTokens.push(inner);
        return token;
    });

    let formatted = withDoubleTokens.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<strong class="inline-strong">$1</strong>');

    doubleTokens.forEach((inner, index) => {
        formatted = formatted.replace(`__DOUBLE_TOKEN_${index}__`, `<strong class="double-strong">${inner}</strong>`);
    });

    return formatted.replace(/\n/g, '<br>');
}

function syncDebateControls(status) {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    currentDebateStatus = status;
    isDebateActive = status === 'Running' || status === 'Paused';
    setDebateStatus(status);

    if (status === 'Paused') {
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (resumeBtn) resumeBtn.classList.remove('hidden');
        return;
    }

    if (status === 'Completed' || status === 'Idle' || status === 'Disconnected') {
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (resumeBtn) resumeBtn.classList.add('hidden');
        return;
    }

    if (pauseBtn) pauseBtn.classList.remove('hidden');
    if (resumeBtn) resumeBtn.classList.add('hidden');
}

function setDebateStatus(text) {
    const statusEl = document.getElementById('debateStatus');
    const iconEl = document.getElementById('debateStatusIcon');
    if (statusEl) statusEl.textContent = text;
    if (iconEl) {
        const normalized = String(text || '').trim();
        if (normalized === 'searching' || normalized === 'Searching Web' || normalized === 'Searching') {
            iconEl.src = 'web.gif';
            iconEl.style.display = 'inline-block';
        } else if (normalized === 'thinking' || normalized === 'Thinking') {
            iconEl.src = 'loading.gif';
            iconEl.style.display = 'inline-block';
        } else if (normalized === 'debating' || normalized === 'Debating') {
            iconEl.src = 'debate.gif';
            iconEl.style.display = 'inline-block';
        } else {
            iconEl.style.display = 'none';
        }
    }
}

function getSelectedAgents() {
    const mapping = {
        cfo: "CFO Agent",
        ops: "Operations Agent",
        mkt: "Market Agent",
        dev: "Devil's Advocate"
    };

    return Array.from(activeAgents).map(key => mapping[key]).filter(Boolean);
}

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    if (!currentProjectId) {
        console.error("Cannot establish WebSocket: No project selected");
        alert("Please select a project first");
        window.location.href = 'projects.html';
        return;
    }

    let wsUrl = getWsUrl("/ws/" + encodeURIComponent(currentProjectId));
    if (authToken) {
        wsUrl += "?token=" + encodeURIComponent(authToken);
    } else {
        console.error("Cannot establish WebSocket: User not authenticated");
        alert("Please log in first");
        return;
    }

    console.log("Connecting to WebSocket:", wsUrl);

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
        
        if (data.message_count !== undefined) {
            currentMessageCount = data.message_count;
            messageLimit = data.message_limit || messageLimit;
            updateMessageLimit();
        }
        
        const eventType = data.type || "message";
        
        switch (eventType) {
            case "connected":
                // Connection established with file info
                syncDebateControls("Idle");
                if (data.has_file) {
                    addMessage("System", "📁 File data loaded. You can ask questions about your data.");
                }
                break;

            case "status":
                syncDebateControls(data.status || "Running");
                break;
            
            case "web_results":
                // Display web search results
                displayWebResults(data);
                break;
            
            case "tool_executing":
                // Show tool execution status
                const toolName = data.tool || "tool";
                const toolStatus = data.status || "executing";
                addMessage("System", `🔧 ${toolName}: ${toolStatus}`);
                syncDebateControls(toolStatus);
                break;
            
            case "typing":
                if (data.is_typing) {
                    const speaker = data.speaker || "Qweet";
                    const dots = data.dots || ".";
                    
                    if (!typingMessages[speaker]) {
                        addMessage(speaker, dots, "typing");
                        typingMessages[speaker] = chatContainer.lastElementChild;
                    } else {
                        updateMessageElement(typingMessages[speaker], speaker, dots, true);
                    }
                }
                break;
            
            case "message":
                const typingElement = typingMessages[data.speaker];
                if (typingElement) {
                    updateMessageElement(typingElement, data.speaker, data.message, false);
                    delete typingMessages[data.speaker];
                } else {
                    addMessage(data.speaker || "Qweet", data.message, "message");
                }
                break;

            case "reasoning":
                // Show reasoning in a collapsible format
                addMessage("Qweet (thinking)", data.message || "", "reasoning");
                break;
            
            case "file_context":
                // Display file data
                displayFileContext(data);
                break;
            
            case "file_refreshed":
                addMessage("System", `📁 File context ${data.has_file ? 'loaded' : 'not available'}`);
                break;
            
            case "discussion_complete":
                syncDebateControls("Completed");
                addMessage("System", "✅ Discussion complete");
                break;
            
            case "error":
                console.error('Server error:', data.message);
                addMessage("System", "❌ Error: " + data.message);
                break;
            
            default:
                // Unknown message type - try to display as message
                if (data.message) {
                    addMessage(data.speaker || "Qweet", data.message, "message");
                }
                break;
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket connection closed.", event.code, event.reason);
        socketReady = false;
        if (currentDebateStatus !== "Completed" && currentDebateStatus !== "Paused") {
            syncDebateControls("Disconnected");
        }
        
        let message = "Connection to server lost. Please refresh.";
        if (event.code === 1008) {
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

function displayWebResults(data) {
    // Show web results in the chat
    if (data.results) {
        let resultText = "🌐 Web Search Results:\n\n";
        if (typeof data.results === 'object') {
            Object.entries(data.results).forEach(([query, content]) => {
                resultText += `Query: "${query}"\n${content}\n\n`;
            });
        } else {
            resultText += data.results;
        }
        addMessage("Qweet", resultText, "web_results");
    }
    
    // Update web sources panel
    if (data.sources) {
        displayWebSources(data.sources);
    }
}

function displayFileContext(data) {
    if (data.data && data.data !== "No file data") {
        addMessage("System", "📁 File data loaded successfully");
        // Show a preview of the data
        try {
            const jsonData = JSON.parse(data.data);
            if (jsonData.dataset) {
                const preview = `📊 File contains ${jsonData.dataset.rows || 0} rows and ${jsonData.dataset.columns || 0} columns`;
                addMessage("Qweet", preview, "file_preview");
            }
        } catch (e) {
            // Not JSON, just show raw preview
            const preview = data.data.substring(0, 200) + "...";
            addMessage("Qweet", `📁 File data: ${preview}`, "file_preview");
        }
    } else {
        addMessage("System", "📁 No file data available");
    }
}

function updateMessageLimit() {
    const limitEl = document.getElementById('messageLimit');
    if (!limitEl || !isDebateActive) return;
    
    if (currentMessageCount >= messageLimit) {
        limitEl.textContent = ` ⚠️ Limit reached (${currentMessageCount}/${messageLimit})`;
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

// ============================================
// SEND PROMPT
// ============================================

async function sendPrompt() {
    const box = getActiveBox();
    const prompt = box.value.trim();

    if (!prompt) {
        return;
    }

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

    if (!socketReady) {
        const messageData = JSON.stringify({
            type: "user_message",
            message: prompt
        });
        pendingPrompt = messageData;
        setupWebSocket();
    } else {
        socket.send(JSON.stringify({
            type: "user_message",
            message: prompt
        }));
    }
}

// ============================================
// UI SETUP
// ============================================

function setupPauseButton() {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'pause' }));
                isPaused = true;
                syncDebateControls("Paused");
            }
        });
    }
    
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'resume' }));
                isPaused = false;
                syncDebateControls("Running");
            }
        });
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

var activeAgents = new Set(['cfo', 'ops', 'mkt', 'dev']);

function toggleAgent(btn) {
    const agent = btn.dataset.agent;
    if (activeAgents.has(agent)) {
        if (activeAgents.size === 1) return;
        activeAgents.delete(agent);
        btn.className = 'agent-toggle';
    } else {
        activeAgents.add(agent);
        btn.className = `agent-toggle active-${agent}`;
    }
}

// ============================================
// PROJECT INITIALIZATION
// ============================================

let currentProjectId = null;

function loadProjectFromUrl() {
    const hash = window.location.hash;
    console.log("Current hash:", hash);
    const match = hash.match(/#\/project\/(.+)$/);
    
    if (match && match[1]) {
        currentProjectId = match[1];
        console.log("Project ID found:", currentProjectId);
        loadProjectDetails(currentProjectId);
    } else if (localStorage.getItem('currentProjectId')) {
        currentProjectId = localStorage.getItem('currentProjectId');
        console.log("Project ID from localStorage:", currentProjectId);
        loadProjectDetails(currentProjectId);
    } else {
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
        const response = await fetch(getApiUrl(`/projects/${projectId}`), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true'
            }
        });

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

        // Populate uploaded files list
        const filesList = document.getElementById('uploadedFilesList');
        if (filesList && data.files && Array.isArray(data.files)) {
            if (data.files.length > 0) {
                filesList.innerHTML = data.files.map(file => {
                    const label = file.original_name || file.name || "Unnamed file";
                    return `
                        <div class="fileItem">
                            <div class="fileName">📄 ${escapeHtml(String(label))}</div>
                        </div>
                    `;
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
            syncDebateControls("Idle");
        }
    } catch (error) {
        console.error('Error loading project details:', error);
        showAccessDenied("Unable to verify access to this project.");
    }
}

function restoreProjectHistory(projectData) {
    if (!projectData) {
        return;
    }

    activateChatUI();
    document.body.classList.add("project-started");
    
    const hasLocalMessages = loadMessagesFromStorage();
    
    if (!hasLocalMessages) {
        const messages = Array.isArray(projectData.messages) ? projectData.messages : [];
        messages.forEach(entry => {
            if (!entry || !entry.message) return;
            const speaker = entry.speaker || "System";
            addMessage(speaker, entry.message);
        });
    }

    syncDebateControls("Completed");
    destroyPromptSettings();
}

// ============================================
// DISPLAY HELPERS
// ============================================

function displayWebSources(sources) {
    const list = document.getElementById('webSourcesList');
    if (!list) return;
    list.innerHTML = '';
    if (!sources || sources.length === 0) {
        list.innerHTML = '<p style="color: var(--text3); font-size: 13px; padding: 16px;">No web sources yet</p>';
        return;
    }

    sources.forEach(s => {
        const item = document.createElement('div');
        item.className = 'webSourceItem';
        const title = s.title || s.url || 'Source';
        const url = s.url || '#';
        item.innerHTML = `<a href="${url}" target="_blank" rel="noreferrer noopener">${escapeHtml(title)}</a>`;
        list.appendChild(item);
    });
}

function destroyPromptSettings() {
    if (promptSettingsLocked) return;
    const generationCard = document.getElementById('generationLimitCard');
    if (generationCard) {
        generationCard.remove();
    }
    promptSettingsLocked = true;
}

// ============================================
// INITIALIZATION
// ============================================

[loginPageBtn, mainAppBtn].forEach(btn => {
    btn.addEventListener("click", sendPrompt);
});

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM Content Loaded");
    initializeAuth();
    loadProjectFromUrl();
    setupAgentToggles();
    setupPauseButton();
});