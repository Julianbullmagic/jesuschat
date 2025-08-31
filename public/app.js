(() => {
  const socket = io();

  const messagesEl = document.getElementById('messages');
  const formEl = document.getElementById('chat-form');
  const inputEl = document.getElementById('chat-input');

  let conversation = [];

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
    conversation.push({ role: 'user', content: text });
    socket.emit('chat message', JSON.stringify(conversation));
    inputEl.value = '';
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
})();


