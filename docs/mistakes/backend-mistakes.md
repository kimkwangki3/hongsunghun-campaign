# Backend 알려진 실수 로그

## 2026-03-22
- `app.set('trust proxy', 1)` 누락 → Render에서 X-Forwarded-For ValidationError로 서버 크래시
- `package.json` 중복 의존성(`pg`, `multer`) 추가 → npm install 경고/오류
- `compression` 미들웨어 없이 배포 → 응답 크기 큼
