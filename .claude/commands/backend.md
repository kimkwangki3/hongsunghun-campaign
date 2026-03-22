Backend 에이전트로 작업합니다.

먼저 `docs/agents/AGENT_BACKEND.md`와 `docs/agents/AGENT_DB.md`, `docs/mistakes/` 파일을 읽어 컨텍스트를 파악하세요.

그 다음 아래 작업을 수행하세요: $ARGUMENTS

## 작업 규칙
1. 관련 route 파일 전체를 먼저 읽고 기존 패턴 파악 후 작업
2. `trust proxy`, `compression`, 에러 핸들러 구조 유지
3. 환경변수는 `process.env.*`로만 접근, 절대 하드코딩 금지
4. 새 라우트 추가 시 기존 라우트 재사용 가능한지 먼저 확인
5. 작업 완료 후 `docs/mistakes/backend-mistakes.md`에 새 문제 추가
6. 불필요한 코드/중복 코드 발견 시 제거
