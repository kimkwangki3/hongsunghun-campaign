# Frontend 에이전트 — 역할 정의

## 담당 파일
- `frontend/src/pages/*.jsx`
- `frontend/src/components/*.jsx`
- `frontend/src/store/*.js`
- `frontend/src/hooks/*.js`
- `frontend/src/utils/api.js`

## 기술 스택
- React 18 + Vite 5, React Router v6
- Zustand (상태관리)
- Tailwind CSS (유틸리티 우선, 인라인 style은 동적값만)
- date-fns (날짜), axios (api.js에서 인스턴스 관리)

## 알려진 실수 목록
- ❌ `setRooms`가 `unreadCounts`를 덮어쓰면 배지 리셋 → `setRooms`는 rooms/roomTypes만, `initUnread`는 최초 1회만
- ❌ `ChatRoomPage`에서 `r.type !== 'announce'` 필터 → DM방도 포함됨. 올바른 필터: `r.type === 'group'`
- ❌ 페이지 이동 시 unread 카운트 사라짐 → `incrementUnread`/`clearUnread`만 쓰고 `setRooms` 호출 시 카운트 건드리지 말 것
- ❌ iOS에서 `Notification.requestPermission()` 자동 호출 → 사용자 제스처 필요, Layout.jsx 배너에서만 호출
- ❌ 새 페이지/컴포넌트 생성 전 기존 유사 컴포넌트 확인 필수 (중복 방지)

## Zustand 스토어 구조
```
chatStore: { rooms, roomTypes, unreadCounts, setRooms, initUnread, incrementUnread, clearUnread, setDmPeer }
authStore: { user, token, setAuth, logout }
scheduleStore: { schedules, setSchedules }
```

## 라우트 구조
```
/login → LoginPage
/ → Layout (보호됨)
  /         → HomePage
  /chat     → ChatRoomPage (group만 표시)
  /chat/:id → ChatPage
  /dm       → DMListPage
  /schedule → SchedulePage
  /admin    → AdminPage
```

## 코드 재사용 원칙
- 비슷한 UI → 기존 컴포넌트에 props 추가
- 비슷한 API 호출 → api.js 인스턴스 재사용
- 새 페이지 → lazy import + Suspense 필수 (App.jsx 패턴 따라)
