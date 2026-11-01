const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

function getConversationParticipants(meta) {
  const participants = meta && meta.participants;
  return Array.isArray(participants)
    ? participants
    : Object.keys(participants || {});
}

function getMessagePreview(msg) {
  if (msg.text) return msg.text;
  if (msg.mediaType && msg.mediaType.startsWith('audio/')) return '[Áudio]';
  if (msg.mediaType && msg.mediaType.startsWith('image/')) return '[Imagem]';
  return msg.mediaUrl ? '[Arquivo]' : '';
}

// Cria o índice da conversa para todos os membros, mantendo chat_users privado por usuário.
exports.indexNewConversation = functions.database.ref('/chat_metadata/{convId}')
  .onCreate(async (snap, context) => {
    const meta = snap.val();
    const participants = getConversationParticipants(meta);
    if (!meta || participants.length === 0) return null;

    try {
      await Promise.all(participants.map(async uid => {
        const conversationRef = admin.database().ref(`chat_users/${uid}/conversations/${context.params.convId}`);
        const result = await conversationRef.transaction(current => {
          const previous = current || {};
          const previousTimestamp = Number(previous.lastTimestamp) || 0;
          const metadataTimestamp = Number(meta.lastTimestamp) || 0;
          const keepLatestPreview = previousTimestamp > metadataTimestamp;
          return {
            ...previous,
            ...meta,
            lastMessage: keepLatestPreview ? previous.lastMessage : meta.lastMessage,
            lastTimestamp: Math.max(previousTimestamp, metadataTimestamp),
            unreadCount: Number(previous.unreadCount) || 0
          };
        });
        if (!result.committed) {
          throw new Error(`Não foi possível indexar a conversa para o participante ${uid}.`);
        }
      }));
      return null;
    } catch (error) {
      console.error('Erro ao indexar conversa para os participantes:', error);
      throw error;
    }
  });

// Atualiza a lista e o contador de não lidas de cada membro ao receber uma mensagem.
exports.syncConversationOnMessage = functions.database.ref('/chat/{convId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.val();
    if (!msg) return null;

    const convId = context.params.convId;
    const metaRef = admin.database().ref(`/chat_metadata/${convId}`);
    const metaSnap = await metaRef.once('value');
    const meta = metaSnap.val();
    const participants = getConversationParticipants(meta);
    if (!meta || participants.length === 0) {
      console.error(`Metadados ausentes para a conversa ${convId}.`);
      return null;
    }

    const lastMessage = getMessagePreview(msg);
    const lastTimestamp = msg.timestamp || Date.now();
    await metaRef.transaction(current => {
      if (!current) return current;
      const currentTimestamp = Number(current.lastTimestamp) || 0;
      return lastTimestamp >= currentTimestamp
        ? { ...current, lastMessage, lastTimestamp }
        : current;
    });

    await Promise.all(participants.map(async uid => {
      const conversationRef = admin.database().ref(`chat_users/${uid}/conversations/${convId}`);
      const result = await conversationRef.transaction(current => {
        const previous = current || {};
        const previousTimestamp = Number(previous.lastTimestamp) || 0;
        const keepLatestPreview = previousTimestamp > lastTimestamp;
        return {
          ...previous,
          ...meta,
          lastMessage: keepLatestPreview ? previous.lastMessage : lastMessage,
          lastTimestamp: Math.max(previousTimestamp, lastTimestamp),
          unreadCount: uid === msg.userId ? 0 : (Number(previous.unreadCount) || 0) + 1
        };
      });
      if (!result.committed) {
        throw new Error(`Não foi possível atualizar a conversa para o participante ${uid}.`);
      }
    }));
    return null;
  });

// Envia push para participantes quando uma nova mensagem é criada
exports.notifyNewMessage = functions.database.ref('/chat/{convId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.val();
    const convId = context.params.convId;

    if (!msg) return null;

    // obter participantes da conversa
    const metaSnap = await admin.database().ref(`/chat_metadata/${convId}/participants`).once('value');
    const participantsObj = metaSnap.exists() ? metaSnap.val() : {};
    const participants = Array.isArray(participantsObj) ? participantsObj : Object.keys(participantsObj || {});

    if (!participants || participants.length === 0) return null;

    // coletar tokens
    const tokens = [];
    for (const uid of participants) {
      if (uid === msg.userId) continue; // não notificar remetente
      try {
        const tSnap = await admin.database().ref(`/usuarios/${uid}/fcmToken`).once('value');
        const token = tSnap.exists() ? tSnap.val() : null;
        if (token) tokens.push(token);
      } catch (e) { console.warn('Erro lendo token', uid, e); }
    }

    if (tokens.length === 0) return null;

    const payload = {
      notification: {
        title: msg.userName || 'Nova mensagem',
        body: msg.text
          ? (msg.text.length > 200 ? msg.text.substring(0,200) + '...' : msg.text)
          : msg.mediaType && msg.mediaType.startsWith('audio/')
            ? 'Novo áudio'
            : msg.mediaType && msg.mediaType.startsWith('image/')
              ? 'Nova imagem'
              : 'Novo anexo',
        icon: '/images/ic_chat.png'
      },
      data: {
        convId: convId,
        senderId: msg.userId || ''
      }
    };

    try {
      const res = await admin.messaging().sendToDevice(tokens, payload);
      return res;
    } catch (e) {
      console.error('Erro enviando notificação', e);
      return null;
    }
  });
