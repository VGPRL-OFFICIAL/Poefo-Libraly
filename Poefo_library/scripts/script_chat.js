// ===== CHAT SCRIPT COMPLETO COM FIREBASE ESTRUTURADO =====
// Estrutura RTDB: /chat/{conversaId}/messages/{msgId}
//                 /chat_users/{userId}/conversations/{convId}
//                 /chat_metadata/{convId}

const db = firebase.database();
const storage = firebase.storage();

let currentUserId = sessionStorage.getItem('currentUserId') || null;
let currentUserName = sessionStorage.getItem('currentUserName') || 'Usuário Anônimo';
let currentUserAvatar = sessionStorage.getItem('currentUserAvatar') || null;

let currentConvId = null;
let currentParticipants = [];
let allUsers = {};
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

// Notificação sonora simples
function playBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 700;
        o.connect(g);
        g.connect(ctx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.2);
        setTimeout(() => { o.stop(); ctx.close(); }, 250);
    } catch (e) {
        // ignora se WebAudio não suportado
    }
}

function showDesktopNotification(title, body, icon) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            const n = new Notification(title, { body, icon });
            playBeep();
            setTimeout(() => n.close(), 5000);
        } catch (e) { console.warn('Notification error', e); }
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') showDesktopNotification(title, body, icon);
        });
    }
}

// ===== HELPER FUNCTIONS =====
function getConvIdFromParticipants(arr) {
    const sorted = Array.from(new Set(arr.map(String))).sort();
    if (sorted.length === 2) return `direct_${sorted[0]}_${sorted[1]}`;
    return `group_${sorted.join('_')}`;
}

async function safeReadRef(path) {
    try {
        const snap = await db.ref(path).once('value');
        return snap.exists() ? snap.val() : null;
    } catch (e) {
        console.warn('Read error:', path, e);
        return null;
    }
}

function timeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    if (diff < 60000) return 'agora';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h`;
    const d = new Date(timestamp);
    return d.toLocaleDateString('pt-BR');
}

// ===== FCM: registro de service worker e token =====
async function registerFcmAndSaveToken() {
    if (!('serviceWorker' in navigator) || !('Notification' in window) || !firebase.messaging) return;
    try {
        // Registrar service worker no escopo raiz para permitir background notifications
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const messaging = firebase.messaging();

        // Request permission if not already
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            try { await Notification.requestPermission(); } catch (e) { /* ignore */ }
        }

        // Tentar obter token FCM (usa VAPID key se fornecida em `window.FCM_VAPID_KEY`)
        try {
            const vapidKey = window.FCM_VAPID_KEY || null;
            let currentToken = null;
            if (vapidKey) {
                // firebase v8 suporta messaging.usePublicVapidKey
                if (typeof messaging.usePublicVapidKey === 'function') {
                    try { messaging.usePublicVapidKey(vapidKey); } catch(e) { /* ignore */ }
                }
                try {
                    currentToken = await messaging.getToken({ vapidKey });
                } catch (e) {
                    // fallback para getToken sem opções
                    try { currentToken = await messaging.getToken(); } catch(err2) { throw err2; }
                }
            } else {
                try { currentToken = await messaging.getToken(); } catch (e) { console.warn('getToken falhou sem VAPID key', e); }
            }

            if (currentToken) {
                // garantir que temos um currentUserId válido antes de salvar
                currentUserId = sessionStorage.getItem('currentUserId') || currentUserId;
                if (!currentUserId) {
                    // esperar curto período até o usuário logar (se aplicável)
                    const start = Date.now();
                    while (!currentUserId && (Date.now() - start) < 30000) {
                        await new Promise(r => setTimeout(r, 1000));
                        currentUserId = sessionStorage.getItem('currentUserId') || currentUserId;
                    }
                }
                if (currentUserId) {
                    await db.ref(`usuarios/${currentUserId}/fcmToken`).set(currentToken);
                    console.log('FCM token salvo para', currentUserId);
                } else {
                    console.warn('Token FCM obtido mas usuário não autenticado; token não salvo.');
                }
            } else {
                console.warn('Nenhum token FCM disponível. Defina `window.FCM_VAPID_KEY` com a public VAPID key se necessário.');
            }
        } catch (e) {
            console.warn('Erro ao obter token FCM:', e);
        }

        // Re-salvar token em caso de refresh (v8)
        try {
            if (typeof messaging.onTokenRefresh === 'function') {
                messaging.onTokenRefresh && messaging.onTokenRefresh(async () => {
                    try {
                        const newToken = await messaging.getToken();
                        const uid = sessionStorage.getItem('currentUserId') || null;
                        if (newToken && uid) {
                            await db.ref(`usuarios/${uid}/fcmToken`).set(newToken);
                            console.log('FCM token atualizado para', uid);
                        }
                    } catch (err) { console.warn('Erro token refresh', err); }
                });
            }
        } catch (err) { /* ignore */ }

        // Mostrar notificações enquanto a aba está aberta (mensagens de foreground)
        messaging.onMessage(payload => {
            try {
                const notif = payload.notification || {};
                showDesktopNotification(notif.title || 'Nova mensagem', notif.body || '', notif.icon || null);
            } catch (e) { console.warn('onMessage error', e); }
        });
    } catch (err) {
        console.warn('Registro FCM falhou', err);
    }
}

// ===== UI FUNCTIONS =====
function toggleSidebar() {
    document.querySelector('.conversations-sidebar').classList.toggle('open');
}

async function openSelectedUserProfile() {
    if (!currentConvId || currentParticipants.length === 0) return alert('Nenhuma conversa selecionada');
    const otherId = currentParticipants.find(id => id !== currentUserId);
    if (!otherId) return;
    sessionStorage.setItem('viewUserId', otherId);
    window.location.href = './visualizador_perfil.html';
}

function showCallOptions() {
    alert('Funcionalidade de chamada em desenvolvimento');
}

function showChatInfo() {
    alert(`Conversa: ${document.getElementById('header-name').textContent}\nParticipantes: ${currentParticipants.length}`);
}

function openNewGroupModal() {
    document.getElementById('new-group-modal').classList.add('active');
    loadUsersForModal();
}

function closeNewGroupModal() {
    document.getElementById('new-group-modal').classList.remove('active');
}

async function loadUsersForModal() {
    const participantList = document.getElementById('participant-list');
    participantList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    const users = await safeReadRef('usuarios') || {};
    allUsers = users;
    renderParticipantList(Object.entries(users).map(([id, u]) => ({
        id,
        name: u.nome_usuario || u.nome_completo || u.handle || id,
        avatar: u.foto_perfil || null
    })));
}

function renderParticipantList(users, filter = '') {
    const participantList = document.getElementById('participant-list');
    const search = document.getElementById('participant-search').value.toLowerCase();
    const filtered = users.filter(u => u.name.toLowerCase().includes(search) || u.id.toLowerCase().includes(search));
    
    participantList.innerHTML = filtered.slice(0, 100).map(u => `
        <div class="participant-item">
            <div class="participant-avatar">
                ${u.avatar ? `<img src="${u.avatar}" alt="${u.name}">` : '<i class="fas fa-user"></i>'}
            </div>
            <div class="participant-info">
                <div class="participant-name">${u.name}</div>
                <div class="participant-id">@${u.id}</div>
            </div>
            <input type="checkbox" class="participant-checkbox" data-userid="${u.id}" value="${u.id}">
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('participant-search').addEventListener('input', () => {
        const users = Object.entries(allUsers).map(([id, u]) => ({
            id,
            name: u.nome_usuario || u.nome_completo || u.handle || id,
            avatar: u.foto_perfil || null
        }));
        renderParticipantList(users);
    });
});

async function createNewGroup() {
    const checkboxes = Array.from(document.querySelectorAll('.participant-checkbox:checked'));
    const selectedIds = checkboxes.map(cb => cb.value);
    if (selectedIds.length < 1) return alert('Selecione pelo menos um usuário');
    
    const participantsArr = [currentUserId, ...selectedIds];
    const convId = getConvIdFromParticipants(participantsArr);
    const groupName = selectedIds.length === 1 ? 
        (allUsers[selectedIds[0]]?.nome_usuario || selectedIds[0]) : 
        `Grupo (${participantsArr.length} pessoas)`;
    
    try {
        // Converter participants para objeto (requerido pelas regras de segurança)
        const participantsObj = {};
        participantsArr.forEach(uid => participantsObj[uid] = true);
        
        const meta = {
            title: groupName,
            participants: participantsObj,
            createdAt: Date.now(),
            createdBy: currentUserId,
            lastMessage: '',
            lastTimestamp: Date.now()
        };
        
        // Criar metadados da conversa
        await db.ref(`chat_metadata/${convId}`).set(meta);
        
        // Adicionar para o usuário autenticado apenas
        // (Cada participante deve sincronizar suas conversas localmente)
        await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).set({
            ...meta,
            unreadCount: 0
        });
        
        closeNewGroupModal();
        await loadConversations();
        openConversation(convId, participantsArr, groupName);
    } catch (err) {
        console.error('Erro criar grupo:', err);
        alert('Erro ao criar grupo');
    }
}

