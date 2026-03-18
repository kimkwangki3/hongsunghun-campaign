// src/utils/pushManager.js
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { api } from './api';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export async function initPushNotifications() {
  if (!firebaseConfig.apiKey) {
    console.warn('Firebase 설정 없음 — 푸시 비활성화');
    return;
  }
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const messaging = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      const platform = /android/i.test(navigator.userAgent) ? 'android'
        : /iphone|ipad/i.test(navigator.userAgent) ? 'ios' : 'web';
      await api.put('/auth/fcm-token', { token, platform });
      console.log('✅ FCM 토큰 등록 완료');
    }

    onMessage(messaging, payload => {
      const { title, body } = payload.notification || {};
      if (title) new Notification(title, { body, icon: '/icons/icon-192.png' });
    });
  } catch (err) {
    console.warn('FCM 초기화 실패:', err.message);
  }
}
