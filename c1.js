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
let currentProjectId = null;
let currentDebateId = null;

// ============================================
// MESSAGE TRACKING
// ============================================

let totalMessagesUsed = 0;
let planMessageLimit = 25;
let debateMessageLimit = 12;
let debateMessagesUsed = 0;
let isDebateActive = false;
let pendingDebateRequest = null;
let contextRestored = false;

const planLimits = {
    "Free": 25,
    "Pro": 40,
    "Master": 80
};

function getUserPlan() {
    if (currentUser && currentUser.plan) {
        return currentUser.plan;
    }
    return "Free";
}

function getPlanLimit() {
    const plan = getUserPlan();
    return planLimits[plan] || 25;
}

function updateMessageUsage() {
    const usageEl = document.getElementById('messageUsage');
    if (usageEl) {
        const remaining = planMessageLimit - totalMessagesUsed;
        usageEl.textContent = `Messages: ${totalMessagesUsed} / ${planMessageLimit} (${remaining} remaining)`;
        
        if (totalMessagesUsed >= planMessageLimit) {
            usageEl.style.color = '#ff6b6b';
        } else if (totalMessagesUsed >= planMessageLimit * 0.8) {
            usageEl.style.color = '#f4a8c7';
        } else {
            usageEl.style.color = '';
        }
    }
}

// ============================================
// PERMISSION/DEBATE MODAL
// ============================================

function showDebatePermission(promptText) {
    const modal = document.getElementById('permissionModal');
    const details = document.getElementById('permissionDetails');
    const planLimitDisplay = document.getElementById('planLimitDisplay');
    
    planLimitDisplay.textContent = planMessageLimit;
    
    // Store the prompt for when user confirms
    pendingDebateRequest = promptText;
    
    // Show modal
    modal.classList.add('active');
    
    // Set default value
    const input = document.getElementById('debateMessageCount');
    input.value = Math.min(12, planMessageLimit - totalMessagesUsed);
    input.max = Math.min(80, planMessageLimit - totalMessagesUsed);
    
    input.addEventListener('change', function() {
        const maxAllowed = planMessageLimit - totalMessagesUsed;
        if (parseInt(this.value) > maxAllowed) {
            this.value = maxAllowed;
        }
    });
}

function cancelDebate() {
    document.getElementById('permissionModal').classList.remove('active');
    pendingDebateRequest = null;
    addMessage("System", "Debate cancelled by user.");
}

function startDebate() {
    const input = document.getElementById('debateMessageCount');
    debateMessageLimit = parseInt(input.value) || 12;
    
    // Check against plan limit
    const maxAllowed = planMessageLimit - totalMessagesUsed;
    if (debateMessageLimit > maxAllowed) {
        debateMessageLimit = maxAllowed;
        input.value = maxAllowed;
        alert(`Maximum debate messages limited to ${maxAllowed} based on your plan.`);
    }
    
    document.getElementById('permissionModal').classList.remove('active');
    
    // Start the debate
    if (pendingDebateRequest && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
            type: "start_debate",
            message: pendingDebateRequest,
            debate_limit: debateMessageLimit
        }));
        pendingDebateRequest = null;
        isDebateActive = true;
        debateMessagesUsed = 0;
        syncDebateControls("Running");
    }
}

// ============================================
// CHAT APPLICATION
// ============================================

const loginPageBox = document.querySelector(".loginPage textarea#promptBox");
const mainAppBox = document.querySelector(".main textarea#promptBox");
const loginPageBtn = document.querySelector(".loginPage button#sendBtn");
const mainAppBtn = document.querySelector(".main button#sendBtn");
const chatContainer = document.getElementById("chatContainer");

function getChatStorageKey() {
    return `chat_history_${currentProjectId || "default"}`;
}

function getMessageCountKey() {
    return `message_count_${currentProjectId || "default"}`;
}

function getStoredMessages() {
    try {
        const storageKey = getChatStorageKey();
        return JSON.parse(localStorage.getItem(storageKey) || "[]");
    } catch (e) {
        console.error("Failed to load stored messages:", e);
        return [];
    }
}

