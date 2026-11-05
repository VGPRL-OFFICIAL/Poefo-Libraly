const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp({
  databaseURL: 'https://captu-libraly-default-rtdb.firebaseio.com'
});

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

// Eu crio o índice da conversa para cada membro e mantenho chat_users privado por usuário.
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

// Eu atualizo a lista e o contador de não lidas de cada membro quando recebo uma mensagem.
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
        ? { ...current, lastMessage, lastTimestamp, lastMessageSenderId: msg.userId || null }
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
          lastMessageSenderId: keepLatestPreview
            ? (previous.lastMessageSenderId || meta.lastMessageSenderId || null)
            : (msg.userId || null),
          unreadCount: uid === msg.userId ? 0 : (Number(previous.unreadCount) || 0) + 1
        };
      });
      if (!result.committed) {
        throw new Error(`Não foi possível atualizar a conversa para o participante ${uid}.`);
      }
    }));
    return null;
  });

// Eu envio uma notificação push aos participantes quando uma nova mensagem é criada.
exports.notifyNewMessage = functions.database.ref('/chat/{convId}/messages/{msgId}')
  .onCreate(async (snap, context) => {
    const msg = snap.val();
    const convId = context.params.convId;

    if (!msg) return null;

    // Eu busco os participantes da conversa.
    const metaSnap = await admin.database().ref(`/chat_metadata/${convId}/participants`).once('value');
    const participantsObj = metaSnap.exists() ? metaSnap.val() : {};
    const participants = Array.isArray(participantsObj) ? participantsObj : Object.keys(participantsObj || {});

    if (!participants || participants.length === 0) return null;

    // Eu reúno os tokens de notificação dos participantes.
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

async function getAuthenticatedProfileId(authUid, profileId) {
  const profileSnapshot = await admin.database().ref(`usuarios/${profileId}`).once('value');
  const profile = profileSnapshot.val();
  if (!profile || profile.authUid !== authUid) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Não encontramos um perfil vinculado à sua conta autenticada.'
    );
  }
  return profileId;
}

function validateFollowRequest(data, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Entre na sua conta para seguir pessoas.');
  }

  const followerId = String(data && data.followerUserId || '');
  const followedId = String(data && data.targetUserId || '');
  const invalidDatabaseKey = value =>
    !value || value.length > 768 || ['.', '#', '$', '[', ']', '/'].some(character => value.includes(character));
  if (invalidDatabaseKey(followerId) || invalidDatabaseKey(followedId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Os dados para seguir este perfil são inválidos.');
  }
  if (followerId === followedId) {
    throw new functions.https.HttpsError('invalid-argument', 'Não é possível seguir o próprio perfil.');
  }
  return { followerId, followedId };
}

function countRelationships(snapshot) {
  const relationships = snapshot.val() || {};
  return Object.values(relationships).filter(isFollowing => isFollowing === true).length;
}

async function validateFollowProfiles(db, authUid, followerId, followedId) {
  const [authenticatedProfileId, targetSnapshot] = await Promise.all([
    getAuthenticatedProfileId(authUid, followerId),
    db.ref(`usuarios/${followedId}`).once('value')
  ]);
  if (!targetSnapshot.exists()) {
    throw new functions.https.HttpsError('not-found', 'O perfil que você tentou seguir não existe.');
  }
  return authenticatedProfileId;
}

exports.getFollowStatus = functions.https.onCall(async (data, context) => {
  const { followerId, followedId } = validateFollowRequest(data, context);
  const db = admin.database();
  await validateFollowProfiles(db, context.auth.uid, followerId, followedId);

  const [relationshipSnapshot, followersSnapshot, followingSnapshot] = await Promise.all([
    db.ref(`follows/${followerId}/${followedId}`).once('value'),
    db.ref(`followers/${followedId}`).once('value'),
    db.ref(`follows/${followedId}`).once('value')
  ]);
  return {
    following: relationshipSnapshot.val() === true,
    followersCount: countRelationships(followersSnapshot),
    followingCount: countRelationships(followingSnapshot)
  };
});

