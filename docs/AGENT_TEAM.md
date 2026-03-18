# 홍성훈 캠프 보안 채팅 시스템 - 에이전트 팀 구성

## 🏗️ 전체 아키텍처

```
[PWA / Android APK / iOS 홈화면 앱]
         ↓
  [React + Vite 프론트엔드]
         ↓
  [Node.js + Express 백엔드]
    ├── WebSocket (Socket.io) ← 실시간 채팅 + 알림
    ├── REST API              ← 일정, 인증, 파일
    └── Push Notification     ← FCM (Firebase Cloud Messaging)
         ↓
  [SQLite / PostgreSQL DB]
  [Firebase FCM]
```

## 🤖 에이전트 팀 역할 분담

---

### Agent 1 — 아키텍트 (ARCHITECT)
**담당**: 전체 설계 및 기술 의사결정
- 기술 스택 선택
- DB 스키마 설계
- API 명세 작성
- 보안 정책 수립

**결정사항**:
- Frontend: React 18 + Vite + Tailwind CSS
- Backend: Node.js + Express + Socket.io
- DB: SQLite (개발) → PostgreSQL (운영)
- Push: Firebase Cloud Messaging (FCM)
- PWA: Vite PWA Plugin (Workbox)
- Android APK: Capacitor.js (웹→APK 변환)
- 인증: JWT + bcrypt

---

### Agent 2 — 백엔드 개발자 (BACKEND)
**담당**: 서버, API, 실시간 통신, 푸시 알림

**구현 모듈**:
```
backend/
├── server.js              # Express + Socket.io 서버
├── routes/
│   ├── auth.js            # 로그인/인증 API
│   ├── chat.js            # 채팅방 API
│   ├── schedule.js        # 일정 CRUD API
│   └── notification.js    # 알림 발송 API
├── models/
│   ├── User.js            # 사용자 모델
│   ├── Message.js         # 메시지 모델
│   ├── Schedule.js        # 일정 모델
│   └── Room.js            # 채팅방 모델
├── middleware/
│   ├── auth.js            # JWT 인증 미들웨어
│   └── roleCheck.js       # 권한 체크
└── utils/
    ├── fcm.js             # Firebase 푸시 발송
    └── encryption.js      # 메시지 암호화
```

---

### Agent 3 — 프론트엔드 개발자 (FRONTEND)
**담당**: React 앱, UI/UX, 반응형 디자인

**구현 페이지**:
```
frontend/src/pages/
├── LoginPage.jsx          # 로그인
├── ChatRoomPage.jsx       # 채팅방 목록
├── ChatPage.jsx           # 채팅 화면
├── SchedulePage.jsx       # 일정 목록/캘린더
├── ScheduleAddPage.jsx    # 일정 등록
├── NotificationPage.jsx   # 알림 목록
└── AdminPage.jsx          # 관리자 (회원 관리)
```

---

### Agent 4 — PWA/모바일 엔지니어 (MOBILE)
**담당**: PWA 설정, APK 빌드, iOS 홈화면 아이콘

**구현 항목**:
```
pwa/
├── manifest.json          # PWA 매니페스트 (아이콘, 이름)
├── sw.js                  # Service Worker (오프라인 + 백그라운드 푸시)
├── firebase-messaging-sw.js  # FCM 백그라운드 수신
└── icons/                 # 앱 아이콘 (512x512, 192x192, 180x180)

android-config/
├── capacitor.config.json  # Capacitor 설정
└── BUILD_GUIDE.md         # APK 빌드 가이드
```

**iOS 홈화면 추가 방법**:
- apple-touch-icon 메타태그 설정
- Safari "홈 화면에 추가" 안내 팝업 내장

---

### Agent 5 — 보안 담당 (SECURITY)
**담당**: 채팅 보안, 접근 제어, 데이터 보호

**보안 정책**:
- 초대 코드 기반 회원가입 (외부인 차단)
- JWT 토큰 만료 24시간
- 메시지 AES-256 암호화 저장
- HTTPS 강제 (배포 시)
- Rate Limiting (무차별 요청 차단)
- 채팅방 역할: 관리자 / 캠프원 / 뷰어

---

### Agent 6 — 알림 전문가 (NOTIFICATION)
**담당**: 실시간 알림, 푸시 알림, 일정 알림

**알림 유형**:
| 유형 | 트리거 | 대상 |
|------|--------|------|
| 새 메시지 | 채팅 수신 | 해당 방 멤버 |
| 일정 D-1 알림 | 스케줄러 (매일 오전 8시) | 전체 캠프원 |
| 일정 당일 알림 | 스케줄러 (당일 오전 7시) | 전체 캠프원 |
| 긴급 공지 | 관리자 발송 | 전체 캠프원 |
| 선거 D-Day 카운트 | 자동 (매일) | 전체 |

**플랫폼별 알림 방식**:
- **Android**: FCM → 네이티브 푸시 (APK)
- **iOS**: FCM → PWA 백그라운드 알림 (Safari 16.4+)
- **PC (Chrome/Edge)**: Web Push API + FCM
- **앱 내부**: Socket.io 실시간 배지 + 토스트

---

## 📅 선거 관련 핵심 일정 (사전 입력)

시스템 초기화 시 아래 일정이 자동 등록됨:

| 날짜 | 내용 | 알림 |
|------|------|------|
| 2026.02.20 | 예비후보자 등록 개시 | ✅ |
| 2026.03.05 | 공직자 사직 기한 / 딥페이크 금지 시작 | ✅ |
| 2026.04.04 | 지자체장 선거영향 행위 금지 시작 | ✅ |
| 2026.05.14~15 | 후보자 등록 신청 | ✅ |
| 2026.05.21 | 선거기간 개시 (선거운동 시작) | ✅ |
| 2026.05.29~30 | 사전투표 | ✅ |
| 2026.06.03 | 선거일 🗳️ | ✅ |
| 2026.06.15 | 선거비용 보전 청구 기한 | ✅ |
| 2026.07.03 | 회계보고서 제출 기한 | ✅ |

---

## 🚀 개발 순서 (Claude Code 작업 순서)

```
Phase 1 - 기반 구축 (오늘)
  ✅ 프로젝트 설계 문서
  → backend/server.js + DB 스키마
  → 인증 시스템 (JWT)
  → Socket.io 채팅 기반

Phase 2 - 프론트엔드 핵심
  → React 앱 + 라우팅
  → 채팅 UI (모바일 최적화)
  → 일정 페이지 + 등록 페이지

Phase 3 - 알림 시스템
  → FCM 연동
  → Service Worker
  → 스케줄러 (node-cron)

Phase 4 - 모바일화
  → PWA manifest + 아이콘
  → Capacitor APK 설정
  → iOS 홈화면 가이드
```
