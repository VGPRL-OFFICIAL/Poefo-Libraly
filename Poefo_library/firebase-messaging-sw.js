importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
  apiKey: 'AIzaSyDa373d5z6_VXUKPLTvXy5rYm7tNy0aSS0',
  authDomain: 'captu-libraly.firebaseapp.com',
  databaseURL: 'https://captu-libraly-default-rtdb.firebaseio.com',
  projectId: 'captu-libraly',
  storageBucket: 'captu-libraly.firebasestorage.app',
  messagingSenderId: '341104400887',
  appId: '1:341104400887:web:8304c9aa2855dd945236f2',
  measurementId: 'G-7NM9CC35CX'
});

const messaging = firebase.messaging();

// Manipula mensagens recebidas em background
messaging.setBackgroundMessageHandler(function(payload) {
  const data = payload.data || {};
  const title = data.title || 'Nova mensagem';
  return self.registration.showNotification(title, {
    body: data.body || '',
    icon: data.icon || '/images/ic_chat.png',
    tag: data.convId ? `chat-${data.convId}` : undefined,
    renotify: false,
    data: { convId: data.convId || '' }
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const chatUrl = new URL('/html/chat.html', self.location.origin);
  if (event.notification.data && event.notification.data.convId) {
    chatUrl.searchParams.set('conversation', event.notification.data.convId);
  }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
    const chatClient = windowClients.find(client => {
      const clientUrl = new URL(client.url);
      return clientUrl.origin === chatUrl.origin && clientUrl.pathname.endsWith('/html/chat.html');
    });
    if (chatClient) {
      return chatClient.navigate(chatUrl.href).then(client => client.focus());
    }
    return self.clients.openWindow(chatUrl.href);
  }));
});