async function attachImage() {
    document.getElementById('image-input').click();
}

document.getElementById('image-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentConvId) return;
    
    const path = `chat_media/${currentConvId}/img_${Date.now()}_${file.name}`;
    try {
        const ref = storage.ref().child(path);
        const snap = await ref.put(file);
        const url = await snap.ref.getDownloadURL();
        await sendMessage('', url, file.type);
    } catch (err) {
        console.error('Erro upload imagem:', err);
        alert('Erro ao enviar imagem');
    }
    e.target.value = '';
});

async function toggleAudioRecorder() {
    if (!isRecording) {
        startRecording();
    } else {
        stopRecording();
    }
}

async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) return alert('Gravação não suportada');
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Escolher mimeType suportado (prioriza webm/opus, senão ogg)
        let mime = '';
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mime = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm')) mime = 'audio/webm';
        mediaRecorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
            const type = (mediaRecorder && mediaRecorder.mimeType) ? mediaRecorder.mimeType : 'audio/webm';
            const blob = new Blob(recordedChunks, { type });
            // Mostrar indicador de upload
            const sendBtn = document.getElementById('send-btn');
            if (sendBtn) { sendBtn.disabled = true; sendBtn.dataset.prev = sendBtn.innerHTML; sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
            const path = `chat_media/${currentConvId}/audio_${Date.now()}.webm`;
            try {
                const ref = storage.ref().child(path);
                const snap = await ref.put(blob);
                const url = await snap.ref.getDownloadURL();
                await sendMessage('', url, type);
            } catch (err) {
                console.error('Erro upload áudio:', err);
            }
            if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = sendBtn.dataset.prev || '<i class="fas fa-paper-plane"></i>'; }
        };
        mediaRecorder.start();
        isRecording = true;
        document.querySelector('.compose-icon-btn:nth-of-type(2)').innerHTML = '<i class="fas fa-stop-circle"></i>';
    } catch (err) {
        console.error('Erro gravação:', err);
        alert('Permissão negada para microfone');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        document.querySelector('.compose-icon-btn:nth-of-type(2)').innerHTML = '<i class="fas fa-microphone"></i>';
    }
}

async function sendMessage(text = '', mediaUrl = null, mediaType = null) {
    const inputEl = document.getElementById('message-input');
    text = text || (inputEl ? inputEl.value.trim() : '');
    
    if (!text && !mediaUrl) {
        console.warn('Mensagem vazia');
        return;
    }
    
    if (!currentConvId) {
        alert('Selecione uma conversa primeiro');
        return;
    }
    
    const message = {
        userId: currentUserId,
        userName: currentUserName,
        text: text || '',
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        timestamp: Date.now()
    };
    
    try {
        console.log('=== DEBUG: Enviando Mensagem ===');
        console.log('ConvId:', currentConvId);
        console.log('UserId:', currentUserId);
        console.log('Caminho:', `chat/${currentConvId}/messages`);
        console.log('Mensagem:', message);
        
        // APENAS enviar mensagem - sem atualizar metadados
        await db.ref(`chat/${currentConvId}/messages`).push(message);
        
        // Limpar campo de input
        if (inputEl) inputEl.value = '';
        
        console.log('✓ Mensagem enviada com sucesso');
        
        // Atualizar metadados de forma assíncrona (sem bloquear envio)
        updateChatMetadata(currentConvId, text, mediaUrl, mediaType).catch(err => {
            console.warn('Não foi possível atualizar metadados:', err);
        });
    } catch (err) {
        console.error('✗ ERRO ao enviar mensagem:', err);
        console.error('Código de erro:', err.code);
        console.error('Mensagem:', err.message);
        alert('Erro ao enviar mensagem: ' + err.message);
    }
}

