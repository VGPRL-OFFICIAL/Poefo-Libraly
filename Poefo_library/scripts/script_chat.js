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
let isStartingRecording = false;
let recordingStream = null;
let recordingConvId = null;
let selectedParticipantIds = new Set();
let pendingBookChatInvite = null;
let pendingGameChallenge = null;

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

async function sendBookInviteToConversation(convId, participants, title) {
    if (!pendingBookChatInvite) return false;
    await openConversation(convId, participants, title);
    const book = pendingBookChatInvite;
    const bookTitle = book.titulo || 'este livro';
    const sent = await sendMessage(`📚 ${currentUserName} convidou você para ler "${bookTitle}".`, null, null, book);
    if (!sent) return false;

    pendingBookChatInvite = null;
    sessionStorage.removeItem('pendingBookChatInvite');
    document.body.classList.remove('book-invite-mode');
    const invitePrompt = document.getElementById('book-invite-prompt');
    if (invitePrompt) invitePrompt.style.display = 'none';
    loadConversations();
    return true;
}

async function sendGameChallengeToConversation(convId, participants, title) {
    if (!pendingGameChallenge) return false;
    if (!currentUserId) {
        alert('Entre na sua conta para desafiar um contato.');
        return false;
    }
    await openConversation(convId, participants, title);
    const sent = await sendMessage(pendingGameChallenge.text);
    if (!sent) return false;

    pendingGameChallenge = null;
    sessionStorage.removeItem('pendingGameChallenge');
    document.body.classList.remove('game-challenge-mode');
    const challengePrompt = document.getElementById('game-challenge-prompt');
    if (challengePrompt) challengePrompt.style.display = 'none';
    loadConversations();
    return true;
}

async function inviteBookToContact(userId, userName) {
    if (!currentUserId) {
        alert('Entre na sua conta para convidar um contato.');
        return;
    }

    const participants = [currentUserId, userId];
    const convId = getConvIdFromParticipants(participants);
    try {
        const metaRef = db.ref(`chat_metadata/${convId}`);
        const existingMeta = await metaRef.once('value');
        const meta = existingMeta.val() || {
            title: userName,
            participants: { [currentUserId]: true, [userId]: true },
            createdBy: currentUserId,
            createdAt: Date.now(),
            lastMessage: '',
            lastTimestamp: Date.now(),
            avatar: allUsers[userId]?.foto_perfil || null
        };
        if (!existingMeta.exists()) await metaRef.set(meta);
        await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).update({ ...meta, unreadCount: 0 });
        closeNewGroupModal();
        const sent = await sendBookInviteToConversation(convId, meta.participants || participants, meta.title || userName);
        if (!sent) throw new Error('A mensagem não foi enviada.');
    } catch (error) {
        console.error('Não foi possível enviar convite ao contato:', error);
        alert(`Não foi possível enviar o convite: ${error.message}`);
    }
}

async function challengeContact(userId, userName) {
    if (!currentUserId) {
        alert('Entre na sua conta para desafiar um contato.');
        return;
    }

    const participants = [currentUserId, userId];
    const convId = getConvIdFromParticipants(participants);
    try {
        const metaRef = db.ref(`chat_metadata/${convId}`);
        const existingMeta = await metaRef.once('value');
        const meta = existingMeta.val() || {
            title: userName,
            participants: { [currentUserId]: true, [userId]: true },
            createdBy: currentUserId,
            createdAt: Date.now(),
            lastMessage: '',
            lastTimestamp: Date.now(),
            avatar: allUsers[userId]?.foto_perfil || null
        };
        if (!existingMeta.exists()) await metaRef.set(meta);
        await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).update({ ...meta, unreadCount: 0 });
        closeNewGroupModal();
        const sent = await sendGameChallengeToConversation(convId, meta.participants || participants, meta.title || userName);
        if (!sent) throw new Error('A mensagem do desafio não foi enviada.');
    } catch (error) {
        console.error('Não foi possível enviar o desafio ao contato:', error);
        alert(`Não foi possível enviar o desafio: ${error.message}`);
    }
}

