DB 에이전트로 작업합니다.

먼저 `docs/agents/AGENT_DB.md`와 `docs/mistakes/` 디렉토리의 모든 파일을 읽어 알려진 실수를 파악하세요.

그 다음 아래 작업을 수행하세요: $ARGUMENTS

## 작업 규칙
1. 기존 쿼리/스키마 먼저 읽고, 비슷한 패턴 있으면 재사용
2. N+1 쿼리 절대 금지 — CTE/JOIN으로 해결
3. 새 컬럼/테이블 추가 시 `IF NOT EXISTS` + `DEFAULT` 필수
4. 작업 완료 후 `docs/mistakes/db-mistakes.md`에 새로 발견한 문제 추가
5. 불필요한 코드 발견 시 과감하게 삭제
