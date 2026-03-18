# 📱 모바일 빌드 가이드

## Android APK 빌드

### 사전 준비
- Node.js 20+
- Android Studio (무료) 설치
- Java JDK 17+

### Step 1. 의존성 설치
```bash
cd frontend
npm install
npm run build  # dist/ 폴더 생성

# Capacitor 설치
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init
```

### Step 2. capacitor.config.json 복사
```bash
cp ../android-config/capacitor.config.json ./capacitor.config.json
```

### Step 3. Android 프로젝트 생성
```bash
npx cap add android
npx cap sync android
```

### Step 4. Android Studio에서 빌드
```bash
npx cap open android
# Android Studio가 열리면:
# Build → Generate Signed Bundle / APK → APK
# → 서명 키 생성 또는 기존 키 사용
# → Release 선택 → Finish
```

### APK 파일 위치
```
android/app/build/outputs/apk/release/app-release.apk
```

### 앱 아이콘 설정
```bash
# android/app/src/main/res/
# mipmap-hdpi/    → 72x72
# mipmap-mdpi/    → 48x48
# mipmap-xhdpi/   → 96x96
# mipmap-xxhdpi/  → 144x144
# mipmap-xxxhdpi/ → 192x192
# ic_launcher.png, ic_launcher_round.png 교체
```

---

## iOS 홈화면 추가 방법 (별도 앱 없이)

iOS는 App Store 없이도 PWA를 홈화면에 추가할 수 있습니다.

### 사용자 안내 방법

1. **Safari 브라우저**로 앱 주소 접속
2. 하단 **공유 버튼** (□↑) 터치
3. **"홈 화면에 추가"** 선택
4. 이름 확인 후 **추가** 탭

→ 홈화면에 아이콘이 생기고 전체화면 앱처럼 실행됩니다.

### 아이콘 파일 필요 목록
```
public/icons/
├── icon-72.png    (72×72)
├── icon-96.png    (96×96)
├── icon-128.png   (128×128)
├── icon-144.png   (144×144)
├── icon-152.png   (152×152)   ← iPad 홈화면
├── icon-180.png   (180×180)   ← iPhone 홈화면 ★
├── icon-192.png   (192×192)   ← Android PWA
├── icon-512.png   (512×512)   ← 스플래시/스토어
└── badge-72.png   (72×72)     ← 알림 배지
```

### 아이콘 생성 (무료 도구)
- https://www.pwabuilder.com/imageGenerator
- 512×512 원본 이미지 업로드 → 전체 사이즈 자동 생성

---

## FCM 설정 (필수 — 알림 동작)

### Firebase 프로젝트 생성
1. https://console.firebase.google.com
2. 새 프로젝트 → "홍성훈캠프" 생성
3. **프로젝트 설정 → 클라우드 메시징**에서:
   - `서버 키` → backend/.env의 Firebase 항목에 입력
   - `VAPID 공개 키` → frontend/.env의 VITE_VAPID_KEY에 입력

### backend/.env 설정
```
FIREBASE_PROJECT_ID=hongsunghun-campaign
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@hongsunghun-campaign.iam.gserviceaccount.com
```

### frontend/.env 설정
```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=hongsunghun-campaign.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=hongsunghun-campaign
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_VAPID_KEY=BNxxxxxxx...
```

---

## 배포 (서버 운영)

### 무료 배포 옵션
| 서비스 | 프론트엔드 | 백엔드 |
|--------|-----------|--------|
| Vercel + Railway | ✅ | ✅ |
| Netlify + Render | ✅ | ✅ |
| VPS (Oracle Free) | ✅ | ✅ |

### 권장: Railway (백엔드) + Vercel (프론트엔드)
```bash
# backend 배포
railway init
railway up

# frontend 배포
vercel deploy
```

### HTTPS 필수
- Web Push API는 HTTPS 환경에서만 동작
- 로컬 개발은 localhost (HTTP 허용)
- 배포 시 반드시 SSL 인증서 사용

---

## 초대코드 설정

```
backend/.env
INVITE_CODE=캠프전용코드2026
```

이 코드를 캠프원에게만 공유 → 외부인 차단