function createConversationItem(convId, meta) {
    const item = document.createElement('div');
    item.className = 'conversation-item' + (convId === currentConvId ? ' active' : '');
    item.dataset.convId = convId;

    const rawParticipants = Array.isArray(meta.participants)
        ? meta.participants
        : Object.keys(meta.participants || {});
    const participantsArr = rawParticipants.filter(id =>
        id && id !== 'null' && id !== 'undefined' && id !== 'NaN'
    );
    const otherIds = participantsArr.filter(id => id !== currentUserId);
    const contactIdFromTitle = Object.entries(allUsers).find(([, user]) => {
        const title = meta.title || meta.otherName;
        const userNames = [user.nome_usuario, user.nome_completo, user.handle]
            .filter(Boolean)
            .map(name => String(name).replace(/^@/, '').toLowerCase());
        return title && userNames.includes(String(title).replace(/^@/, '').toLowerCase());
    })?.[0];
    if (otherIds.length === 0 && contactIdFromTitle && contactIdFromTitle !== currentUserId) {
        otherIds.push(contactIdFromTitle);
        participantsArr.push(contactIdFromTitle);
    }

    const otherUser = otherIds.length === 1 ? allUsers[otherIds[0]] : null;
    const avatar = meta.avatar || otherUser?.foto_perfil || null;
    const title = [meta.title, meta.otherName].find(value =>
        value && value !== 'undefined' && value !== 'null'
    ) || otherUser?.nome_usuario || otherUser?.nome_completo || 'Conversa';
    const unread = Number(meta.unreadCount) || 0;

    const avatarElement = document.createElement('div');
    avatarElement.className = 'conv-avatar';
    const setAvatarFallback = () => {
        avatarElement.replaceChildren();
        const fallback = document.createElement('i');
        fallback.className = `fas fa-${otherIds.length === 1 ? 'user' : 'users'}`;
        avatarElement.appendChild(fallback);
    };
    if (avatar) {
        const image = document.createElement('img');
        image.src = avatar;
        image.alt = `Foto de perfil de ${title}`;
        image.addEventListener('error', setAvatarFallback, { once: true });
        avatarElement.appendChild(image);
    } else {
        setAvatarFallback();
    }

    const info = document.createElement('div');
    info.className = 'conv-info';
    const titleRow = document.createElement('div');
    titleRow.className = 'conv-title-row';
    const name = document.createElement('div');
    name.className = 'conv-name';
    name.textContent = title;
    titleRow.appendChild(name);
    if (unread > 0) {
        const badge = document.createElement('div');
        badge.className = 'conv-badge';
        badge.textContent = String(unread);
        titleRow.appendChild(badge);
    }
    const preview = document.createElement('div');
    preview.className = 'conv-last-msg';
    preview.textContent = meta.lastMessage || 'Sem mensagens';
    info.append(titleRow, preview);
    item.append(avatarElement, info);

    item.addEventListener('click', () => {
        openConversation(convId, participantsArr, title);
    });

    if (pendingBookChatInvite) {
        const inviteButton = document.createElement('button');
        inviteButton.type = 'button';
        inviteButton.className = 'send-book-invite';
        inviteButton.textContent = 'Enviar convite';
        inviteButton.addEventListener('click', async event => {
            event.stopPropagation();
            inviteButton.disabled = true;
            try {
                const sent = await sendBookInviteToConversation(convId, meta.participants || participantsArr, meta.title);
                if (!sent) inviteButton.disabled = false;
            } catch (error) {
                console.error('Não foi possível enviar o convite de leitura:', error);
                alert(`Não foi possível enviar o convite: ${error.message}`);
                inviteButton.disabled = false;
            }
        });
        item.appendChild(inviteButton);
    }
    if (pendingGameChallenge) {
        const challengeButton = document.createElement('button');
        challengeButton.type = 'button';
        challengeButton.className = 'send-game-challenge';
        challengeButton.textContent = 'Enviar desafio';
        challengeButton.addEventListener('click', async event => {
            event.stopPropagation();
            challengeButton.disabled = true;
            try {
                const sent = await sendGameChallengeToConversation(convId, meta.participants || participantsArr, meta.title);
                if (!sent) challengeButton.disabled = false;
            } catch (error) {
                console.error('Não foi possível enviar o desafio do jogo:', error);
                alert(`Não foi possível enviar o desafio: ${error.message}`);
                challengeButton.disabled = false;
            }
        });
        item.appendChild(challengeButton);
    }
    return item;
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

function closeMobileConversation() {
    document.body.classList.remove('mobile-chat-open');
}

function openNewGroupModal() {
    selectedParticipantIds.clear();
    document.getElementById('group-name').value = '';
    document.getElementById('participant-search').value = '';
    updateGroupSelectionUI();
    document.getElementById('new-group-modal').classList.add('active');
    loadUsersForModal();
}

function closeNewGroupModal() {
    document.getElementById('new-group-modal').classList.remove('active');
}

function updateGroupSelectionUI() {
    const isSpecialMode = Boolean(pendingBookChatInvite || pendingGameChallenge);
    const groupNameField = document.getElementById('group-name-field');
    const submitButton = document.getElementById('submit-new-conversation');
    groupNameField.hidden = isSpecialMode || selectedParticipantIds.size < 2;
    submitButton.hidden = isSpecialMode;
    submitButton.textContent = selectedParticipantIds.size > 1 ? 'Criar grupo' : 'Iniciar conversa';
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

function renderParticipantList(users) {
    const participantList = document.getElementById('participant-list');
    const search = document.getElementById('participant-search').value.toLowerCase();
    const filtered = users.filter(u => u.id !== currentUserId && (u.name.toLowerCase().includes(search) || u.id.toLowerCase().includes(search)));
    participantList.innerHTML = '';

    filtered.slice(0, 100).forEach(user => {
        const item = document.createElement('div');
        item.className = 'participant-item';

        const avatar = document.createElement('div');
        avatar.className = 'participant-avatar';
        if (user.avatar) {
            const image = document.createElement('img');
            image.src = user.avatar;
            image.alt = `Foto de perfil de ${user.name}`;
            image.addEventListener('error', () => {
                avatar.replaceChildren();
                const fallback = document.createElement('i');
                fallback.className = 'fas fa-user';
                avatar.appendChild(fallback);
            }, { once: true });
            avatar.appendChild(image);
        } else {
            const fallback = document.createElement('i');
            fallback.className = 'fas fa-user';
            avatar.appendChild(fallback);
        }

        const info = document.createElement('div');
        info.className = 'participant-info';
        const name = document.createElement('div');
        name.className = 'participant-name';
        name.textContent = user.name;
        const username = document.createElement('div');
        username.className = 'participant-id';
        username.textContent = `@${user.id}`;
        info.append(name, username);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'participant-checkbox';
        checkbox.dataset.userid = user.id;
        checkbox.value = user.id;
        checkbox.checked = selectedParticipantIds.has(user.id);
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedParticipantIds.add(user.id);
            else selectedParticipantIds.delete(user.id);
            item.classList.toggle('selected', checkbox.checked);
            updateGroupSelectionUI();
        });

        item.append(avatar, info, checkbox);
        item.classList.toggle('selected', checkbox.checked);
        item.addEventListener('click', event => {
            if (event.target.closest('input, button') || pendingBookChatInvite || pendingGameChallenge) return;
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });

        if (pendingBookChatInvite) {
            const inviteButton = document.createElement('button');
            inviteButton.type = 'button';
            inviteButton.className = 'send-book-invite';
            inviteButton.textContent = 'Enviar convite';
            inviteButton.addEventListener('click', () => inviteBookToContact(user.id, user.name));
            item.appendChild(inviteButton);
        }
        if (pendingGameChallenge) {
            const challengeButton = document.createElement('button');
            challengeButton.type = 'button';
            challengeButton.className = 'send-game-challenge';
            challengeButton.textContent = 'Enviar desafio';
            challengeButton.addEventListener('click', () => challengeContact(user.id, user.name));
            item.appendChild(challengeButton);
        }
        participantList.appendChild(item);
    });

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state-text';
        empty.textContent = 'Nenhum usuário encontrado';
        participantList.appendChild(empty);
    }
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
    if (!currentUserId) {
        alert('Entre na sua conta para iniciar uma conversa.');
        return;
    }
    const selectedIds = Array.from(selectedParticipantIds);
    if (selectedIds.length < 1) return alert('Selecione pelo menos um usuário');
    
    const participantsArr = [currentUserId, ...selectedIds];
    const convId = getConvIdFromParticipants(participantsArr);
    const defaultTitle = selectedIds.length === 1 ?
        (allUsers[selectedIds[0]]?.nome_usuario || selectedIds[0]) : 
        `Grupo (${participantsArr.length} pessoas)`;
    const groupName = selectedIds.length > 1
        ? (document.getElementById('group-name').value.trim() || defaultTitle)
        : defaultTitle;
    const submitButton = document.getElementById('submit-new-conversation');
    
    try {
        submitButton.disabled = true;
        const participantsObj = {};
        participantsArr.forEach(uid => {
            participantsObj[uid] = true;
        });
        const metaRef = db.ref(`chat_metadata/${convId}`);
        const existing = await metaRef.once('value');
        let meta = existing.val();

        if (!existing.exists()) {
            meta = {
                title: groupName,
                participants: participantsObj,
                createdAt: Date.now(),
                createdBy: currentUserId,
                lastMessage: '',
                lastTimestamp: Date.now(),
                avatar: selectedIds.length === 1 ? allUsers[selectedIds[0]]?.foto_perfil || null : null
            };
            await metaRef.set(meta);
        }
        
        closeNewGroupModal();
        await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).set({
            ...meta,
            unreadCount: 0
        });
        await loadConversations();
        await openConversation(convId, meta.participants || participantsArr, meta.title || groupName);
    } catch (err) {
        console.error('Erro criar grupo:', err);
        alert(`Não foi possível iniciar a conversa: ${err.message}`);
    } finally {
        submitButton.disabled = false;
    }
}

