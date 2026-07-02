// ============================================
// AUTHENTICATION SETUP
// ============================================

const loginPage = document.getElementById("loginPage");
const mainApp = document.querySelector(".main");
const logoutBtn = document.getElementById("logoutBtn");
const userNameEl = document.getElementById("userName");

let authToken = null;
let currentUser = null;
let currentProjectId = null;

// ============================================
// TWO COUNTERS
// ============================================

// Counter 1: Main - counts ALL messages (plan limit)
let totalMessagesUsed = 0;
let planMessageLimit = 25;

// Counter 2: Debate - counts ONLY debate agent messages (user sets limit)
let debateMessagesUsed = 0;
let debateMessageLimit = 12;
let isDebateActive = false;
let pendingDebateRequest = null;

const planLimits = {
    "Free": 25,
    "Pro": 40,
    "Master": 80
};

function getUserPlan() {
    return (currentUser && currentUser.plan) || "Free";
}

function getPlanLimit() {
    return planLimits[getUserPlan()] || 25;
}

function updateMessageDisplay() {
    const usageEl = document.getElementById('messageUsage');
    if (usageEl) {
        const remaining = planMessageLimit - totalMessagesUsed;
        usageEl.textContent = `Messages: ${totalMessagesUsed} / ${planMessageLimit}`;
        if (totalMessagesUsed >= planMessageLimit) {
            usageEl.style.color = '#ff6b6b';
        } else {
            usageEl.style.color = '';
        }
    }
}

// ============================================
// PERMISSION MODAL - Only for debate
// ============================================

function showDebatePermission() {
    const modal = document.getElementById('permissionModal');
    const details = document.getElementById('permissionDetails');
    const planLimitDisplay = document.getElementById('planLimitDisplay');
    
    planLimitDisplay.textContent = planMessageLimit;
    
    const input = document.getElementById('debateMessageCount');
    input.value = 12;
    input.max = 80;
    
    modal.classList.add('active');
}

function cancelDebate() {
    document.getElementById('permissionModal').classList.remove('active');
    pendingDebateRequest = null;
    addMessage("System", "Debate cancelled.");
}

function startDebate() {
    const input = document.getElementById('debateMessageCount');
    debateMessageLimit = parseInt(input.value) || 12;
    
    document.getElementById('permissionModal').classList.remove('active');
    
    if (pendingDebateRequest && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "debate_permission_response",
            allow: true,
            debate_limit: debateMessageLimit,
            message: pendingDebateRequest
        }));
        pendingDebateRequest = null;
        isDebateActive = true;
        debateMessagesUsed = 0;
        syncDebateControls("Running");
    }
}

// ============================================
// CHAT FUNCTIONS
// ============================================

const loginPageBox = document.querySelector(".loginPage textarea#promptBox");
const mainAppBox = document.querySelector(".main textarea#promptBox");
const loginPageBtn = document.querySelector(".loginPage button#sendBtn");
const mainAppBtn = document.querySelector(".main button#sendBtn");
const chatContainer = document.getElementById("chatContainer");

let chatStarted = false;
let resizeFrame = 0;

function getChatStorageKey() {
    return `chat_${currentProjectId || "default"}`;
}

function getCountStorageKey() {
    return `counts_${currentProjectId || "default"}`;
}

function saveToStorage() {
    try {
        localStorage.setItem(getCountStorageKey(), JSON.stringify({
            totalMessagesUsed: totalMessagesUsed,
            debateMessagesUsed: debateMessagesUsed,
            debateMessageLimit: debateMessageLimit,
            isDebateActive: isDebateActive
        }));
    } catch (e) {}
}

function loadFromStorage() {
    try {
        const data = localStorage.getItem(getCountStorageKey());
        if (data) {
            const parsed = JSON.parse(data);
            totalMessagesUsed = parsed.totalMessagesUsed || 0;
            debateMessagesUsed = parsed.debateMessagesUsed || 0;
            debateMessageLimit = parsed.debateMessageLimit || 12;
            isDebateActive = parsed.isDebateActive || false;
            return true;
        }
    } catch (e) {}
    return false;
}

