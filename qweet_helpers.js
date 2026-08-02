function displayFileData(data) {
    const container = document.getElementById('chatContainer');
    if (!container) return;

    let html = '<div class="file-data-container">';
    html += '<div class="file-data-header">File Data</div>';
    
    try {
        const jsonData = JSON.parse(data);
        if (jsonData.dataset) {
            html += `<div class="file-data-info">`;
            html += `<span>${jsonData.dataset.rows || 0} rows</span>`;
            html += `<span>${jsonData.dataset.columns || 0} columns</span>`;
            if (jsonData.dataset.column_names) {
                html += `<div class="file-data-columns">Columns: ${jsonData.dataset.column_names.join(', ')}</div>`;
            }
            html += `</div>`;
        }
        if (jsonData.metrics) {
            html += '<div class="file-data-metrics">';
            Object.entries(jsonData.metrics).forEach(([name, stats]) => {
                if (stats.type === 'numeric') {
                    html += `<div class="metric-item">`;
                    html += `<span class="metric-name">${escapeHtml(name)}</span>`;
                    html += `<span class="metric-stats">Min: ${stats.min} | Max: ${stats.max} | Mean: ${stats.mean.toFixed(2)}</span>`;
                    html += `</div>`;
                }
            });
            html += '</div>';
        }
    } catch (e) {
        html += `<div class="file-data-raw">${escapeHtml(data.substring(0, 500))}${data.length > 500 ? '...' : ''}</div>`;
    }
    
    html += '</div>';
    const msg = document.createElement("div");
    msg.className = "chatMessage file-data-message";
    msg.innerHTML = html;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}


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

function sendWebSocketMessage(message) {
    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
        console.error("Server disconnected");
        return false;
    }
    window.socket.send(JSON.stringify(message));
    return true;
}

function requestFileContext() {
    return sendWebSocketMessage({
        type: "get_file_context"
    });
}

function refreshFileContext() {
    return sendWebSocketMessage({
        type: "refresh_file_context"
    });
}