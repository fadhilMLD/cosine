
// ═══════════════════════════════════════════════════════════════════════════════
// QWEET AGENT HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Show permission dialog for tool confirmation
 */
function showPermissionDialog(data) {
    const modal = document.getElementById("permissionModal");
    const titleEl = document.getElementById("permissionTitle");
    const reasonEl = document.getElementById("permissionReason");
    const detailsEl = document.getElementById("permissionDetails");
    const optionsEl = document.getElementById("permissionOptions");
    
    // Set title and reason
    const toolName = data.tool || data.action || "Tool";
    titleEl.textContent = `Qweet wants to ${toolName}`;
    reasonEl.textContent = data.reasoning || data.description || "This will help provide better analysis.";
    
    // Display parameters
    let paramHTML = "";
    if (data.parameters) {
        if (typeof data.parameters === "string") {
            paramHTML = data.parameters;
        } else if (typeof data.parameters === "object") {
            for (const [key, value] of Object.entries(data.parameters)) {
                if (Array.isArray(value)) {
                    paramHTML += `<strong>${key}:</strong><br>`;
                    value.forEach(item => {
                        paramHTML += `• ${typeof item === "string" ? item : JSON.stringify(item)}<br>`;
                    });
                } else if (typeof value === "object") {
                    paramHTML += `<strong>${key}:</strong> ${JSON.stringify(value)}<br>`;
                } else {
                    paramHTML += `<strong>${key}:</strong> ${value}<br>`;
                }
            }
        }
    }
    detailsEl.innerHTML = paramHTML || "No additional parameters";
    
    // Create option buttons
    optionsEl.innerHTML = "";
    const options = data.options || ["Proceed", "Cancel"];
    
    options.forEach(option => {
        const btn = document.createElement("button");
        btn.className = "permission-btn";
        if (option.toLowerCase() === "proceed" || option.toLowerCase().includes("start") || option.toLowerCase().includes("search")) {
            btn.classList.add("primary");
        }
        btn.textContent = option;
        btn.addEventListener("click", () => {
            modal.classList.remove("active");
            sendPermissionChoice(data.tool, option, data.parameters);
        });
        optionsEl.appendChild(btn);
    });
    
    // Show modal
    modal.classList.add("active");
}

/**
 * Send tool permission choice back to server
 */
function sendPermissionChoice(tool, choice, parameters) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("WebSocket not connected");
        return;
    }
    
    socket.send(JSON.stringify({
        action: "tool_confirmed",
        tool: tool,
        choice: choice,
        parameters: parameters
    }));
}

/**
 * Display clarification questions
 */
function displayClarificationQuestions(data) {
    const questions = data.questions || [];
    if (!questions.length) return;
    
    let html = '<div class="clarification-container">';
    html += '<div class="clarification-title">❓ Qweet needs clarification:</div>';
    
    questions.forEach(question => {
        html += `<div class="clarification-question" onclick="answerClarification('${question.replace(/'/g, "\\'")}')">`;
        html += question;
        html += '</div>';
    });
    
    html += '</div>';
    
    const msg = document.createElement("div");
    msg.className = "chatMessage";
    msg.innerHTML = html;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

/**
 * Handle clarification answer
 */
function answerClarification(question) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error("WebSocket not connected");
        return;
    }
    
    socket.send(JSON.stringify({
        action: "user_message",
        message: question
    }));
}

/**
 * Update addMessage to handle Qweet-specific styling
 */
const originalAddMessage = addMessage;
function addMessage(sender, text, messageType = "message") {
    // Handle Qweet-specific message types
    if (messageType === "qweet_thinking") {
        const msg = document.createElement("div");
        msg.className = "chatMessage";
        msg.innerHTML = `<div class="qweet-thinking">${text}</div>`;
        chatContainer.appendChild(msg);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return msg;
    } else if (messageType === "tool_execution") {
        const msg = document.createElement("div");
        msg.className = "chatMessage";
        msg.innerHTML = `<div class="tool-execution">${text}</div>`;
        chatContainer.appendChild(msg);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return msg;
    } else if (messageType === "web_results") {
        const msg = document.createElement("div");
        msg.className = "chatMessage";
        msg.innerHTML = `<div class="tool-execution">🌐 ${text}</div>`;
        chatContainer.appendChild(msg);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return msg;
    } else if (messageType === "qweet_message") {
        const msg = document.createElement("div");
        msg.className = "chatMessage";
        msg.innerHTML = `<div class="qweet-message">${text}</div>`;
        chatContainer.appendChild(msg);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        return msg;
    }
    
    // Fall back to original implementation for other message types
    return originalAddMessage.call(this, sender, text, messageType);
}

/**
 * Update message in place (used for typing indicators)
 */
function updateMessageElement(element, sender, newText, isTyping = false) {
    if (!element) return;
    
    const messageContent = element.querySelector(".messageContent") || element;
    
    if (isTyping) {
        messageContent.textContent = newText;
    } else {
        // Replace with completed message
        element.innerHTML = newText;
        if (sender) {
            const senderSpan = document.createElement("span");
            senderSpan.className = "messageSender";
            senderSpan.textContent = sender;
            element.prepend(senderSpan);
        }
    }
}

/**
 * Close permission dialog
 */
function closePermissionDialog() {
    const modal = document.getElementById("permissionModal");
    if (modal) {
        modal.classList.remove("active");
    }
}

// Close dialog when clicking outside
document.addEventListener("DOMContentLoaded", function() {
    const modal = document.getElementById("permissionModal");
    if (modal) {
        modal.addEventListener("click", function(e) {
            if (e.target === modal) {
                closePermissionDialog();
            }
        });
    }
});
