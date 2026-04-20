// utils/fcm.js — Agent: NOTIFICATION
const admin = require('firebase-admin');

let initialized = false;
let dbRef = null; // DB 참조 (토큰 정리용)

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

// DB 참조 설정 (server.js에서 호출)
function setDb(db) { dbRef = db; }

// 만료/무효 토큰 DB에서 삭제
async function removeInvalidTokens(tokens) {
  if (!dbRef || !tokens.length) return;
  for (const t of tokens) {
    try { await dbRef.run('DELETE FROM device_tokens WHERE token = $1', [t]); } catch (_) {}
  }
  if (tokens.length > 0) console.log(`[FCM] 무효 토큰 ${tokens.length}개 정리`);
}

// 단건 or 다건 푸시 발송
async function sendPush(tokens, { title, body, data = {} }) {
  if (!initialized || !tokens || tokens.length === 0) return;
  const tokenList = [...new Set(Array.isArray(tokens) ? tokens : [tokens])].filter(Boolean);
  if (tokenList.length === 0) return;

  const payload = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { sound: 'default', channelId: 'campaign' } },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    webpush: { notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png' } }
  };

  try {
    if (tokenList.length === 1) {
      try {
        await admin.messaging().send({ token: tokenList[0], ...payload });
      } catch (err) {
        // 토큰 무효 에러 → 정리
        if (err.code === 'messaging/invalid-registration-token' ||
            err.code === 'messaging/registration-token-not-registered') {
          removeInvalidTokens([tokenList[0]]);
        } else {
          console.error('[FCM] 단건 발송 실패:', err.code || err.message);
        }
      }
    } else {
      const res = await admin.messaging().sendEachForMulticast({ tokens: tokenList, ...payload });
      // 실패 토큰 정리
      if (res.failureCount > 0) {
        const invalidTokens = [];
        res.responses.forEach((r, i) => {
          if (!r.success && r.error) {
            const code = r.error.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(tokenList[i]);
            }
          }
        });
        removeInvalidTokens(invalidTokens);
      }
      console.log(`[FCM] 발송 완료: ${res.successCount}성공 / ${res.failureCount}실패 (총 ${tokenList.length})`);
    }
  } catch (err) {
    console.error('[FCM] 발송 오류:', err.message);
  }
}

async function sendPushToAll(tokens, payload) {
  return sendPush(tokens, payload);
}

module.exports = { sendPush, sendPushToAll, setDb };
