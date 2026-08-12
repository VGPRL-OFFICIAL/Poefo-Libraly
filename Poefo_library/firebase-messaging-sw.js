importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// Inicialize o SDK do Firebase no service worker com sua configuração do projeto
firebase.initializeApp(self.POEFO_FIREBASE_CONFIG);

const messaging = firebase.messaging();

// Manipula mensagens recebidas em background
messaging.setBackgroundMessageHandler(function(payload) {
  try {
    const notification = payload.notification || {};
    const title = notification.title || 'Nova mensagem';
    const options = {
      body: notification.body || '',
      icon: notification.icon || '/images/ic_chat.png',
      data: payload.data || {}
    };
    return self.registration.showNotification(title, options);
  } catch (e) {
    return null;
  }
});