function loadMessages() {
    try {
        const messages = JSON.parse(localStorage.getItem(getChatStorageKey()) || "[]");
        chatContainer.innerHTML = "";
        messages.forEach(msg => {
            const el = document.createElement("div");
            const label = document.createElement("span");
            label.className = "senderLabel";
            
            let cls = "agentMsg";
            let name = msg.sender || "Qweet";
            
            if (msg.sender === "user") {
                cls = "userMsg";
                name = "You";
            } else if (msg.sender === "System") {
                cls = "systemMsg";
                name = "System";
            }
            
            label.innerText = name;
            el.className = cls;
            el.innerHTML = formatText(msg.text);
            el.prepend(label);
            chatContainer.appendChild(el);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messages.length > 0;
    } catch (e) { return false; }
}

function saveMessage(sender, text) {
    try {
        const messages = JSON.parse(localStorage.getItem(getChatStorageKey()) || "[]");
        messages.push({ sender, text, timestamp: new Date().toISOString() });
        if (messages.length > 500) messages.splice(0, messages.length - 500);
        localStorage.setItem(getChatStorageKey(), JSON.stringify(messages));
    } catch (e) {}
}

function addMessage(sender, text) {
    // Check main counter for ALL messages
    if (sender !== "user" && sender !== "System") {
        if (totalMessagesUsed >= planMessageLimit) {
            addMessage("System", `Plan limit reached (${planMessageLimit} messages). Upgrade to continue.`);
            return;
        }
        totalMessagesUsed++;
        saveToStorage();
        updateMessageDisplay();
    }
    
    const el = document.createElement("div");
    const label = document.createElement("span");
    label.className = "senderLabel";
    
    let cls = "agentMsg";
    let name = sender || "Qweet";
    
    if (sender === "user") {
        cls = "userMsg";
        name = "You";
    } else if (sender === "System") {
        cls = "systemMsg";
        name = "System";
    }
    
    label.innerText = name;
    el.className = cls;
    el.innerHTML = formatText(text);
    el.prepend(label);
    chatContainer.appendChild(el);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    
    saveMessage(sender, text);
}

function addDebateMessage(sender, text) {
    // Check debate counter for debate agent messages
    if (isDebateActive && sender !== "user" && sender !== "System") {
        if (debateMessagesUsed >= debateMessageLimit) {
            addMessage("System", `⚠️ Debate limit reached (${debateMessageLimit} messages).`);
            isDebateActive = false;
            return;
        }
        debateMessagesUsed++;
        saveToStorage();
    }
    
    // This also counts towards main counter
    addMessage(sender, text);
}

function formatText(text) {
    const escaped = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const withStrong = escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
    return withStrong.replace(/\n/g, '<br>');
}

function activateChatUI() {
    if (chatStarted) return;
    chatStarted = true;
    
    loginPage.classList.add("hidden");
    mainApp.classList.remove("hidden");
    document.body.classList.add("chat-mode");
    chatContainer.classList.remove("hidden");
    chatContainer.style.display = "flex";
    
    loadFromStorage();
    planMessageLimit = getPlanLimit();
    loadMessages();
    updateMessageDisplay();
}

// ============================================
// WEBSOCKET
// ============================================

let socket;
let socketReady = false;
let pendingPrompt = null;
let typingMessages = {};
let currentStatus = "Idle";

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    if (!currentProjectId) {
        window.location.href = 'projects.html';
        return;
    }

    let wsUrl = getWsUrl("/ws/" + encodeURIComponent(currentProjectId));
    if (authToken) {
        wsUrl += "?token=" + encodeURIComponent(authToken);
    } else {
        alert("Please log in");
        return;
    }

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        socketReady = true;
        if (pendingPrompt) {
            socket.send(pendingPrompt);
            pendingPrompt = null;
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const type = data.type || "message";
        
        switch (type) {
            case "connected":
                setStatus("Idle");
                if (data.message_limit) {
                    planMessageLimit = data.message_limit;
                    updateMessageDisplay();
                }
                if (data.has_file) {
                    addMessage("System", "File loaded");
                }
                break;

            case "status":
                setStatus(data.status || "Running");
                break;
            
            case "debate_permission":
                // Qweet wants to debate - show permission dialog
                pendingDebateRequest = data.message || "Start debate?";
                showDebatePermission();
                break;
            
            case "message":
                const speaker = data.speaker || "Qweet";
                // If debate is active and this is an agent, count it
                if (isDebateActive && speaker !== "user" && speaker !== "System") {
                    addDebateMessage(speaker, data.message);
                } else {
                    addMessage(speaker, data.message);
                }
                break;
            
            case "discussion_complete":
                setStatus("Completed");
                isDebateActive = false;
                addMessage("System", "✅ Debate complete");
                break;
            
            case "error":
                addMessage("System", "❌ " + data.message);
                break;
            
            default:
                if (data.message) {
                    addMessage(data.speaker || "Qweet", data.message);
                }
                break;
        }
    };

    socket.onclose = () => {
        socketReady = false;
        setStatus("Disconnected");
    };
}

function setStatus(text) {
    const el = document.getElementById('debateStatus');
    if (el) el.textContent = text;
    
    const icon = document.getElementById('debateStatusIcon');
    if (icon) {
        if (text === 'Searching' || text === 'searching') {
            icon.src = 'web.gif';
            icon.style.display = 'inline-block';
        } else if (text === 'Thinking' || text === 'thinking') {
            icon.src = 'loading.gif';
            icon.style.display = 'inline-block';
        } else if (text === 'Running' || text === 'debating') {
            icon.src = 'debate.gif';
            icon.style.display = 'inline-block';
        } else {
            icon.style.display = 'none';
        }
    }
}

function syncDebateControls(status) {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    
    setStatus(status);
    
    if (status === 'Paused') {
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.remove('hidden');
    } else if (status === 'Running') {
        pauseBtn.classList.remove('hidden');
        resumeBtn.classList.add('hidden');
    } else {
        pauseBtn.classList.add('hidden');
        resumeBtn.classList.add('hidden');
    }
}

// ============================================
// SEND PROMPT
// ============================================

function sendPrompt() {
    const box = loginPageBox.offsetParent !== null ? loginPageBox : mainAppBox;
    const prompt = box.value.trim();
    if (!prompt) return;
    
    // Check main counter
    if (totalMessagesUsed >= planMessageLimit) {
        alert(`Plan limit reached (${planMessageLimit} messages). Upgrade to continue.`);
        return;
    }
    
    activateChatUI();
    addMessage("user", prompt);
    box.value = "";
    box.style.width = "420px";
    box.style.fontSize = "26px";
    box.style.height = "60px";
    box.classList.remove("active");
    
    if (!socketReady) {
        pendingPrompt = JSON.stringify({ type: "user_message", message: prompt });
        setupWebSocket();
    } else {
        socket.send(JSON.stringify({ type: "user_message", message: prompt }));
    }
}

// ============================================
// UI SETUP
// ============================================

function setupPauseButton() {
    document.getElementById('pauseBtn').addEventListener('click', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'pause' }));
            syncDebateControls("Paused");
        }
    });
    
    document.getElementById('resumeBtn').addEventListener('click', () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'resume' }));
            syncDebateControls("Running");
        }
    });
}