exports.toggleFollow = functions.https.onCall(async (data, context) => {
  const { followerId, followedId } = validateFollowRequest(data, context);
  const shouldFollow = data && data.following;
  if (typeof shouldFollow !== 'boolean') {
    throw new functions.https.HttpsError('invalid-argument', 'A ação de seguimento é inválida.');
  }

  const db = admin.database();
  await validateFollowProfiles(db, context.auth.uid, followerId, followedId);

  const relationshipRef = db.ref(`follows/${followerId}/${followedId}`);
  let changed = false;
  const result = await relationshipRef.transaction(current => {
    const currentlyFollowing = current === true;
    changed = currentlyFollowing !== shouldFollow;
    if (!changed) return current;
    return shouldFollow ? true : null;
  }, undefined, false);
  if (!result.committed) {
    throw new functions.https.HttpsError('aborted', 'Não foi possível atualizar o vínculo. Tente novamente.');
  }

  if (changed) {
    const delta = shouldFollow ? 1 : -1;
    await db.ref().update({
      [`followers/${followedId}/${followerId}`]: shouldFollow ? true : null
    });
    await Promise.all([
      db.ref(`followers_count/${followedId}`).transaction(current =>
        Math.max(0, (Number(current) || 0) + delta), undefined, false
      ),
      db.ref(`following_count/${followerId}`).transaction(current =>
        Math.max(0, (Number(current) || 0) + delta), undefined, false
      )
    ]);
  }

  const [followersSnapshot, followingSnapshot] = await Promise.all([
    db.ref(`followers/${followedId}`).once('value'),
    db.ref(`follows/${followedId}`).once('value')
  ]);
  return {
    following: shouldFollow,
    followersCount: countRelationships(followersSnapshot),
    followingCount: countRelationships(followingSnapshot)
  };
});

exports.deleteFeedPost = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Entre na sua conta para excluir uma publicação.');
  }

  const profileId = String(data && data.profileId || '');
  const postId = String(data && data.postId || '');
  const invalidDatabaseKey = value =>
    !value || value.length > 768 || ['.', '#', '$', '[', ']', '/'].some(character => value.includes(character));
  if (invalidDatabaseKey(profileId) || invalidDatabaseKey(postId)) {
    throw new functions.https.HttpsError('invalid-argument', 'O identificador da publicação é inválido.');
  }
  const authenticatedProfileId = await getAuthenticatedProfileId(context.auth.uid, profileId);
  if (authenticatedProfileId !== profileId) {
    throw new functions.https.HttpsError('permission-denied', 'O perfil ativo não corresponde à conta autenticada.');
  }

  const postFile = admin.storage().bucket('captu-libraly.firebasestorage.app').file('livros_json/posts.json');
  let metadata;
  let posts;
  try {
    [metadata] = await postFile.getMetadata();
    const [contents] = await postFile.download();
    posts = JSON.parse(contents.toString('utf8'));
  } catch (error) {
    console.error('Não foi possível ler o catálogo de publicações:', error);
    throw new functions.https.HttpsError('internal', 'Não foi possível carregar as publicações.');
  }
  if (!Array.isArray(posts)) {
    throw new functions.https.HttpsError('internal', 'O arquivo de publicações possui um formato inválido.');
  }

  const postIndex = posts.findIndex(post => String(post && (post.id ?? post.postId) || '') === postId);
  if (postIndex < 0) {
    throw new functions.https.HttpsError('not-found', 'A publicação não existe mais.');
  }
  const post = posts[postIndex];
  const authorId = post.userId || post.userID || post.authorId
    || post.author?.userId || post.author?.userID
    || post.autor?.userId || post.autor?.userID;
  if (String(authorId || '') !== profileId) {
    throw new functions.https.HttpsError('permission-denied', 'Você só pode excluir suas próprias publicações.');
  }

  posts.splice(postIndex, 1);
  try {
    await postFile.save(JSON.stringify(posts, null, 2), {
      resumable: false,
      metadata: {
        contentType: 'application/json',
        cacheControl: 'no-cache, max-age=0',
        metadata: metadata.metadata || {}
      },
      preconditionOpts: { ifGenerationMatch: metadata.generation }
    });
    await admin.database().ref().update({
      [`post_stats/${postId}`]: null,
      [`post_likes/${postId}`]: null
    });
  } catch (error) {
    console.error('Não foi possível salvar a exclusão da publicação:', error);
    throw new functions.https.HttpsError('internal', 'Não foi possível salvar a exclusão. Tente novamente.');
  }

  return { deleted: true, postId };
});

