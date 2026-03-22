Socket 에이전트로 작업합니다.

먼저 `docs/agents/AGENT_SOCKET.md`와 `docs/mistakes/` 파일을 읽어 컨텍스트를 파악하세요.

그 다음 아래 작업을 수행하세요: $ARGUMENTS

## 작업 규칙
1. `backend/server.js`의 io.on 블록과 `frontend/src/hooks/useSocket.js` 함께 읽고 시작
2. 이벤트명은 반드시 snake_case (이벤트 명세 목록에서 확인)
3. `onlineUsers.get(uid)` 항상 undefined 체크 후 사용
4. admin 읽음 처리 제외 규칙 유지
5. FCM 발송은 소켓 온라인 여부 무관하게 전송 (슬립모드 대응)
6. 작업 완료 후 `docs/mistakes/socket-mistakes.md`에 새 문제 추가
