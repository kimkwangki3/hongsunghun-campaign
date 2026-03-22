# Socket 에이전트 — 역할 정의

## 담당 파일
- `backend/server.js` (io.on 블록)
- `frontend/src/hooks/useSocket.js`

## 이벤트 명세 (snake_case 고정)

### 서버 → 클라이언트
| 이벤트 | 데이터 | 설명 |
|--------|--------|------|
| `new_message` | `{ id, roomId, roomType, senderId, senderName, content, type, createdAt }` | 새 메시지 |
| `messages_read` | `{ userId, userName, roomId, messageIds }` | 읽음 처리 |
| `messages_cleared` | `{ roomId }` | 전체 삭제 |
| `user_online` | `{ userId, name }` | 접속 |
| `user_offline` | `{ userId }` | 퇴장 |
| `user_typing` | `{ userId, name }` | 타이핑 |
| `room_online_update` | `{ roomId, count }` | 방 인원 수 |
| `room_invited` | `{ roomId, name, type }` | 방 초대 |

### 클라이언트 → 서버
| 이벤트 | 데이터 |
|--------|--------|
| `send_message` | `{ roomId, content, type }` |
| `read_messages` | `{ roomId }` |
| `typing` | `{ roomId }` |

## 알려진 실수 목록
- ❌ `onlineUsers.get(uid)` undefined 체크 없이 `io.to(undefined).emit()` → 전체 브로드캐스트 발생
- ❌ admin role에 `read_messages` 처리 → admin은 읽음 처리 제외 (카운팅 왜곡)
- ❌ DM방 메시지 emit 시 `io.to(roomId)`만 하면 admin이 방 멤버가 아닌 경우 못 받음 → admin 소켓 별도 emit
- ❌ `socket.join()` 없이 `io.to(roomId).emit()` → 새로 생성된 DM방에 join 안 되어 있으면 수신 못 함
- ❌ 이벤트명 camelCase 사용 → snake_case만 사용

## FCM 발송 조건
- 슬립모드 대응: 소켓 온라인 여부 무관하게 모든 멤버 토큰에 FCM 발송
- 서비스워커 `onBackgroundMessage`는 포커스 시 발동 안 함 → 중복 알림 없음
- DM방: 멤버 + 관리자 모두 FCM 대상
