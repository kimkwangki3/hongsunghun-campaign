// utils/fcm.js — Agent: NOTIFICATION
const admin = require('firebase-admin');

let initialized = false;

function initFirebase() {
  if (initialized) return;
  if (!process.env.FIREBASE_PROJECT_ID) {
    console.warn('⚠️ Firebase 환경변수 미설정 — 푸시 알림 비활성화');
    return;
  }
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    })
  });
  initialized = true;
  console.log('✅ Firebase Admin 초기화 완료');
}

initFirebase();

// 단건 or 다건 푸시 발송
async function sendPush(tokens, { title, body, data = {} }) {
  if (!initialized || !tokens || tokens.length === 0) return;
  const tokenList = Array.isArray(tokens) ? tokens : [tokens];

  try {
    if (tokenList.length === 1) {
      await admin.messaging().send({
        token: tokenList[0],
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high', notification: { sound: 'default', channelId: 'campaign' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        webpush: { notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png' } }
      });
    } else {
      await admin.messaging().sendEachForMulticast({
        tokens: tokenList,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } }
      });
    }
  } catch (err) {
    console.error('FCM 발송 오류:', err.message);
  }
}

async function sendPushToAll(tokens, payload) {
  return sendPush(tokens, payload);
}

module.exports = { sendPush, sendPushToAll };
