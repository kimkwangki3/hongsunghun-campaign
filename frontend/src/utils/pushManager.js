// pushManager.js — APK(Capacitor)는 네이티브 FCM, 웹은 Firebase Web SDK
import { api } from './api';

/* Capacitor 환경 감지 */
function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();
}

/* ── APK(네이티브 Android) FCM 등록 ── */
async function initCapacitorPush() {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') {
      console.warn('APK 알림 권한 거부됨');
      return;
    }

    PushNotifications.addListener('registration', async ({ value: token }) => {
      try {
        await api.put('/auth/fcm-token', { token, platform: 'android' });
        console.log('✅ APK FCM 토큰 등록:', token.slice(0, 20) + '...');
      } catch (e) {
        console.warn('FCM 토큰 서버 등록 실패:', e.message);
      }
    });

    PushNotifications.addListener('registrationError', err => {
      console.warn('FCM 등록 오류:', err.error);
    });

    // 알림 탭 했을 때 해당 채팅방으로 이동
    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const roomId = action.notification.data?.roomId;
      if (roomId) window.location.href = `/chat/${roomId}`;
    });

    await PushNotifications.register();
    console.log('✅ APK PushNotifications 등록 완료');

  } catch (err) {
    console.warn('Capacitor PushNotifications 초기화 실패:', err.message);
  }
}

/* ── 웹 브라우저 Firebase Web SDK FCM 등록 ── */
async function initWebPush() {
  const firebaseConfig = {
    apiKey:            "AIzaSyDvoaDQb1nqU0XIRBeLOW_RXVi7MdntQvs",
    authDomain:        "hongsunghun-campaign.firebaseapp.com",
    projectId:         "hongsunghun-campaign",
    storageBucket:     "hongsunghun-campaign.firebasestorage.app",
    messagingSenderId: "695928517195",
    appId:             "1:695928517195:web:458dc9036dc5f5af1853ce",
  };

  const VAPID_KEY = "BNAplOVSA2PwRJp-n3Xy-ZCCmzLFlN9Kg76yp0A-or2hDM21D5UZO8qwvnhCNTwlKOBmGfdwozKCAMHXlb22HWo";

  try {
    const { initializeApp, getApps } = await import('firebase/app');
    const { getMessaging, getToken, onMessage } = await import('firebase/messaging');

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    const messaging = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // VitePWA가 이미 등록한 SW 사용 (SW 중복 충돌 방지)
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      await api.put('/auth/fcm-token', { token, platform: 'web' });
      console.log('✅ 웹 FCM 토큰 등록 완료');
    }

    onMessage(messaging, ({ notification }) => {
      if (notification?.title)
        new Notification(notification.title, { body: notification.body, icon: '/icons/icon-192.png' });
    });

  } catch (err) {
    console.warn('웹 FCM 초기화 실패:', err.message);
  }
}

/* ── 진입점 ── */
export async function initPushNotifications() {
  if (isCapacitor()) {
    await initCapacitorPush();
  } else {
    await initWebPush();
  }
}
