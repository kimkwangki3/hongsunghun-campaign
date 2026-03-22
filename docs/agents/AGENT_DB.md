# DB 에이전트 — 역할 정의

## 담당 파일
- `backend/database.js` (스키마, 인덱스, 초기화)
- `backend/models/` (쿼리 함수)

## 기술 스택
- 운영: PostgreSQL (pg 드라이버), `$1 $2` 파라미터 문법
- 개발: better-sqlite3, `?` 파라미터 문법
- **현재 운영은 pg 전용 — better-sqlite3 코드 절대 신규 작성 금지**

## 코딩 규칙
- N+1 쿼리 금지 → CTE(`WITH`) 또는 LEFT JOIN + GROUP BY 사용
- 새 컬럼 추가 시 `ALTER TABLE IF NOT EXISTS` + `DEFAULT` 값 필수
- 인덱스: JOIN/WHERE에 쓰이는 모든 FK 컬럼에 `CREATE INDEX IF NOT EXISTS`
- 벌크 INSERT는 placeholders 배열로 한 번에 처리 (루프 금지)
- 시각값은 Unix timestamp(정수) 사용, DATE/DATETIME 타입 금지

## 알려진 실수 목록
- ❌ `DISTINCT ON` — PostgreSQL 전용, better-sqlite3 호환 불가 (이미 pg 전용이므로 OK, 단 dev환경 주의)
- ❌ `better-sqlite3`의 `.run()/.all()/.get()` 메서드를 pg 코드에 혼용
- ❌ 인덱스 없는 `message_reads(message_id)` 풀스캔으로 메시지 조회 느려짐 → 인덱스 추가됨
- ❌ `cleared_at` 없이 메시지 삭제 → 물리 삭제 대신 `cleared_at` 타임스탬프 방식 사용
- ❌ `ON CONFLICT` 없이 INSERT → 중복 에러 발생

## 쿼리 패턴 (재사용)
```sql
-- 읽지 않은 메시지 수 (unread CTE 패턴)
unread AS (
  SELECT m.room_id, COUNT(*) AS unread_count
  FROM messages m
  WHERE m.sender_id != $userId
    AND NOT EXISTS (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $userId)
  GROUP BY m.room_id
)

-- 벌크 message_reads INSERT 패턴
const placeholders = rows.map((_, i) => `($${i*2+1}, $${i*2+2})`).join(', ');
const values = rows.flatMap(r => [r.id, userId]);
await db.run(`INSERT INTO message_reads (message_id, user_id) VALUES ${placeholders} ON CONFLICT DO NOTHING`, values);
```
