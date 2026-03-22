# CLAUDE.md — 홍성훈 캠프 보안 채팅 시스템

## 프로젝트 개요
조국혁신당 전라남도의원 신대지구 홍성훈 후보 선거캠프 전용 보안 채팅·일정 관리 앱.
PC + Android APK + iOS 홈화면 앱 동시 지원. 실시간 알림 필수.

---

## 🤖 에이전트 팀 운영 규칙

이 프로젝트는 6개 에이전트가 역할을 나눠 병렬 개발한다.
각 에이전트는 자기 담당 디렉토리만 수정하고, 인터페이스(API 명세, 이벤트명)는 반드시 docs/API.md를 따른다.

### Agent 역할표
| Agent | 역할 | 담당 디렉토리 |
|-------|------|--------------|
| ARCHITECT | 설계·의사결정 | docs/ |
| BACKEND | 서버·API·DB | backend/ |
| FRONTEND | React UI | frontend/src/ |
| MOBILE | PWA·APK·아이콘 | pwa/, android-config/ |
| SECURITY | 인증·암호화 | backend/middleware/, backend/utils/encryption.js |
| NOTIFICATION | 알림·푸시 | backend/utils/fcm.js, frontend/src/hooks/useNotification.js |

---

## 기술 스택 (변경 금지)

### Backend
- Node.js 20 + Express 5
- Socket.io 4 (실시간 채팅)
- better-sqlite3 (개발DB) / pg (운영DB)
- jsonwebtoken + bcryptjs (인증)
- firebase-admin (FCM 푸시)
- node-cron (일정 알림 스케줄러)
- express-rate-limit (보안)

### Frontend
- React 18 + Vite 5
- React Router v6
- Zustand (상태관리)
- Socket.io-client
- Tailwind CSS
- date-fns (날짜처리)
- vite-plugin-pwa (PWA)

### Mobile
- Capacitor 5 (Android APK)
- PWA Web Push API
- Firebase Cloud Messaging

---

## 디렉토리 구조

```
hongsunghun-campaign/
├── CLAUDE.md                    ← 이 파일
├── docs/
│   ├── AGENT_TEAM.md            ← 팀 구성 문서
│   └── API.md                   ← API 명세 (에이전트 간 계약)
├── backend/
│   ├── package.json
│   ├── server.js                ← 메인 서버 (Express + Socket.io)
│   ├── database.js              ← DB 초기화 + 스키마
│   ├── routes/
│   │   ├── auth.js
│   │   ├── chat.js
│   │   ├── schedule.js
│   │   └── notification.js
│   ├── models/                  ← DB 쿼리 함수
│   ├── middleware/
│   │   ├── auth.js              ← JWT 검증
│   │   └── roleCheck.js
│   └── utils/
│       ├── fcm.js               ← Firebase 푸시 발송
│       ├── scheduler.js         ← node-cron 일정 알림
│       └── encryption.js        ← AES-256
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── pages/
│       │   ├── LoginPage.jsx
│       │   ├── ChatRoomPage.jsx
│       │   ├── ChatPage.jsx
│       │   ├── SchedulePage.jsx
│       │   ├── ScheduleAddPage.jsx
│       │   └── NotificationPage.jsx
│       ├── components/
│       │   ├── Layout.jsx
│       │   ├── BottomNav.jsx    ← 모바일 하단 탭바
│       │   ├── MessageBubble.jsx
│       │   ├── ScheduleCard.jsx
│       │   └── PushPrompt.jsx   ← 알림 허용 유도 팝업
│       ├── hooks/
│       │   ├── useSocket.js
│       │   ├── useNotification.js
│       │   └── useAuth.js
│       ├── store/
│       │   ├── authStore.js
│       │   ├── chatStore.js
│       │   └── scheduleStore.js
│       └── utils/
│           ├── api.js           ← axios 인스턴스
│           └── pushManager.js   ← FCM 토큰 등록
├── pwa/
│   ├── manifest.json
│   ├── firebase-messaging-sw.js
│   └── icons/                  ← 앱 아이콘 모음
└── android-config/
    ├── capacitor.config.json
    └── BUILD_GUIDE.md
```

---

## 코딩 규칙

1. 모든 API는 `/api/v1/` 접두사
2. 인증 필요 API는 `Authorization: Bearer {JWT}` 헤더
3. 에러 응답 형식: `{ success: false, message: "..." }`
4. 성공 응답 형식: `{ success: true, data: {...} }`
5. Socket.io 이벤트명: snake_case (예: `new_message`, `schedule_update`)
6. React 컴포넌트: PascalCase
7. 훅: camelCase, use 접두사
8. 민감 정보: .env 파일 (절대 하드코딩 금지)

---

## .env 필수 항목

### backend/.env
```
PORT=3001
JWT_SECRET=캠프전용시크릿키_최소32자
DATABASE_PATH=./campaign.db
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=
INVITE_CODE=캠프초대코드_직접설정
```

### frontend/.env
```
VITE_API_URL=http://localhost:3001
VITE_SOCKET_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_VAPID_KEY=
```

---

## 보안 필수 사항

- 회원가입: 초대 코드 없으면 가입 불가 (외부인 차단)
- 채팅방: 관리자만 생성 가능
- 메시지: 서버 저장 시 AES-256 암호화
- JWT: 24시간 만료, Refresh Token 없음 (재로그인 방식)
- CORS: 화이트리스트 도메인만 허용

---

## 알림 트리거 목록

| 이벤트 | 발송 시점 | FCM 타이틀 |
|--------|-----------|-----------|
| 새 채팅 메시지 | 즉시 | "💬 새 메시지" |
| 새 채팅방 초대 | 즉시 | "📢 채팅방 초대" |
| 긴급 공지 | 관리자 수동 | "🚨 긴급 공지" |
| 일정 D-1 | 매일 오전 8시 | "📅 내일 일정 알림" |
| 일정 당일 | 매일 오전 7시 | "🗓️ 오늘 일정" |
| 선거일 카운트 | 매일 오전 7시 | "🗳️ 선거 D-{N}일" |

---

## Phase 1 작업 지시 (지금 당장 실행)

Claude Code를 열고 아래 순서로 실행:

### Step 1. 의존성 설치
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Step 2. Backend 먼저
```
backend/database.js 작성 (스키마 포함)
backend/server.js 작성
backend/routes/auth.js 작성
backend/routes/chat.js 작성
backend/routes/schedule.js 작성
backend/utils/fcm.js 작성
backend/utils/scheduler.js 작성
```

### Step 3. Frontend
```
frontend/src/App.jsx (라우터 설정)
frontend/src/pages/LoginPage.jsx
frontend/src/pages/ChatRoomPage.jsx
frontend/src/pages/ChatPage.jsx
frontend/src/pages/SchedulePage.jsx
frontend/src/pages/ScheduleAddPage.jsx
```

### Step 4. PWA + 알림
```
frontend/vite.config.jsㅁㄴ (PWA 플러그인)
pwa/manifest.json
public/firebase-messaging-sw.js
frontend/src/hooks/useNotification.js
frontend/src/utils/pushManager.js
```

### Step 5. 모바일화
```
android-config/capacitor.config.json
android-config/BUILD_GUIDE.md
```
