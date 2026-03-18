# 🗳️ 홍성훈 캠프 — 보안 채팅·일정 시스템

조국혁신당 전라남도의원 신대지구 홍성훈 후보 선거캠프 전용 앱
PC · Android APK · iPhone 홈화면 앱 동시 지원

## ⚡ 5분 빠른 시작

### 1단계 — 백엔드
```bash
cd backend
cp .env.example .env      # INVITE_CODE 설정
npm install
npm start                 # → http://localhost:3001
```

### 2단계 — 프론트엔드
```bash
cd frontend
cp .env.example .env      # VITE_API_URL 확인
npm install
npm run dev               # → http://localhost:5173
```

### 3단계 — 가입
1. http://localhost:5173 접속
2. "가입" 탭 → 이름·전화번호·비밀번호·초대코드 입력
3. 로그인 후 사용 시작

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 보안 채팅 | 초대코드 접근 + AES-256 암호화 |
| 실시간 메시지 | Socket.io |
| 선거 일정 10개 | 자동 등록 (예비후보~회계보고) |
| 달력 + D-Day | 선거일까지 카운트 |
| 푸시 알림 | Android·iPhone·PC 동시 |
| 긴급 공지 | 관리자 전체 발송 |

---

## 📱 모바일

**Android APK** → android-config/BUILD_GUIDE.md 참고
**iPhone 홈화면** → Safari 공유버튼 → "홈 화면에 추가"

---

## 🔒 보안 필수

- JWT_SECRET 32자 이상으로 변경
- INVITE_CODE 어렵게 설정
- 배포 시 HTTPS 사용
- Firebase 키 절대 GitHub 커밋 금지

---

순천시선거관리위원회: 061-729-1390
