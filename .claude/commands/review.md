전체 코드 품질 리뷰를 수행합니다.

각 도메인의 에이전트 정의(`docs/agents/`)와 실수 목록(`docs/mistakes/`)을 읽고:

$ARGUMENTS

## 리뷰 체크리스트

### Backend
- [ ] `trust proxy` 설정 확인
- [ ] 환경변수 하드코딩 없는지
- [ ] 중복 패키지/코드 없는지
- [ ] 에러 핸들러 누락 없는지

### DB
- [ ] N+1 쿼리 없는지
- [ ] 인덱스 누락 없는지
- [ ] 벌크 INSERT 사용 여부

### Frontend
- [ ] chatStore unreadCounts 규칙 위반 없는지
- [ ] lazy import 누락 없는지
- [ ] 미사용 컴포넌트/파일 없는지

### Socket
- [ ] 이벤트명 snake_case 확인
- [ ] undefined 소켓ID 체크 여부

### Design
- [ ] 팔레트 외 색상 사용 없는지
- [ ] 모바일 하단 패딩 확인

발견한 문제는 해당 `docs/mistakes/` 파일에 추가하고 수정 가능한 것은 즉시 수정하세요.
