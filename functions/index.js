const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

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
        body: msg.text ? (msg.text.length > 200 ? msg.text.substring(0,200) + '...' : msg.text) : 'Novo anexo',
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
