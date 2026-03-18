// public/firebase-messaging-sw.js — Agent: NOTIFICATION + MOBILE
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: self.FIREBASE_API_KEY || '',
  authDomain: self.FIREBASE_AUTH_DOMAIN || '',
  projectId: self.FIREBASE_PROJECT_ID || '',
  messagingSenderId: self.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: self.FIREBASE_APP_ID || ''
});

const messaging = firebase.messaging();

// 백그라운드 메시지 수신
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification;
  const data = payload.data || {};

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.type || 'general',
    data: { url: getUrlFromData(data) },
    actions: [
      { action: 'open', title: '열기' },
      { action: 'close', title: '닫기' }
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.type === 'urgent'
  });
});

function getUrlFromData(data) {
  if (data.type === 'chat' && data.roomId) return `/chat/${data.roomId}`;
  if (data.type === 'schedule') return '/schedule';
  return '/';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
