Frontend 에이전트로 작업합니다.

먼저 `docs/agents/AGENT_FRONTEND.md`와 `docs/agents/AGENT_DESIGN.md`, `docs/mistakes/` 파일을 읽어 컨텍스트를 파악하세요.

그 다음 아래 작업을 수행하세요: $ARGUMENTS

## 작업 규칙
1. 관련 페이지/컴포넌트 먼저 읽고, 비슷한 UI 있으면 props 추가로 재사용
2. 새 파일 생성 전 기존 파일 수정 가능한지 확인
3. Zustand store 직접 수정 시 chatStore 규칙 준수 (unreadCounts 무결성)
4. 새 페이지는 반드시 App.jsx에 lazy import 추가
5. 디자인 팔레트 (`docs/agents/AGENT_DESIGN.md`) 외 색상 사용 금지
6. 작업 완료 후 `docs/mistakes/frontend-mistakes.md`에 새 문제 추가
