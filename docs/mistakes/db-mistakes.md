# DB 알려진 실수 로그

## 2026-03-22
- 채팅방 목록 조회 N+1 서브쿼리 5개 → CTE로 단일 쿼리로 교체
- `message_reads`, `room_members` 등 인덱스 없음 → 7개 인덱스 추가
- `read_messages` 소켓 핸들러에서 루프 INSERT → 벌크 INSERT로 교체
