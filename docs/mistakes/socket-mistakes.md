# Socket 알려진 실수 로그

## 2026-03-22
- 서비스워커 두 개(`sw.js` + `firebase-messaging-sw.js`) 동일 scope 등록 → iOS에서 push 이벤트 드랍
- FCM을 오프라인 유저에만 발송 → 슬립모드 온라인 유저 못 받음 → 전체 멤버에 발송으로 수정
- DM방에서 admin이 room_members에 없는 경우 → admin 소켓 별도 emit 추가