exports.deleteChatMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Entre na sua conta para excluir uma mensagem.');
  }

  const profileId = String(data && data.profileId || '');
  const convId = String(data && data.convId || '');
  const msgId = String(data && data.msgId || '');
  const invalidDatabaseKey = value =>
    !value || value.length > 768 || ['.', '#', '$', '[', ']', '/'].some(character => value.includes(character));
  if (invalidDatabaseKey(profileId) || invalidDatabaseKey(convId) || invalidDatabaseKey(msgId)) {
    throw new functions.https.HttpsError('invalid-argument', 'Os dados da mensagem são inválidos.');
  }
  await getAuthenticatedProfileId(context.auth.uid, profileId);

  const db = admin.database();
  const metadataRef = db.ref(`chat_metadata/${convId}`);
  const [metadataSnapshot, messageSnapshot] = await Promise.all([
    metadataRef.once('value'),
    db.ref(`chat/${convId}/messages/${msgId}`).once('value')
  ]);
  const metadata = metadataSnapshot.val();
  const message = messageSnapshot.val();
  const participants = metadata && metadata.participants;
  const isParticipant = Array.isArray(participants)
    ? participants.includes(profileId)
    : Boolean(participants && participants[profileId]);
  if (!metadata || !isParticipant) {
    throw new functions.https.HttpsError('permission-denied', 'Você não participa desta conversa.');
  }
  if (!message) {
    throw new functions.https.HttpsError('not-found', 'A mensagem não existe mais.');
  }
  if (String(message.userId || '') !== profileId) {
    throw new functions.https.HttpsError('permission-denied', 'Você só pode excluir suas próprias mensagens.');
  }

  const latestBeforeDelete = await db.ref(`chat/${convId}/messages`)
    .orderByChild('timestamp')
    .limitToLast(1)
    .once('value');
  let latestMessageId = null;
  latestBeforeDelete.forEach(child => {
    latestMessageId = child.key;
  });
  await db.ref(`chat/${convId}/messages/${msgId}`).remove();

  if (latestMessageId === msgId) {
    const remainingMessages = await db.ref(`chat/${convId}/messages`)
      .orderByChild('timestamp')
      .limitToLast(1)
      .once('value');
    let latestMessage = null;
    remainingMessages.forEach(child => {
      latestMessage = child.val();
    });

    const preview = {
      lastMessage: latestMessage ? getMessagePreview(latestMessage) : '',
      lastTimestamp: latestMessage
        ? Number(latestMessage.timestamp) || 0
        : Number(metadata.createdAt) || 0,
      lastMessageSenderId: latestMessage ? latestMessage.userId || null : null
    };
    const updates = {};
    Object.entries(preview).forEach(([key, value]) => {
      updates[`chat_metadata/${convId}/${key}`] = value;
    });
    const participants = getConversationParticipants(metadata);
    const conversationEntries = await Promise.all(participants.map(async participantId => {
      const entryRef = db.ref(`chat_users/${participantId}/conversations/${convId}`);
      const entrySnapshot = await entryRef.once('value');
      return entrySnapshot.exists() ? participantId : null;
    }));
    conversationEntries.filter(Boolean).forEach(participantId => {
      Object.entries(preview).forEach(([key, value]) => {
        updates[`chat_users/${participantId}/conversations/${convId}/${key}`] = value;
      });
    });
    await db.ref().update(updates);
  }

  return { deleted: true, convId, msgId };
});