function saveMessageToStorage(sender, text, messageType = "message", animationData = null) {
    try {
        const storageKey = getChatStorageKey();
        const messages = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const messageId = (window.crypto && typeof window.crypto.randomUUID === 'function')
            ? window.crypto.randomUUID()
            : `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        
        messages.push({
            id: messageId,
            sender: sender,
            text: text,
            messageType: messageType,
            animation: animationData,
            timestamp: new Date().toISOString()
        });
        
        if (messages.length > 500) {
            messages.splice(0, messages.length - 500);
        }
        
        localStorage.setItem(storageKey, JSON.stringify(messages));
        return messageId;
    } catch (e) {
        console.error("Failed to save message to storage:", e);
        return null;
    }
}

function updateStoredAnimationById(messageId, animationData) {
    if (!messageId) return;

    try {
        const storageKey = getChatStorageKey();
        const messages = JSON.parse(localStorage.getItem(storageKey) || "[]");
        const targetIndex = messages.findIndex(msg => msg && msg.id === messageId);

        if (targetIndex === -1) return;

        messages[targetIndex].animation = animationData;
        localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch (e) {
        console.error("Failed to update stored animation:", e);
    }
}

function saveMessageCount() {
    try {
        const key = getMessageCountKey();
        localStorage.setItem(key, JSON.stringify({
            totalMessagesUsed: totalMessagesUsed,
            debateMessagesUsed: debateMessagesUsed,
            debateMessageLimit: debateMessageLimit,
            isDebateActive: isDebateActive
        }));
    } catch (e) {
        console.error("Failed to save message count:", e);
    }
}

function loadMessageCount() {
    try {
        const key = getMessageCountKey();
        const data = localStorage.getItem(key);
        if (data) {
            const parsed = JSON.parse(data);
            totalMessagesUsed = parsed.totalMessagesUsed || 0;
            debateMessagesUsed = parsed.debateMessagesUsed || 0;
            debateMessageLimit = parsed.debateMessageLimit || 12;
            isDebateActive = parsed.isDebateActive || false;
            return true;
        }
    } catch (e) {
        console.error("Failed to load message count:", e);
    }
    return false;
}

function loadMessagesFromStorage() {
    try {
        const messages = getStoredMessages();
        
        if (!chatContainer) return false;
        
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
            msg_elem.dataset.messageType = msg.messageType || "message";
            msg_elem.dataset.speaker = msg.sender;
            if (msg.messageType === "animation" && msg.animation) {
                renderAnimationMessage(msg_elem, msg.animation, msg.text || "", msg.id || null);
            } else {
                msg_elem.innerHTML = formatGeneratedText(msg.text);
            }
            msg_elem.prepend(senderSpan);
            chatContainer.appendChild(msg_elem);
        });
        
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return messages.length > 0;
    } catch (e) {
        console.error("Failed to load messages:", e);
        return false;
    }
}

function clearChatHistory() {
    try {
        localStorage.removeItem(getChatStorageKey());
        localStorage.removeItem(getMessageCountKey());
        chatContainer.innerHTML = "";
        totalMessagesUsed = 0;
        debateMessagesUsed = 0;
        isDebateActive = false;
        contextRestored = false;
        updateMessageUsage();
    } catch (e) {
        console.error("Failed to clear chat:", e);
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
let resizeFrame = 0;
let chatStarted = false;

function resetBoxSize(box) {
    box.style.width = baseWidth + "px";
    box.style.fontSize = baseFont + "px";
    box.style.height = "60px";
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

    if (value.length >= 20000) {
        box.style.width = maxWidth + "px";
        box.style.fontSize = minFont + "px";
        return;
    }

    const estimatedWidth = (value.length * baseFont * 0.58) + 40;
    const newWidth = Math.min(maxWidth, Math.max(baseWidth, Math.ceil(estimatedWidth / 40) * 40));
    const newFont = Math.max(minFont, baseFont - Math.floor((newWidth - baseWidth) / 40));
    
    box.style.width = newWidth + "px";
    box.style.fontSize = newFont + "px";
}

function queueBoxLayout(box) {
    if (resizeFrame !== 0) return;
    resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        applyBoxLayout(box);
    });
}

[loginPageBox, mainAppBox].forEach(box => {
    box.addEventListener("input", () => queueBoxLayout(box));
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
    
    const debatePage = document.getElementById("debatePage");
    if (debatePage) debatePage.classList.add("active");
    
    document.body.classList.add("chat-mode");
    
    if (chatContainer) {
        chatContainer.classList.remove("hidden");
        chatContainer.style.display = "flex";
    }

    // Load saved state
    loadMessageCount();
    const hasMessages = loadMessagesFromStorage();
    planMessageLimit = getPlanLimit();
    updateMessageUsage();
    
    // If there are stored messages, setup WebSocket to restore context
    if (hasMessages && !socketReady) {
        setupWebSocket();
    }
}

function addMessage(sender, text, messageType = "message", animationData = null) {
    // Check plan limit
    if (sender !== "user" && sender !== "System") {
        if (totalMessagesUsed >= planMessageLimit) {
            addMessage("System", `You've reached your plan limit of ${planMessageLimit} messages. Please upgrade to continue.`);
            return;
        }
        totalMessagesUsed++;
        saveMessageCount();
        updateMessageUsage();
    }
    
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
    } else {
        senderClass = "agentMsg";
        senderName = sender || "Qweet";
    }

    senderSpan.innerText = senderName;
    msg.className = senderClass;
    msg.dataset.messageType = messageType;
    msg.dataset.speaker = sender;
    const storedMessageId = saveMessageToStorage(sender, text, messageType, animationData);
    msg.dataset.messageId = storedMessageId || "";
    if (messageType === "animation" && animationData) {
        renderAnimationMessage(msg, animationData, text || "", storedMessageId);
    } else {
        msg.innerHTML = formatGeneratedText(text);
    }
    msg.prepend(senderSpan);

    if (text && text.match(/^\.+$/)) {
        msg.classList.add("typing");
    }

    if (!chatContainer) return;
    
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function updateMessageElement(element, sender, text, typing = false) {
    if (!element) return;
    
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

function getAnimationScriptSource(animationData, fallbackText = '') {
    if (typeof animationData === 'string') {
        return animationData;
    }

    if (animationData && typeof animationData === 'object') {
        return animationData.code || animationData.script || animationData.js || '';
    }

    return fallbackText || '';
}

function normalizeAnimationScriptSource(scriptSource) {
    let normalized = String(scriptSource || '').trim();

    if (!normalized) {
        return '';
    }

    if (!/window\.setup\s*=/.test(normalized)) {
        normalized = normalized.replace(/\bfunction\s+setup\s*\(/, 'window.setup = function setup(');
    }

    if (!/window\.draw\s*=/.test(normalized)) {
        normalized = normalized.replace(/\bfunction\s+draw\s*\(/, 'window.draw = function draw(');
    }

    if (!/^\(\s*\(\s*\)\s*=>/.test(normalized) && !/^\(\s*function\b/.test(normalized)) {
        normalized = `(() => {\n${normalized}\n})();`;
    }

    if (!normalized.includes('window.__anilaAnimationStarted')) {
        normalized = normalized.replace(/\n\}\)\(\);\s*$/, `\n\nif (!window.__anilaAnimationStarted) {\n  window.__anilaAnimationStarted = true;\n  if (typeof window.setup === 'function') {\n    window.setup();\n  }\n\n  const __anilaTick = () => {\n    if (!window.__anilaAnimationStarted) {\n      return;\n    }\n\n    if (typeof window.draw === 'function') {\n      window.draw();\n    }\n\n    window.__anilaAnimationFrame = requestAnimationFrame(__anilaTick);\n  };\n\n  window.__anilaAnimationFrame = requestAnimationFrame(__anilaTick);\n}\n})();`);
    }

    return normalized;
}

function normalizeAnimationData(animationData, fallbackText = '') {
    if (typeof animationData === 'string') {
        return {
            code: animationData,
            frames: [],
            frameDelayMs: 125,
        };
    }

    if (animationData && typeof animationData === 'object') {
        return {
            code: animationData.code || animationData.script || animationData.js || '',
            frames: Array.isArray(animationData.frames) ? animationData.frames : [],
            frameDelayMs: Number(animationData.frameDelayMs || animationData.frameDelay || 125),
            width: Number(animationData.width || 0),
            height: Number(animationData.height || 0),
            generatedAt: animationData.generatedAt || null,
            source: animationData.source || 'p5',
        };
    }

    return {
        code: fallbackText || '',
        frames: [],
        frameDelayMs: 125,
    };
}

function waitForCanvasElement(host, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();

        const poll = () => {
            const canvas = host.querySelector('canvas');
            if (canvas) {
                resolve(canvas);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                reject(new Error('Timed out waiting for animation canvas.'));
                return;
            }

            requestAnimationFrame(poll);
        };

        poll();
    });
}

function captureCanvasSequence(sourceCanvas, options = {}) {
    const fps = Math.max(1, Number(options.fps || 8));
    const maxFrames = Math.max(1, Number(options.maxFrames || 120));
    const scale = Math.min(1, Math.max(0.2, Number(options.scale || 0.72)));
    const frameDelayMs = Math.max(16, Math.round(1000 / fps));
    const captureWidth = Math.max(1, Math.round((sourceCanvas.width || 1) * scale));
    const captureHeight = Math.max(1, Math.round((sourceCanvas.height || 1) * scale));

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = captureWidth;
    captureCanvas.height = captureHeight;
    const captureContext = captureCanvas.getContext('2d');
    if (captureContext) {
        captureContext.imageSmoothingEnabled = true;
    }

    return new Promise((resolve) => {
        const frames = [];
        let capturedFrames = 0;

        const timer = window.setInterval(() => {
            try {
                if (!captureContext) {
                    throw new Error('Capture context unavailable');
                }

                captureContext.clearRect(0, 0, captureWidth, captureHeight);
                captureContext.drawImage(sourceCanvas, 0, 0, captureWidth, captureHeight);
                const frameData = captureCanvas.toDataURL('image/webp', 0.82);
                frames.push(frameData);
            } catch (error) {
                console.error('Failed to capture animation frame:', error);
            }

            capturedFrames += 1;
            if (capturedFrames >= maxFrames) {
                window.clearInterval(timer);
                resolve({
                    frames,
                    frameDelayMs,
                    width: captureWidth,
                    height: captureHeight,
                });
            }
        }, frameDelayMs);
    });
}

function createHiddenAnimationRunner(scriptSource) {
    return new Promise((resolve, reject) => {
        const runnerHost = document.createElement('div');
        runnerHost.style.position = 'fixed';
        runnerHost.style.left = '-10000px';
        runnerHost.style.top = '0';
        runnerHost.style.width = '500px';
        runnerHost.style.height = '500px';
        runnerHost.style.overflow = 'hidden';
        runnerHost.style.pointerEvents = 'none';
        runnerHost.style.opacity = '0';

        const canvasHost = document.createElement('div');
        canvasHost.style.width = '500px';
        canvasHost.style.height = '500px';
        runnerHost.appendChild(canvasHost);
        document.body.appendChild(runnerHost);

        const origCreateCanvas = window.createCanvas;
        const origCreateButton = window.createButton;
        const createdNodes = [];
        let settled = false;

        function attachToHost(elem) {
            try {
                if (!elem) return;
                if (elem.elt) {
                    canvasHost.appendChild(elem.elt);
                    createdNodes.push(elem.elt);
                } else if (elem instanceof Element) {
                    canvasHost.appendChild(elem);
                    createdNodes.push(elem);
                }
            } catch (error) {
                console.error('Failed to attach animation element:', error);
            }
        }

        const cleanup = () => {
            try {
                createdNodes.forEach(node => {
                    try { node.remove(); } catch (error) {}
                });
                try { scriptEl.remove(); } catch (error) {}
                try {
                    if (window.__anilaAnimationFrame) {
                        window.cancelAnimationFrame(window.__anilaAnimationFrame);
                    }
                    window.__anilaAnimationStarted = false;
                    window.__anilaAnimationFrame = null;
                    delete window.setup;
                    delete window.draw;
                } catch (error) {}
                runnerHost.remove();
            } catch (error) {}

            if (origCreateCanvas) {
                window.createCanvas = origCreateCanvas;
            } else {
                try { delete window.createCanvas; } catch (error) {}
            }

            if (origCreateButton) {
                window.createButton = origCreateButton;
            } else {
                try { delete window.createButton; } catch (error) {}
            }
        };

        if (typeof origCreateCanvas === 'function') {
            window.createCanvas = function() {
                const res = origCreateCanvas.apply(window, arguments);
                attachToHost(res);
                return res;
            };
        }

        if (typeof origCreateButton === 'function') {
            window.createButton = function() {
                const res = origCreateButton.apply(window, arguments);
                attachToHost(res);
                return res;
            };
        }

        const scriptEl = document.createElement('script');
        scriptEl.type = 'text/javascript';
        scriptEl.textContent = scriptSource;
        document.body.appendChild(scriptEl);

        waitForCanvasElement(canvasHost, 5000).then((canvas) => {
            if (settled) return;
            settled = true;
            resolve({
                canvas,
                cleanup,
            });
        }).catch((error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(error);
        });
    });
}

function startAnimationPlayback(container, frameData, fallbackText = '') {
    const payload = normalizeAnimationData(frameData, fallbackText);
    const frames = Array.isArray(payload.frames) ? payload.frames.filter(Boolean) : [];
    const preservedSender = container.querySelector('.senderLabel')
        ? container.querySelector('.senderLabel').cloneNode(true)
        : null;

    container.classList.add('animation-message');
    container.innerHTML = '';

    if (preservedSender) {
        container.appendChild(preservedSender);
    }

    const shell = document.createElement('div');
    shell.className = 'animation-canvas-shell';
    shell.style.display = 'flex';
    shell.style.flexDirection = 'column';
    shell.style.gap = '10px';
    shell.style.width = '100%';

    const frameStage = document.createElement('div');
    frameStage.className = 'animation-canvas-host';
    frameStage.style.position = 'relative';
    frameStage.style.width = '100%';
    frameStage.style.aspectRatio = '1 / 1';
    frameStage.style.overflow = 'hidden';
    frameStage.style.borderRadius = '14px';
    frameStage.style.background = 'rgba(10, 13, 24, 0.92)';
    frameStage.style.border = '1px solid rgba(255, 255, 255, 0.12)';

    const image = document.createElement('img');
    image.alt = 'Rendered animation frames';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'contain';
    image.style.display = 'block';
    image.style.userSelect = 'none';
    image.draggable = false;
    frameStage.appendChild(image);

    const status = document.createElement('div');
    status.className = 'animation-status';
    status.style.fontSize = '12px';
    status.style.lineHeight = '1.4';
    status.style.opacity = '0.8';
    status.textContent = frames.length > 0
        ? `Playing ${frames.length} saved frames locally.`
        : 'No saved frames available.';

    shell.appendChild(frameStage);
    container.appendChild(shell);
    container.appendChild(status);

    if (!frames.length) {
        return;
    }

    let frameIndex = 0;
    const frameDelayMs = Math.max(32, Number(payload.frameDelayMs || 125));
    image.src = frames[0];

    if (container.__animationPlayerCleanup && typeof container.__animationPlayerCleanup === 'function') {
        try { container.__animationPlayerCleanup(); } catch (error) {}
    }

    const timer = window.setInterval(() => {
        if (!container.isConnected) {
            window.clearInterval(timer);
            return;
        }

        frameIndex = (frameIndex + 1) % frames.length;
        image.src = frames[frameIndex];
    }, frameDelayMs);

    container.__animationPlayerCleanup = () => {
        window.clearInterval(timer);
    };
}

function renderAnimationMessage(container, animationData, fallbackText = '') {
    const payload = normalizeAnimationData(animationData, fallbackText);
    if (Array.isArray(payload.frames) && payload.frames.length > 0) {
        startAnimationPlayback(container, payload, fallbackText);
        return;
    }

    container.classList.add('animation-message');
    container.innerHTML = '';

    const shell = document.createElement('div');
    shell.className = 'animation-canvas-shell';
    shell.style.display = 'flex';
    shell.style.flexDirection = 'column';
    shell.style.gap = '10px';
    shell.style.width = '100%';

    const frameStage = document.createElement('div');
    frameStage.className = 'animation-canvas-host';
    frameStage.style.position = 'relative';
    frameStage.style.width = '100%';
    frameStage.style.aspectRatio = '1 / 1';
    frameStage.style.overflow = 'hidden';
    frameStage.style.borderRadius = '14px';
    frameStage.style.background = 'rgba(10, 13, 24, 0.92)';
    frameStage.style.border = '1px solid rgba(255, 255, 255, 0.12)';

    const status = document.createElement('div');
    status.className = 'animation-status';
    status.style.fontSize = '12px';
    status.style.lineHeight = '1.4';
    status.style.opacity = '0.8';
    status.textContent = 'Rendering animation frames...';

    shell.appendChild(frameStage);
    container.appendChild(shell);
    container.appendChild(status);

    const scriptSource = normalizeAnimationScriptSource(getAnimationScriptSource(payload, fallbackText));

    if (!scriptSource) {
        status.textContent = 'No animation code provided.';
        return;
    }

    if (container.__animationPlayerCleanup && typeof container.__animationPlayerCleanup === 'function') {
        try { container.__animationPlayerCleanup(); } catch (error) {}
        delete container.__animationPlayerCleanup;
    }

    createHiddenAnimationRunner(scriptSource)
        .then(async ({ canvas, cleanup }) => {
            try {
                const sequence = await captureCanvasSequence(canvas, {
                    fps: 8,
                    maxFrames: 120,
                    scale: 0.72,
                });

                cleanup();

                const animatedPayload = {
                    code: scriptSource,
                    frames: sequence.frames,
                    frameDelayMs: sequence.frameDelayMs,
                    width: sequence.width,
                    height: sequence.height,
                    generatedAt: new Date().toISOString(),
                    source: 'p5',
                };

                if (container.dataset.messageId) {
                    updateStoredAnimationById(container.dataset.messageId, animatedPayload);
                }

                startAnimationPlayback(container, animatedPayload, fallbackText);
            } catch (error) {
                cleanup();
                console.error('Failed to record animation frames:', error);
                status.textContent = 'Failed to render animation frames.';
            }
        })
        .catch((error) => {
            console.error('Failed to initialize animation runner:', error);
            status.textContent = 'Failed to initialize animation rendering.';
        });
}

function syncDebateControls(status) {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    currentDebateStatus = status;
    setDebateStatus(status);

    if (status === 'Paused') {
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (resumeBtn) resumeBtn.classList.remove('hidden');
        return;
    }

    if (status === 'Completed' || status === 'Idle' || status === 'Disconnected') {
        if (pauseBtn) pauseBtn.classList.add('hidden');
        if (resumeBtn) resumeBtn.classList.add('hidden');
        isDebateActive = false;
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
        } else if (normalized === 'debating' || normalized === 'Debating' || normalized === 'Running') {
            iconEl.src = 'debate.gif';
            iconEl.style.display = 'inline-block';
        } else {
            iconEl.style.display = 'none';
        }
    }
}

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    if (!currentProjectId) {
        console.error("No project selected");
        window.location.href = 'projects.html';
        return;
    }

    let wsUrl = getWsUrl("/ws/" + encodeURIComponent(currentProjectId));
    if (authToken) {
        wsUrl += "?token=" + encodeURIComponent(authToken);
    } else {
        alert("Please log in first");
        return;
    }

    console.log("Connecting to WebSocket:", wsUrl);
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("WebSocket connected");
        socketReady = true;
        contextRestored = false;
        
        // Send chat history to restore context
        const storedMessages = getStoredMessages();
        if (storedMessages.length > 0) {
            socket.send(JSON.stringify({
                type: "restore_context",
                messages: storedMessages
            }));
            console.log(`[Qweet] Sent ${storedMessages.length} messages to restore context`);
        }
        
        if (pendingPrompt) {
            socket.send(pendingPrompt);
            pendingPrompt = null;
        }
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const eventType = data.type || "message";
        
        switch (eventType) {
            case "connected":
                syncDebateControls("Idle");
                if (data.has_file) {
                    addMessage("System", "File data loaded.");
                }
                if (data.message_limit) {
                    planMessageLimit = data.message_limit;
                    updateMessageUsage();
                }
                break;

            case "context_restored":
                contextRestored = true;
                console.log(`[Qweet] Context restored with ${data.message_count || 0} messages`);
                // if (data.message_count > 0) {
                //     addMessage("System", `🔄 Conversation context restored (${data.message_count} messages)`);
                // }
                break;

            case "status":
                syncDebateControls(data.status || "Running");
                break;
            
            
            case "tool_executing":
                // addMessage("System", `🔧 ${data.tool || 'tool'}: executing`);
                break;
            
            case "debate_permission":
                showDebatePermission(data.message || "Start debate?");
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
                } else if (data.animation) {
                    addMessage(data.speaker || "Qweet", data.message, "animation", data.animation);
                } else {
                    addMessage(data.speaker || "Qweet", data.message, "message");
                }
                break;

            case "reasoning":
                addMessage("Qweet (thinking)", data.message || "", "reasoning");
                break;
            
            case "file_context":
                if (data.data && data.data !== "No file data") {
                    addMessage("System", "File data loaded");
                }
                break;
            
            case "discussion_complete":
                syncDebateControls("Completed");
                isDebateActive = false;
                addMessage("System", "Debate complete");
                break;
            
            case "error":
                console.error('Server error:', data.message);
                addMessage("System", "Something bad happened... idk what tho??: " + data.message);
                break;
            
            default:
                if (data.message) {
                    addMessage(data.speaker || "Qweet", data.message, "message");
                }
                break;
        }
    };

    socket.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        socketReady = false;
        if (currentDebateStatus !== "Completed") {
            syncDebateControls("Disconnected");
        }
    };

    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
        addMessage("System", "Dammit! couldnt connect to the server..");
    };
}