// Atualizar metadados da conversa de forma assíncrona
async function updateChatMetadata(convId, text, mediaUrl, mediaType) {
    try {
        const preview = mediaUrl ? `[${mediaType?.split('/')[0] || 'arquivo'}]` : text;
        const meta = {
            lastMessage: preview,
            lastTimestamp: Date.now()
        };

        // Atualizar metadados centrais
        await db.ref(`chat_metadata/${convId}`).update(meta);

        // Garantir lista de participantes
        // Sempre ler participantes da fonte autoritativa para evitar usar uma conversa atualmente aberta
        const pSnap = await db.ref(`chat_metadata/${convId}/participants`).once('value');
        const pobj = pSnap.exists() ? pSnap.val() : {};
        const participants = Array.isArray(pobj) ? pobj : Object.keys(pobj || {});

        // Atualizar entrada em chat_users para cada participante
        if (Array.isArray(participants)) {
            await Promise.all(participants.map(async (uid) => {
                const userConvRef = db.ref(`chat_users/${uid}/conversations/${convId}`);
                try {
                    if (uid === currentUserId) {
                        // Para o remetente, garantir que o unreadCount seja zero
                        await userConvRef.update({ lastMessage: meta.lastMessage, lastTimestamp: meta.lastTimestamp, unreadCount: 0 });
                    } else {
                        // Para outros participantes, incrementar unreadCount via transaction e atualizar preview
                        await userConvRef.transaction(current => {
                            const now = meta.lastTimestamp;
                            const base = current || {};
                            const newCount = (base.unreadCount || 0) + 1;
                            return { ...base, lastMessage: meta.lastMessage, lastTimestamp: now, unreadCount: newCount };
                        });
                    }
                } catch (e) {
                    console.warn('Erro atualizando chat_users para', uid, e);
                }
            }));
        }

        console.log('Metadados atualizados e sincronizados em chat_users');
    } catch (err) {
        console.warn('Erro ao atualizar metadados:', err);
    }
}

async function loadConversations() {
    const convList = document.getElementById('conversations-list');
    convList.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i></div>';
    
    const conversations = await safeReadRef(`chat_users/${currentUserId}/conversations`) || {};
    convList.innerHTML = '';

    if (Object.keys(conversations).length === 0) {
        convList.innerHTML = '<div style="padding: 16px; text-align: center; color: #65676b;">Sem conversas</div>';
        return;
    }

    const entries = Object.entries(conversations).sort((a, b) => (b[1].lastTimestamp || 0) - (a[1].lastTimestamp || 0));

    entries.forEach(([convId, meta]) => {
        const item = document.createElement('div');
        item.className = 'conversation-item' + (convId === currentConvId ? ' active' : '');
        item.dataset.convId = convId;
        
        // Converter participants para array se for objeto
        const participantsArr = Array.isArray(meta.participants) 
            ? meta.participants 
            : Object.keys(meta.participants || {});
        
        const otherIds = participantsArr.filter(id => id !== currentUserId);
        const avatar = meta.avatar || (otherIds.length === 1 ? allUsers[otherIds[0]]?.foto_perfil : null);
        
        const unread = meta.unreadCount || 0;
        item.innerHTML = `
            <div class="conv-avatar">
                ${avatar ? `<img src="${avatar}" alt="avatar">` : '<i class="fas fa-users"></i>'}
            </div>
            <div class="conv-info">
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="conv-name">${meta.title || meta.otherName || convId}</div>
                    ${unread > 0 ? `<div class="conv-badge">${unread}</div>` : ''}
                </div>
                <div class="conv-last-msg">${meta.lastMessage || 'Sem mensagens'}</div>
            </div>
        `;
        item.addEventListener('click', () => {
            openConversation(convId, meta.participants || participantsArr, meta.title);
        });
        
        convList.appendChild(item);
    });
}

