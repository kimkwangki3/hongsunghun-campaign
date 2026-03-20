// Firebase 메시징 핸들러 — VitePWA(Workbox) SW에 importScripts로 포함됨
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

if (!firebase.apps.length) {
  firebase.initializeApp({
    apiKey:            "AIzaSyDvoaDQb1nqU0XIRBeLOW_RXVi7MdntQvs",
    authDomain:        "hongsunghun-campaign.firebaseapp.com",
    projectId:         "hongsunghun-campaign",
    storageBucket:     "hongsunghun-campaign.firebasestorage.app",
    messagingSenderId: "695928517195",
    appId:             "1:695928517195:web:458dc9036dc5f5af1853ce"
  });
}

const messaging = firebase.messaging();

function getUrlFromData(data) {
  if (data.type === 'chat' && data.roomId) return '/chat/' + data.roomId;
  if (data.type === 'schedule') return '/schedule';
  return '/';
}

// 백그라운드(슬립) 메시지 수신
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  if (!title) return;

  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.type || 'general',
    data: { url: getUrlFromData(data) },
    vibrate: [200, 100, 200],
    requireInteraction: data.type === 'urgent'
  });
});

// 알림 탭 → 해당 페이지로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
