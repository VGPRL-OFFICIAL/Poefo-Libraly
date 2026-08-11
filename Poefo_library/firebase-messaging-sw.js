importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

// Inicialize o SDK do Firebase no service worker com sua configuração do projeto
firebase.initializeApp({
  apiKey: "AIzaSyDa373d5z6_VXUKPLTvXy5rYm7tNy0aSS0",
  authDomain: "captu-libraly.firebaseapp.com",
  databaseURL: "https://captu-libraly-default-rtdb.firebaseio.com",
  projectId: "captu-libraly",
  storageBucket: "captu-libraly.firebasestorage.app",
  messagingSenderId: "341104400887",
  appId: "1:341104400887:web:8304c9aa2855dd945236f2"
});

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