async function attachImage() {
    if (!currentConvId) {
        alert('Selecione uma conversa antes de enviar uma imagem.');
        return;
    }
    document.getElementById('image-input').click();
}

document.getElementById('image-input')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        if (!file.type.startsWith('image/')) throw new Error('Selecione um arquivo de imagem válido.');
        await uploadChatMedia(file, currentConvId);
    } catch (err) {
        console.error('Erro upload imagem:', err);
        alert(`Não foi possível enviar a imagem: ${err.message}`);
    }
    e.target.value = '';
});

async function toggleAudioRecorder() {
    if (isRecording) {
        stopRecording();
    } else if (!isStartingRecording) {
        await startRecording();
    }
}

async function startRecording() {
    if (!currentConvId) {
        alert('Selecione uma conversa antes de gravar um áudio.');
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        alert('Este navegador não oferece suporte à gravação de áudio.');
        return;
    }

    isStartingRecording = true;
    try {
        recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingConvId = currentConvId;
        const supportedTypes = [
            'audio/webm;codecs=opus',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/webm',
            'audio/ogg'
        ];
        const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
            ? supportedTypes.find(type => MediaRecorder.isTypeSupported(type))
            : '';
        mediaRecorder = mimeType
            ? new MediaRecorder(recordingStream, { mimeType })
            : new MediaRecorder(recordingStream);
        recordedChunks = [];
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onstop = async () => {
            try {
                const type = mediaRecorder.mimeType || recordedChunks[0]?.type || 'audio/webm';
                const blob = new Blob(recordedChunks, { type });
                if (!blob.size) throw new Error('A gravação ficou vazia. Tente novamente.');
                const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
                const audioFile = new File([blob], `audio_${Date.now()}.${extension}`, { type });
                await uploadChatMedia(audioFile, recordingConvId);
            } catch (err) {
                console.error('Erro upload áudio:', err);
                alert(`Não foi possível enviar o áudio: ${err.message}`);
            } finally {
                recordingStream?.getTracks().forEach(track => track.stop());
                recordingStream = null;
                recordingConvId = null;
                mediaRecorder = null;
                recordedChunks = [];
                setAudioRecordingUI(false);
            }
        };
        mediaRecorder.start();
        isRecording = true;
        setAudioRecordingUI(true);
    } catch (err) {
        console.error('Erro gravação:', err);
        recordingStream?.getTracks().forEach(track => track.stop());
        recordingStream = null;
        recordingConvId = null;
        alert(`Não foi possível acessar o microfone: ${err.message}`);
    } finally {
        isStartingRecording = false;
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        isRecording = false;
        document.getElementById('media-status').textContent = 'Preparando áudio para envio...';
        mediaRecorder.stop();
    }
}