// ============================================
// SEND PROMPT
// ============================================

async function sendPrompt() {
    const box = getActiveBox();
    const prompt = box.value.trim();

    if (!prompt) return;

    // Check plan limit
    if (totalMessagesUsed >= planMessageLimit) {
        alert(`You've reached your plan limit of ${planMessageLimit} messages. Please upgrade to continue.`);
        return;
    }

    if (!authToken) {
        isGuest = true;
        activateChatUI();
        addMessage("System", "Guest Mode: Limited to 25 messages.");
    }

    activateChatUI();
    addMessage("user", prompt);
    box.value = "";
    box.classList.remove("active");
    resetBoxSize(box);

    if (!socketReady) {
        pendingPrompt = JSON.stringify({
            type: "user_message",
            message: prompt
        });
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
                syncDebateControls("Paused");
            }
        });
    }
    
    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'resume' }));
                syncDebateControls("Running");
            }
        });
    }
}

// ============================================
// PROJECT INITIALIZATION
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
    
    if (!token || !projectId) {
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
            showAccessDenied("Session expired. Please sign in again.");
            return;
        }

        if (response.status === 403 || response.status === 404) {
            showAccessDenied("Project not found or access denied.");
            return;
        }

        if (!response.ok) {
            showAccessDenied("Unable to load this project.");
            return;
        }

        const data = await response.json();
        console.log("Project loaded:", data);
        
        const projectNameEl = document.getElementById('projectName');
        if (projectNameEl && data.name) {
            projectNameEl.textContent = `Project: ${data.name}`;
        }

        const filesList = document.getElementById('uploadedFilesList');
        if (filesList && data.files && Array.isArray(data.files)) {
            if (data.files.length > 0) {
                filesList.innerHTML = data.files.map(file => {
                    const label = file.original_name || file.name || "Unnamed file";
                    return `<div class="fileItem"><div class="fileName">📄 ${escapeHtml(String(label))}</div></div>`;
                }).join('');
            } else {
                filesList.innerHTML = '<p style="color: var(--text3); font-size: 13px; padding: 16px;">No files uploaded</p>';
            }
        }

        const debatePage = document.getElementById("debatePage");
        if (debatePage) debatePage.classList.add("active");
        
        loginPage.classList.add("hidden");
        mainApp.classList.remove("hidden");
        
        activateChatUI();
        
        // Load message count from backend too (if available)
        if (data.message_count !== undefined) {
            totalMessagesUsed = data.message_count || 0;
            planMessageLimit = data.plan_limit || getPlanLimit();
            updateMessageUsage();
            saveMessageCount();
        }
        
        syncDebateControls("Idle");
        
    } catch (error) {
        console.error('Error loading project:', error);
        showAccessDenied("Unable to load this project.");
    }
}