// Inscrever-se nas conversas do usuário para atualizações em tempo real
function subscribeConversations() {
    const ref = db.ref(`chat_users/${currentUserId}/conversations`);
    ref.off();
    ref.on('value', snap => {
        const data = snap.exists() ? snap.val() : {};
        const convList = document.getElementById('conversations-list');
        convList.innerHTML = '';
        if (Object.keys(data).length === 0) {
            convList.innerHTML = '<div style="padding: 16px; text-align: center; color: #65676b;">Sem conversas</div>';
            return;
        }

        const entries = Object.entries(data).sort((a, b) => (b[1].lastTimestamp || 0) - (a[1].lastTimestamp || 0));
        entries.forEach(([convId, meta]) => {
            const item = document.createElement('div');
            item.className = 'conversation-item' + (convId === currentConvId ? ' active' : '');
            item.dataset.convId = convId;

            const participantsArr = Array.isArray(meta.participants) ? meta.participants : Object.keys(meta.participants || {});
            const otherIds = participantsArr.filter(id => id !== currentUserId);
            const avatar = meta.avatar || (otherIds.length === 1 ? allUsers[otherIds[0]]?.foto_perfil : null);

            const unread = meta.unreadCount || 0;
            item.innerHTML = `
                <div class="conv-avatar">
                    ${avatar ? `<img src="${avatar}" alt="avatar">` : '<i class="fas fa-users"></i>'}
                </div>
                <div class="conv-info">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <div class="conv-name">${meta.title || meta.otherName || convId}</div>
                        ${unread > 0 ? `<div class="conv-badge">${unread}</div>` : ''}
                    </div>
                    <div class="conv-last-msg">${meta.lastMessage || 'Sem mensagens'}</div>
                </div>
            `;
            item.addEventListener('click', () => {
                openConversation(convId, meta.participants || participantsArr, meta.title);
            });

            convList.appendChild(item);
        });
    });
}

async function openConversation(convId, participants, title) {
    currentConvId = convId;
    
    // Converter participants para array se for objeto
    let participantsArray = Array.isArray(participants) 
        ? participants 
        : Object.keys(participants || {});
    
    currentParticipants = participantsArray;
    
    // Mostrar área de mensagens e manter a barra de composição fixa em baixo
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('messages-area').style.display = 'flex';
    document.getElementById('compose-section').style.display = 'flex';
    document.getElementById('header-name').textContent = title || participantsArray.join(', ');
    document.getElementById('header-status').textContent = 'Online';
    
    // Atualizar avatares no header
    const otherIds = participantsArray.filter(id => id !== currentUserId);
    const otherUser = otherIds.length > 0 ? (allUsers[otherIds[0]] || {}) : {};
    const avatarEl = document.getElementById('header-avatar');
    if (otherUser.foto_perfil) {
        avatarEl.innerHTML = `<img src="${otherUser.foto_perfil}" alt="avatar">`;
    } else {
        avatarEl.innerHTML = '<i class="fas fa-user"></i>';
    }
    
    // Atualizar sidebar - marcar conversa como ativa
    document.querySelectorAll('.conversation-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.conversation-item[data-conv-id="${convId}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
    }
    
    // Carregar mensagens
    const messagesArea = document.getElementById('messages-area');
    messagesArea.innerHTML = '';
    
    const messagesRef = db.ref(`chat/${convId}/messages`);
    messagesRef.off();
    
    // Limpar e recarregar
    const snapshot = await messagesRef.limitToLast(200).once('value');
    if (snapshot.exists()) {
        const msgs = [];
        snapshot.forEach(child => {
            msgs.push(child.val());
        });
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        msgs.forEach(msg => renderMessage(msg, messagesArea));
    }
    
    // Listener para novas mensagens
    messagesRef.limitToLast(1).on('child_added', snap => {
        const msg = snap.val();
        if (msg) {
            renderMessage(msg, messagesArea);
        }
    });
    // Zerar contador de não lidas para esta conversa ao abrir
    try {
        db.ref(`chat_users/${currentUserId}/conversations/${convId}/unreadCount`).set(0);
    } catch (e) { /* ignore */ }
    
    messagesArea.scrollTop = messagesArea.scrollHeight;
}

