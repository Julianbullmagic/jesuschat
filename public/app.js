(() => {
  const socket = io();

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const fileEl = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadStatus = document.getElementById('upload-status');
  const endBtn = document.getElementById('end-chat');
  const warningEl = document.getElementById('token-warning');
  const TOKEN_LIMIT = 64000; // approximate total context limit
  const overlay = document.getElementById('overlay');
  const overlayClose = document.getElementById('overlay-close');
  const connEl = document.getElementById('conn-status');

  let conversation = [];
  let pendingChunks = [];

  const appendMessage = (role, content) => {
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    updateTokenWarning();
  };

  socket.on('starting new conversation', (data) => {
    // summaries of previous conversations (optional UI usage)
    connEl.textContent = 'Connected';
    try { JSON.parse(data); } catch (_) {}
  });

  socket.on('connect', () => { connEl.textContent = 'Connected'; });
  socket.on('disconnect', () => { connEl.textContent = 'Disconnected'; showOverlay(false); });
  socket.io.on('reconnect_attempt', () => { connEl.textContent = 'Reconnecting…'; });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    let text = inputEl.value.trim();
    const hasChunks = pendingChunks && pendingChunks.length > 0;
    if (!text && !hasChunks) return; // nothing to send
    if (!text && hasChunks) {
      text = 'Please summarize the attached document and note key points.';
    }
    showOverlay(true);
    appendMessage('user', text);
    // Attach up to ~10k chars of chunks to avoid overloading prompt
    let docContext = '';
    let added = 0;
    const maxChars = 10000;
    for (const chunk of pendingChunks) {
      if (added + chunk.length > maxChars) break;
      docContext += `\n\n[Document chunk]\n${chunk}`;
      added += chunk.length;
    }
    const content = docContext ? `${text}\n\n[Attached document context]\n${docContext}` : text;
    conversation.push({ role: 'user', content });
    socket.emit('chat message', JSON.stringify(conversation));
    inputEl.value = '';
    pendingChunks = [];
    uploadStatus.textContent = '';
    updateTokenWarning();
  });

  socket.on('chat response', (data) => {
    try {
      const message = JSON.parse(data);
      if (message && message.content) {
        appendMessage('assistant', message.content);
        conversation.push({ role: 'assistant', content: message.content });
      }
    } catch (e) {
      console.error('Bad response payload', e, data);
    }
    showOverlay(false);
  });

  overlayClose.addEventListener('click', () => showOverlay(false));

  // Failsafe: hide overlay if nothing returns in ~12s and surface a notice
  let overlayTimer = null;
  function showOverlay(show) {
    overlay.hidden = !show;
    overlay.style.display = show ? 'flex' : 'none';
    clearTimeout(overlayTimer);
    if (show) {
      overlayTimer = setTimeout(() => {
        overlay.hidden = true;
        overlay.style.display = 'none';
        appendMessage('system', 'No response yet. Please try again or End chat to reset.');
      }, 30000);
    }
  }

  // Shorten timeout to 12s for snappier feedback
  (function shortenTimeout(){
    const original = showOverlay;
    showOverlay = function(nextShow){
      overlay.hidden = !nextShow;
      overlay.style.display = nextShow ? 'flex' : 'none';
      clearTimeout(overlayTimer);
      if (nextShow) {
        overlayTimer = setTimeout(() => {
          overlay.hidden = true;
          overlay.style.display = 'none';
          appendMessage('system', 'No response yet. Please try again or End chat to reset.');
        }, 12000);
      }
    }
  })();

  socket.on('connect_error', (err) => {
    connEl.textContent = 'Connection error';
    console.error('socket connect_error', err);
    showOverlay(false);
  });

  endBtn.addEventListener('click', () => {
    socket.emit('summarize conversation', JSON.stringify(conversation));
    messagesEl.innerHTML = '';
    conversation = [];
    pendingChunks = [];
    uploadStatus.textContent = '';
    appendMessage('system', 'Conversation ended. Starting a new one.');
  });

  uploadBtn.addEventListener('click', async () => {
    if (!fileEl.files || !fileEl.files[0]) {
      uploadStatus.textContent = 'Choose a file first';
      return;
    }
    uploadStatus.textContent = 'Uploading...';
    try {
      const data = new FormData();
      data.append('file', fileEl.files[0]);
      uploadBtn.disabled = true;
      const resp = await fetch('/api/ingest', { method: 'POST', body: data });
      if (!resp.ok) throw new Error('Upload failed');
      const json = await resp.json();
      pendingChunks = json.chunks || [];
      uploadStatus.textContent = `Attached ${pendingChunks.length} chunks from ${json.name}`;
      updateTokenWarning();
    } catch (e) {
      console.error(e);
      uploadStatus.textContent = 'Failed to attach document';
    }
    uploadBtn.disabled = false;
  });

  function estimateTokens(text) {
    // rough heuristic ~ 4 chars per token
    return Math.ceil((text || '').length / 4);
  }

  function updateTokenWarning() {
    const all = [...conversation];
    if (pendingChunks.length) {
      const sample = pendingChunks.slice(0, 3).join('\n');
      all.push({ role: 'system', content: `[Pending chunks]\n${sample}` });
    }
    const combined = all.map(m => m.content || '').join('\n');
    const tokens = estimateTokens(combined);
    if (tokens >= TOKEN_LIMIT * 0.9) {
      warningEl.textContent = `Warning: conversation may exceed the model context (${tokens}/${TOKEN_LIMIT} tokens). Consider clicking End chat to summarize and reset.`;
      warningEl.className = 'warn';
      warningEl.style.display = 'block';
      warningEl.hidden = false;
    } else {
      warningEl.textContent = '';
      warningEl.style.display = 'none';
      warningEl.hidden = true;
    }
  }

  function showOverlay(show) {
    overlay.hidden = !show;
    overlay.style.display = show ? 'flex' : 'none';
  }
})();