// ============================================
// PROJECT LOADING
// ============================================

function loadProjectFromUrl() {
    const hash = window.location.hash;
    const match = hash.match(/#\/project\/(.+)$/);
    
    if (match && match[1]) {
        currentProjectId = match[1];
        loadProjectDetails(currentProjectId);
    } else if (localStorage.getItem('currentProjectId')) {
        currentProjectId = localStorage.getItem('currentProjectId');
        loadProjectDetails(currentProjectId);
    } else {
        window.location.href = 'projects.html';
    }
}

async function loadProjectDetails(projectId) {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (!token) {
        showAccessDenied("Please sign in.");
        return;
    }

    try {
        const response = await fetch(getApiUrl(`/projects/${projectId}`), {
            headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
        });

        if (response.status === 401) {
            clearAuthSession();
            showAccessDenied("Session expired.");
            return;
        }

        if (!response.ok) {
            showAccessDenied("Project not found.");
            return;
        }

        const data = await response.json();
        
        document.getElementById('projectName').textContent = `Project: ${data.name || 'Untitled'}`;
        
        // Load files
        const filesList = document.getElementById('uploadedFilesList');
        if (data.files && data.files.length > 0) {
            filesList.innerHTML = data.files.map(f => 
                `<div class="fileItem"><div class="fileName">📄 ${escapeHtml(f.original_name || f.name)}</div></div>`
            ).join('');
        }
        
        loginPage.classList.add("hidden");
        mainApp.classList.remove("hidden");
        
        activateChatUI();
        
        // Load message count from backend
        if (data.message_count !== undefined) {
            totalMessagesUsed = data.message_count || 0;
            updateMessageDisplay();
            saveToStorage();
        }
        
        setStatus("Idle");
        
    } catch (error) {
        showAccessDenied("Error loading project.");
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
}

// ============================================
// AUTH
// ============================================

function getStoredUser() {
    try {
        const raw = localStorage.getItem("currentUser") || localStorage.getItem("user");
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function initializeAuth() {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get("token");
    
    authToken = tokenFromUrl || localStorage.getItem("authToken") || sessionStorage.getItem("authToken");
    
    if (tokenFromUrl) {
        localStorage.setItem("authToken", tokenFromUrl);
        sessionStorage.setItem("authToken", tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (authToken) {
        currentUser = getStoredUser();
        if (currentUser) {
            userNameEl.textContent = currentUser.name || "User";
        }
        loginPage.classList.add("hidden");
        mainApp.classList.remove("hidden");
        planMessageLimit = getPlanLimit();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    loginPage.classList.remove("hidden");
    mainApp.classList.add("hidden");
    document.getElementById("debatePage").classList.remove("active");
}

function showAccessDenied(msg) {
    document.getElementById("accessDeniedMessage").textContent = msg;
    document.getElementById("accessDenied").classList.remove("hidden");
    loginPage.classList.add("hidden");
    mainApp.classList.add("hidden");
}

function logout() {
    authToken = null;
    currentUser = null;
    clearAuthSession();
    location.reload();
}

logoutBtn.addEventListener("click", logout);

// ============================================
// TEXTAREA RESIZE
// ============================================

[loginPageBox, mainAppBox].forEach(box => {
    box.addEventListener("input", () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            const val = box.value;
            if (val.length > 0) {
                box.classList.add("active");
                box.style.height = "auto";
                box.style.height = Math.min(box.scrollHeight, 250) + "px";
                const width = Math.min(900, Math.max(420, Math.ceil((val.length * 26 * 0.58 + 40) / 40) * 40));
                box.style.width = width + "px";
                box.style.fontSize = Math.max(16, 26 - Math.floor((width - 420) / 40)) + "px";
            } else {
                box.classList.remove("active");
                box.style.width = "420px";
                box.style.fontSize = "26px";
                box.style.height = "60px";
            }
        });
    });
    
    box.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendPrompt();
        }
    });
});

[loginPageBtn, mainAppBtn].forEach(btn => {
    btn.addEventListener("click", sendPrompt);
});

// ============================================
// INIT
// ============================================

document.addEventListener("DOMContentLoaded", function() {
    initializeAuth();
    loadProjectFromUrl();
    setupPauseButton();
});