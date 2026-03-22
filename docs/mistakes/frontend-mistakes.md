# Frontend 알려진 실수 로그

## 2026-03-22
- `setRooms`에서 `unreadCounts` 덮어씀 → 페이지 이동 시 배지 사라짐 → `initUnread` 분리로 해결
- `ChatRoomPage` 필터 `r.type !== 'announce'` → DM방 포함됨 → `r.type === 'group'`으로 수정
- iOS PWA에서 `Notification.requestPermission()` 자동 호출 → 시스템 팝업 무시됨 → Layout.jsx 배너로 이동
- 새 페이지 App.jsx에 lazy import 추가 안 함 → 번들 크기 최적화 미적용
