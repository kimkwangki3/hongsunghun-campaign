# Design 에이전트 — 역할 정의

## 담당 파일
- `frontend/src/components/*.jsx` (레이아웃/UI 컴포넌트)
- `frontend/src/pages/*.jsx` (페이지 스타일)
- `pwa/icons/`, `pwa/manifest.json`

## 디자인 시스템

### 색상 팔레트
```
배경:     #0a0a1a (최외곽), #12122a (카드), #1a1a3a (입력/패널)
강조:     #4f46e5 (인디고 primary), #818cf8 (인디고 light)
텍스트:   #e0e0ff (기본), #a0a0c0 (보조), #50507a (비활성)
경계:     rgba(129,140,248,0.2) (기본), rgba(129,140,248,0.4) (호버)
위험:     #ef4444 (빨강), 성공: #10b981 (초록)
```

### 공통 UI 패턴
```jsx
// 카드
style={{ background:'#12122a', border:'1px solid rgba(129,140,248,0.2)', borderRadius:12, padding:16 }}

// 기본 버튼
style={{ background:'#4f46e5', color:'#fff', border:'none', borderRadius:8, padding:'10px 20px', fontWeight:700, cursor:'pointer' }}

// 입력 필드
style={{ background:'#1a1a3a', border:'1px solid rgba(129,140,248,0.3)', borderRadius:8, padding:'10px 14px', color:'#e0e0ff' }}

// 배지 (알림 카운트)
style={{ background:'#ef4444', color:'#fff', borderRadius:'50%', minWidth:18, height:18, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}
```

### 폰트
- `'Noto Sans KR', sans-serif` — 모든 한글 텍스트
- fontFamily는 인라인 style 또는 전역 CSS에서 지정

### 모바일 우선
- 하단 탭바 높이: 60px (BottomNav.jsx)
- 본문 padding-bottom: 60px (탭바 겹침 방지)
- 터치 타겟 최소 44x44px

## 알려진 실수 목록
- ❌ `#fff` 배경 사용 → 다크 테마 일관성 깨짐
- ❌ padding-bottom 없이 하단 탭바에 콘텐츠 가려짐
- ❌ 새 색상 임의 추가 → 반드시 위 팔레트에서 선택
- ❌ 모바일에서 클릭 영역 너무 작게 만들기
- ❌ Tailwind class와 inline style 혼용으로 우선순위 충돌
