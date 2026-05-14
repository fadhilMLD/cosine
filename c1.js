// ============================================
// AUTHENTICATION SETUP
// ============================================

const loginPage = document.getElementById("loginPage");
const mainApp = document.querySelector(".main");
const logoutBtn = document.getElementById("logoutBtn");
const userNameEl = document.getElementById("userName");
const continueGuestBtn = document.getElementById("continueGuest");

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
    
    // Show main app if authenticated, otherwise show login page
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
    mainApp.classList.remove("hidden");
    if (currentUser) {
        userNameEl.textContent = currentUser.name || "User";
    } else if (isGuest) {
        userNameEl.textContent = "Guest User";
    }
}

function handleCredentialResponse(response) {
    // The ID token is in response.credential
    const token = response.credential;
    
    // Send token to backend for verification and JWT creation
    fetch("https://paralyzingly-unspoken-dwayne.ngrok-free.dev/auth/google", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ token })
    })
    .then(res => res.json())
    .then(data => {
        if (data.access_token) {
            authToken = data.access_token;
            currentUser = data.user;
            localStorage.setItem("authToken", authToken);
            localStorage.setItem("currentUser", JSON.stringify(currentUser));
            showMainApp();
        } else {
            alert("Authentication failed. Please try again.");
        }
    })
    .catch(err => {
        console.error("Auth error:", err);
        alert("Authentication failed. Please try again.");
    });
}

function logout() {
    authToken = null;
    currentUser = null;
    isGuest = false;
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    showLoginPage();
    location.reload();
}

logoutBtn.addEventListener("click", logout);

// ============================================
// CHAT APPLICATION
// ============================================

const box=document.getElementById("promptBox")
const sendBtn=document.getElementById("sendBtn")
const chatContainer=document.getElementById("chatContainer")

const baseWidth=420
const maxWidth=900
const baseFont=26
const minFont=16
const maxHeight=250
const widthStep=40
const textPadding=40
const averageGlyphWidth=0.58
const heavyTextThreshold=20000

let resizeFrame=0
let chatStarted=false

function resetBoxSize(){
box.style.width=baseWidth+"px"
box.style.fontSize=baseFont+"px"
box.style.height="60px"
}

function getLongestLineLength(text,maxScanLength){
let maxLine=0
let currentLine=0
const scanLimit=Math.min(text.length,maxScanLength)

for(let i=0;i<scanLimit;i++){
if(text[i]==="\n"){
if(currentLine>maxLine){
maxLine=currentLine
}
currentLine=0
continue
}
currentLine++
}

if(currentLine>maxLine){
maxLine=currentLine
}

return maxLine
}

function applyBoxLayout(){
const value=box.value

if(value.length>0){
box.classList.add("active")
}
else{
box.classList.remove("active")
resetBoxSize()
return
}

box.style.height="auto"
box.style.height=Math.min(box.scrollHeight,maxHeight)+"px"

if(value.length>=heavyTextThreshold){
box.style.width=maxWidth+"px"
box.style.fontSize=minFont+"px"
return
}

const longestLine=getLongestLineLength(value,heavyTextThreshold)
const estimatedTextWidth=(longestLine*baseFont*averageGlyphWidth)+textPadding
const targetWidth=Math.min(maxWidth,Math.max(baseWidth,Math.ceil(estimatedTextWidth)))
const widthGrowth=Math.ceil((targetWidth-baseWidth)/widthStep)
const newWidth=Math.min(maxWidth,baseWidth+(Math.max(0,widthGrowth)*widthStep))
const newFont=Math.max(minFont,baseFont-Math.max(0,widthGrowth))

box.style.width=newWidth+"px"
box.style.fontSize=newFont+"px"
}

function queueBoxLayout(){
if(resizeFrame!==0){
return
}

resizeFrame=requestAnimationFrame(()=>{
resizeFrame=0
applyBoxLayout()
})
}

box.addEventListener("input",()=>{
queueBoxLayout()
})

function activateChatUI(){
if(chatStarted) return
chatStarted=true
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
    } else {
        // For agents like Generator, Negator, etc.
        senderClass = "agentMsg";
    }

    senderSpan.innerText = senderName;
    msg.className = senderClass;
    
    // Add agent-specific class
    if (sender !== "user" && sender !== "System") {
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

// Guest user functionality
function continueAsGuest() {
    isGuest = true;
    showMainApp();
    activateChatUI();
    addMessage("System", "You are using the app in guest mode. Limited to 10 messages per prompt. Sign in for unlimited access.");
}

continueGuestBtn.addEventListener("click", continueAsGuest);

let socket;
let socketReady = false;
let pendingPrompt = null;
let typingMessages = {};  // Track typing messages by speaker

function setupWebSocket() {
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
        return;
    }

    // Build WebSocket URL with token if authenticated
    let wsUrl = "wss://paralyzingly-unspoken-dwayne.ngrok-free.dev/ws";
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
    const prompt = box.value.trim();

    if (!prompt) {
        return;
    }

    activateChatUI();
    addMessage("user", prompt);
    box.value = "";
    box.classList.remove("active");
    resetBoxSize();

    if (!socketReady) {
        pendingPrompt = prompt;
        setupWebSocket();
    } else {
        socket.send(prompt);
    }
}

sendBtn.addEventListener("click",sendPrompt)

box.addEventListener("keydown",(event)=>{
if(event.key==="Enter" && !event.shiftKey){
event.preventDefault()
sendPrompt()
}
})

// Initialize authentication on page load
window.addEventListener("load", initializeAuth);