// ============================================
// AUTHENTICATION FUNCTIONS
// ============================================

function getStoredUser() {
    const rawUser = localStorage.getItem("currentUser") || localStorage.getItem("user") || sessionStorage.getItem("currentUser") || sessionStorage.getItem("user");
    if (!rawUser) return null;
    try {
        return JSON.parse(rawUser);
    } catch (e) {
        return { name: rawUser };
    }
}

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
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (e) {
            console.error("Failed to parse user data", e);
        }
    } else {
        currentUser = getStoredUser();
    }
    
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
        loginPage.classList.add("hidden");
        mainApp.classList.remove("hidden");
        if (currentUser) {
            userNameEl.textContent = currentUser.name || "User";
        }
        planMessageLimit = getPlanLimit();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    hideAccessDenied();
    loginPage.classList.remove("hidden");
    mainApp.classList.add("hidden");
    const debatePage = document.getElementById("debatePage");
    const historyPage = document.getElementById("historyPage");
    const detailPage = document.getElementById("debateDetailPage");
    if (debatePage) debatePage.classList.remove("active");
    if (historyPage) historyPage.classList.remove("active");
    if (detailPage) detailPage.classList.remove("active");
}

function showMainApp() {
    hideAccessDenied();
    loginPage.classList.add("hidden");
    if (mainApp) mainApp.classList.remove("hidden");
    const debatePage = document.getElementById("debatePage");
    const historyPage = document.getElementById("historyPage");
    const detailPage = document.getElementById("debateDetailPage");
    if (debatePage) debatePage.classList.add("active");
    if (historyPage) historyPage.classList.remove("active");
    if (detailPage) detailPage.classList.remove("active");
    if (currentUser) {
        userNameEl.textContent = currentUser.name || "User";
    }
}

function showAccessDenied(message) {
    const panel = document.getElementById("accessDenied");
    const messageEl = document.getElementById("accessDeniedMessage");
    if (panel) panel.classList.remove("hidden");
    if (messageEl && message) messageEl.textContent = message;
    if (loginPage) loginPage.classList.add("hidden");
    if (mainApp) mainApp.classList.add("hidden");
}

function hideAccessDenied() {
    const panel = document.getElementById("accessDenied");
    if (panel) panel.classList.add("hidden");
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
// INITIALIZATION
// ============================================

[loginPageBtn, mainAppBtn].forEach(btn => {
    btn.addEventListener("click", sendPrompt);
});

document.addEventListener("DOMContentLoaded", function() {
    console.log("DOM Content Loaded");
    initializeAuth();
    loadProjectFromUrl();
    setupPauseButton();
});