function renderMessage(msg, container) {
    const div = document.createElement('div');
    const isSent = msg.userId === currentUserId;
    div.className = 'message ' + (isSent ? 'sent' : 'received');
    
    let content = `
        <div class="message-bubble">
            ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
    `;
    
    if (msg.mediaUrl) {
        const type = msg.mediaType || '';
        if (type.startsWith('image')) {
            content += `<div class="message-media"><img src="${msg.mediaUrl}" alt="image"></div>`;
        } else if (type.startsWith('audio')) {
            content += `<div class="message-media"><audio controls src="${msg.mediaUrl}"></audio></div>`;
        } else if (type.startsWith('video')) {
            content += `<div class="message-media"><video controls src="${msg.mediaUrl}" style="width:100%;"></video></div>`;
        }
    }
    
    content += `
        </div>
        <div class="message-time">${timeAgo(msg.timestamp)}</div>
    `;
    
    div.innerHTML = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    // Carregar usuários primeiro
    allUsers = (await safeReadRef('usuarios')) || {};
    
    const pendingChallenge = sessionStorage.getItem('pendingGameChallenge');
    if (pendingChallenge) {
        try {
            const parsed = JSON.parse(pendingChallenge);
            sessionStorage.setItem('chatWithUserId', parsed.recipientId);
            sessionStorage.setItem('chatWithUserName', parsed.recipientName);
            sessionStorage.setItem('pendingGameChallengeText', parsed.text || '');
        } catch (error) {
            console.warn('Erro ao carregar desafio do menu:', error);
        }
        sessionStorage.removeItem('pendingGameChallenge');
    }

    // Se aberto de um clique em "Mensagem" do visualizador
    const preOther = sessionStorage.getItem('chatWithUserId');
    const preOtherName = sessionStorage.getItem('chatWithUserName');
    
        // Pedir permissão de notificações (se disponível)
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            try { Notification.requestPermission(); } catch (e) { /* ignore */ }
        }

        if (preOther) {
        // Se vindo do visualizador, criar conversa antes de carregar lista
        const participants = [currentUserId, preOther];
        const convId = getConvIdFromParticipants(participants);
        
        // Buscar dados do outro usuário
        const otherUserData = allUsers[preOther] || {};
        const finalName = preOtherName || otherUserData.nome_usuario || otherUserData.nome_completo || preOther;
        
        // Converter participants para objeto (requerido pelas regras de segurança)
        const participantsObj = {};
        participants.forEach(uid => participantsObj[uid] = true);
        
        // Criar/atualizar entry se não existir
        const meta = {
            title: finalName,
            participants: participantsObj,
            createdBy: currentUserId,
            createdAt: Date.now(),
            lastMessage: '',
            lastTimestamp: Date.now(),
            avatar: otherUserData.foto_perfil || null
        };
        
        try {
            await db.ref(`chat_metadata/${convId}`).set(meta);
            // Adicionar apenas para o usuário autenticado
            await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).set({ ...meta, unreadCount: 0 });
            // O outro usuário verá a conversa quando abrir o chat (síncrona via listeners)
        } catch (err) {
            console.warn('Erro ao criar conversa inicial:', err);
        }
        
        // Carregar conversas (que agora incluirá a nova)
            // Inscrever e carregar conversas (agora incluirá a nova)
            subscribeConversations();
        
        // Abrir a conversa selecionada
        openConversation(convId, participants, finalName);
        
        const challengeText = sessionStorage.getItem('pendingGameChallengeText');
        if (challengeText) {
            setTimeout(() => {
                sendMessage(challengeText);
            }, 900);
            sessionStorage.removeItem('pendingGameChallengeText');
        }

        // Limpar sessionStorage
        sessionStorage.removeItem('chatWithUserId');
        sessionStorage.removeItem('chatWithUserName');
    } else {
        // Se não vindo do visualizador, inscrever e carregar conversas em tempo real
        subscribeConversations();
    }
    
    // Search
    document.getElementById('search-convs')?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.conversation-item').forEach(item => {
            const name = item.querySelector('.conv-name').textContent.toLowerCase();
            item.style.display = name.includes(query) ? '' : 'none';
        });
    });
    
    // Enviar mensagem ao clicar botao
    document.getElementById('send-btn')?.addEventListener('click', () => {
        sendMessage();
    });
    
    // Enviar mensagem ao pressionar Enter
    document.getElementById('message-input')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

        // Listener para notificações de conversas (quando metadata muda)
        try {
            const convsRef = db.ref(`chat_users/${currentUserId}/conversations`);
            convsRef.on('child_changed', snap => {
                const meta = snap.val();
                const convId = snap.key;
                if (!meta) return;
                // Se não for a conversa atual, notificar
                if (convId !== currentConvId) {
                    const title = meta.title || convId;
                    const body = meta.lastMessage || 'Nova mensagem';
                    showDesktopNotification(title, body, meta.avatar || null);
                }
            });
        } catch (e) { /* ignore */ }

        // Registrar service worker / FCM
        registerFcmAndSaveToken().catch(() => {});
});