function setAudioRecordingUI(recording) {
    isRecording = recording;
    const button = document.getElementById('audio-record-btn');
    const status = document.getElementById('media-status');
    button.classList.toggle('is-recording', recording);
    button.title = recording ? 'Parar e enviar áudio' : 'Gravar áudio';
    button.setAttribute('aria-label', button.title);
    button.innerHTML = recording
        ? '<i class="fas fa-stop-circle"></i>'
        : '<i class="fas fa-microphone"></i>';
    status.hidden = !recording;
    status.textContent = recording ? 'Gravando áudio... Toque novamente para enviar.' : '';
}

async function uploadChatMedia(file, convId) {
    if (!convId) throw new Error('Selecione uma conversa antes de enviar o arquivo.');
    if (!currentUserId) throw new Error('Entre na sua conta antes de enviar arquivos.');

    const status = document.getElementById('media-status');
    const imageButton = document.getElementById('image-attach-btn');
    const audioButton = document.getElementById('audio-record-btn');
    imageButton.disabled = true;
    audioButton.disabled = true;
    status.hidden = false;
    status.textContent = 'Enviando arquivo...';

    try {
        const safeName = file.name.replace(/[^\w.-]/g, '_');
        const path = `chat_media/${convId}/${currentUserId}/${Date.now()}_${safeName}`;
        const fileRef = storage.ref().child(path);
        const snapshot = await fileRef.put(file, {
            contentType: file.type,
            customMetadata: { conversationId: convId, senderId: currentUserId }
        });
        const url = await snapshot.ref.getDownloadURL();
        const sent = await sendMessage('', url, file.type, null, convId);
        if (!sent) {
            await snapshot.ref.delete();
            throw new Error('O arquivo foi enviado, mas a mensagem não pôde ser entregue.');
        }
    } finally {
        imageButton.disabled = false;
        audioButton.disabled = false;
        status.hidden = true;
        status.textContent = '';
    }
}

