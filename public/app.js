(() => {
  const socket = io();

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');
  const fileEl = document.getElementById('file-input');
  const uploadBtn = document.getElementById('upload-btn');
  const uploadStatus = document.getElementById('upload-status');

  let conversation = [];
  let pendingChunks = [];

  const appendMessage = (role, content) => {
    const div = document.createElement('div');
    div.className = `msg msg-${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  };

  socket.on('starting new conversation', (data) => {
    // summaries of previous conversations (optional UI usage)
    try { JSON.parse(data); } catch (_) {}
  });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputEl.value.trim();
    if (!text) return;
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
      const resp = await fetch('/api/ingest', { method: 'POST', body: data });
      if (!resp.ok) throw new Error('Upload failed');
      const json = await resp.json();
      pendingChunks = json.chunks || [];
      uploadStatus.textContent = `Attached ${pendingChunks.length} chunks from ${json.name}`;
    } catch (e) {
      console.error(e);
      uploadStatus.textContent = 'Failed to attach document';
    }
  });
})();


