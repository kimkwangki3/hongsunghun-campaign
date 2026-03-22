# Backend 에이전트 — 역할 정의

## 담당 파일
- `backend/server.js`
- `backend/routes/*.js`
- `backend/middleware/*.js`
- `backend/utils/encryption.js`, `backend/utils/scheduler.js`

## 기술 스택
- Node.js 20 + Express 4 (package.json엔 ^4, Express 5 아님)
- socket.io 4
- express-rate-limit 7 (trust proxy 필수)
- firebase-admin 12

## API 규칙
- 모든 경로: `/api/v1/` 접두사
- 성공: `{ success: true, data: {...} }`
- 실패: `{ success: false, message: "..." }`
- 인증 필요: `verifyToken` 미들웨어

## 알려진 실수 목록
- ❌ `app.set('trust proxy', ...)` 누락 → Render에서 X-Forwarded-For ValidationError 발생 후 서버 크래시
- ❌ 메시지 전송 시 `sendPush` await 없이 호출하면 에러 무시됨 → `.catch(() => {})` 체이닝 필수
- ❌ `compression()` 미들웨어 없으면 응답 크기 2~3배
- ❌ DM방 admin 소켓 emit 시 `onlineUsers.get(a.id)` undefined 체크 안 하면 크래시
- ❌ `package.json`에 같은 패키지 중복 항목 추가 금지 (`pg`, `multer` 중복 사례 발생)

## 환경변수 목록 (절대 하드코딩 금지)
```
PORT, JWT_SECRET, DATABASE_URL, FIREBASE_PROJECT_ID,
FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL,
INVITE_CODE, ALLOWED_ORIGINS
```

## 서버 시작 순서
1. `app.set('trust proxy', 1)` — 반드시 첫 번째
2. cors → helmet → compression → express.json
3. rate limiter
4. socket.io 설정
5. 라우터 등록
6. 에러 핸들러 (마지막)