async function sendMessage(text = null, mediaUrl = null, mediaType = null, bookAttachment = null, targetConvId = currentConvId) {
    const inputEl = document.getElementById('message-input');
    text = text === null
        ? (inputEl ? inputEl.value.trim() : '')
        : String(text).trim();
    
    if (!text && !mediaUrl) {
        console.warn('Mensagem vazia');
        return false;
    }
    
    if (!targetConvId) {
        alert('Selecione uma conversa primeiro');
        return false;
    }
    
    const message = {
        userId: currentUserId,
        userName: currentUserName,
        text: text || '',
        mediaUrl: mediaUrl || null,
        mediaType: mediaType || null,
        timestamp: Date.now()
    };
    if (bookAttachment) message.bookAttachment = bookAttachment;
    
    try {
        console.log('=== DEBUG: Enviando Mensagem ===');
        console.log('ConvId:', targetConvId);
        console.log('UserId:', currentUserId);
        console.log('Caminho:', `chat/${targetConvId}/messages`);
        console.log('Mensagem:', message);
        
        // APENAS enviar mensagem - sem atualizar metadados
        await db.ref(`chat/${targetConvId}/messages`).push(message);
        
        // Limpar campo de input
        if (inputEl && !mediaUrl) inputEl.value = '';
        
        console.log('✓ Mensagem enviada com sucesso');
        
        // Atualizar metadados de forma assíncrona (sem bloquear envio)
        updateChatMetadata(targetConvId, text, mediaUrl, mediaType).catch(err => {
            console.warn('Não foi possível atualizar metadados:', err);
        });
        return true;
    } catch (err) {
        console.error('✗ ERRO ao enviar mensagem:', err);
        console.error('Código de erro:', err.code);
        console.error('Mensagem:', err.message);
        alert('Erro ao enviar mensagem: ' + err.message);
        return false;
    }
}

// Atualizar metadados da conversa de forma assíncrona
async function updateChatMetadata(convId, text, mediaUrl, mediaType) {
    try {
        const mediaLabel = mediaType?.startsWith('audio/')
            ? 'Áudio'
            : mediaType?.startsWith('image/')
                ? 'Imagem'
                : 'Arquivo';
        const preview = mediaUrl ? `[${mediaLabel}]` : text;
        const metadataSnapshot = await db.ref(`chat_metadata/${convId}`).once('value');
        const metadata = metadataSnapshot.val() || {};
        const meta = {
            ...metadata,
            lastMessage: preview,
            lastTimestamp: Date.now()
        };

        await db.ref(`chat_users/${currentUserId}/conversations/${convId}`).update({
            ...meta,
            unreadCount: 0
        });
    } catch (err) {
        console.warn('Erro ao atualizar a conversa do remetente:', err);
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
        convList.appendChild(createConversationItem(convId, meta));
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
            convList.appendChild(createConversationItem(convId, meta));
        });
    });
}

async function openConversation(convId, participants, title) {
    currentConvId = convId;
    document.body.classList.add('mobile-chat-open');
    
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
    const renderedMessageIds = new Set();
    if (snapshot.exists()) {
        const msgs = [];
        snapshot.forEach(child => {
            msgs.push({ id: child.key, message: child.val() });
        });
        msgs.sort((a, b) => a.message.timestamp - b.message.timestamp);
        msgs.forEach(({ id, message }) => {
            renderedMessageIds.add(id);
            renderMessage(message, messagesArea);
        });
    }
    
    // Listener para novas mensagens
    messagesRef.limitToLast(1).on('child_added', snap => {
        const msg = snap.val();
        if (msg && !renderedMessageIds.has(snap.key)) {
            renderedMessageIds.add(snap.key);
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
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    if (msg.text) {
        const text = document.createElement('div');
        text.textContent = msg.text;
        bubble.appendChild(text);
    }

    if (msg.mediaUrl) {
        const mediaType = msg.mediaType || '';
        const media = mediaType.startsWith('image/')
            ? document.createElement('img')
            : mediaType.startsWith('audio/')
                ? document.createElement('audio')
                : mediaType.startsWith('video/')
                    ? document.createElement('video')
                    : null;
        if (media) {
            media.src = msg.mediaUrl;
            media.className = 'message-media';
            if (media instanceof HTMLImageElement) {
                media.alt = 'Imagem enviada';
                media.loading = 'lazy';
            } else {
                media.controls = true;
                media.preload = 'metadata';
            }
            bubble.appendChild(media);
        }
    }

    div.appendChild(bubble);
    const time = document.createElement('div');
    time.className = 'message-time';
    time.textContent = timeAgo(msg.timestamp);
    div.appendChild(time);
    if (msg.bookAttachment) {
        const book = msg.bookAttachment;
        const card = document.createElement('div');
        card.className = 'book-invite-card';
        const cover = document.createElement('img');
        cover.src = book.link_capa || '../images/Logo_Poefo.png';
        cover.alt = '';
        const details = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = book.titulo || 'Livro';
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.textContent = 'Ver livro';
        openButton.addEventListener('click', () => {
            sessionStorage.setItem('selectedBook', JSON.stringify(book));
            window.location.href = './livro.html';
        });
        details.append(title, openButton);
        card.append(cover, details);
        div.querySelector('.message-bubble').appendChild(card);
    }
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
    document.getElementById('mobile-chat-back')?.addEventListener('click', closeMobileConversation);

    // Carregar usuários primeiro
    allUsers = (await safeReadRef('usuarios')) || {};
    const pendingBookInviteJson = sessionStorage.getItem('pendingBookChatInvite');
    if (pendingBookInviteJson) {
        try {
            pendingBookChatInvite = JSON.parse(pendingBookInviteJson);
            if (!pendingBookChatInvite || !pendingBookChatInvite.id) {
                throw new Error('Dados do livro inválidos.');
            }
            const invitePrompt = document.getElementById('book-invite-prompt');
            if (invitePrompt) invitePrompt.style.display = 'block';
            document.body.classList.add('book-invite-mode');
        } catch (error) {
            console.error('Não foi possível carregar o convite de leitura:', error);
            alert('Não foi possível carregar os dados do livro para o convite.');
            sessionStorage.removeItem('pendingBookChatInvite');
        }
    }

    document.getElementById('find-book-invite-contact')?.addEventListener('click', openNewGroupModal);
    document.getElementById('cancel-book-invite')?.addEventListener('click', () => {
        pendingBookChatInvite = null;
        sessionStorage.removeItem('pendingBookChatInvite');
        document.getElementById('book-invite-prompt').style.display = 'none';
        document.body.classList.remove('book-invite-mode');
        loadConversations();
    });
    
    const pendingChallenge = sessionStorage.getItem('pendingGameChallenge');
    if (pendingChallenge) {
        try {
            const parsed = JSON.parse(pendingChallenge);
            if (parsed.recipientId) {
                sessionStorage.setItem('chatWithUserId', parsed.recipientId);
                sessionStorage.setItem('chatWithUserName', parsed.recipientName || '');
                sessionStorage.setItem('pendingGameChallengeText', parsed.text || '');
                sessionStorage.removeItem('pendingGameChallenge');
            } else if (parsed.gameName && parsed.text) {
                pendingGameChallenge = parsed;
                const challengePrompt = document.getElementById('game-challenge-prompt');
                if (challengePrompt) challengePrompt.style.display = 'block';
                document.body.classList.add('game-challenge-mode');
            } else {
                throw new Error('Dados do desafio inválidos.');
            }
        } catch (error) {
            console.error('Não foi possível carregar o desafio do jogo:', error);
            alert('Não foi possível carregar os dados do desafio.');
            sessionStorage.removeItem('pendingGameChallenge');
        }
    }

    document.getElementById('find-game-challenge-contact')?.addEventListener('click', openNewGroupModal);
    document.getElementById('cancel-game-challenge')?.addEventListener('click', () => {
        pendingGameChallenge = null;
        sessionStorage.removeItem('pendingGameChallenge');
        document.getElementById('game-challenge-prompt').style.display = 'none';
        document.body.classList.remove('game-challenge-mode');
        loadConversations();
    });

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
