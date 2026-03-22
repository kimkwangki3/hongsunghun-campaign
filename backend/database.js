// database.js — Agent: BACKEND + ARCHITECT (pg version)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const db = {
  async get(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows[0] || null;
  },
  async all(sql, params = []) {
    const { rows } = await pool.query(sql, params);
    return rows;
  },
  async run(sql, params = []) {
    return pool.query(sql, params);
  },
  pool
};

async function initDB() {
  await db.run(`
    -- 사용자
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      fcm_token TEXT,
      created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );

    -- 채팅방
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'group',
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );

    -- 채팅방 멤버
    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
      PRIMARY KEY (room_id, user_id)
    );

    -- 메시지 (암호화 저장)
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'text',
      is_deleted INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );

    -- 읽음 상태
    CREATE TABLE IF NOT EXISTS message_reads (
      message_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
      PRIMARY KEY (message_id, user_id)
    );

    -- 일정
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      category TEXT DEFAULT 'campaign',
      start_at INTEGER NOT NULL,
      end_at INTEGER,
      is_important INTEGER DEFAULT 0,
      notify_day_before INTEGER DEFAULT 1,
      notify_on_day INTEGER DEFAULT 1,
      created_by TEXT NOT NULL,
      created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );

    -- 알림 로그
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'general',
      is_read INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );

    -- FCM 디바이스 토큰 (멀티디바이스)
    CREATE TABLE IF NOT EXISTS device_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      platform TEXT DEFAULT 'web',
      updated_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
    );
  `);

  // cleared_at 컬럼 마이그레이션 (없으면 추가)
  await db.run(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cleared_at INTEGER DEFAULT 0`);

  // ── 회계 테이블 ──────────────────────────────────────────────────────
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_receipts (
      id                SERIAL PRIMARY KEY,
      image_path        TEXT,
      image_url         TEXT,
      ocr_raw           TEXT,
      ocr_date          DATE,
      ocr_amount        INTEGER,
      ocr_vendor        TEXT,
      ocr_vendor_reg_no VARCHAR(20),
      ocr_receipt_type  VARCHAR(30),
      ocr_confidence    DECIMAL(3,2),
      category_suggestion VARCHAR(50),
      reimbursable_guess  BOOLEAN,
      status            VARCHAR(20) DEFAULT 'PENDING',
      uploaded_by       TEXT REFERENCES users(id),
      uploaded_at       TIMESTAMP DEFAULT NOW(),
      created_at        TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_transactions (
      id               SERIAL PRIMARY KEY,
      date             DATE NOT NULL,
      amount           INTEGER NOT NULL,
      type             VARCHAR(10) NOT NULL CHECK (type IN ('income','expense')),
      description      TEXT,
      account_type     VARCHAR(30),
      cost_type        VARCHAR(20) CHECK (cost_type IN ('election_cost','non_election_cost')),
      category         VARCHAR(50),
      receipt_no       VARCHAR(30),
      receipt_id       INTEGER REFERENCES acct_receipts(id),
      account_verified BOOLEAN DEFAULT FALSE,
      approved         BOOLEAN DEFAULT FALSE,
      reimbursable     BOOLEAN,
      source           VARCHAR(20) DEFAULT 'manual',
      sms_id           INTEGER,
      note             TEXT,
      created_by       TEXT REFERENCES users(id),
      created_at       TIMESTAMP DEFAULT NOW(),
      updated_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_acct_tx_date ON acct_transactions(date)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_acct_tx_type ON acct_transactions(type)`);
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_sms_raw (
      id             SERIAL PRIMARY KEY,
      raw_text       TEXT NOT NULL,
      hash           VARCHAR(64) NOT NULL UNIQUE,
      received_at    TIMESTAMP DEFAULT NOW(),
      source         VARCHAR(20) DEFAULT 'manual',
      status         VARCHAR(20) DEFAULT 'PENDING',
      skip_reason    VARCHAR(100),
      processed_at   TIMESTAMP,
      transaction_id INTEGER REFERENCES acct_transactions(id),
      created_at     TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_acct_sms_status ON acct_sms_raw(status)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_acct_sms_hash   ON acct_sms_raw(hash)`);
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_sponsor_income (
      id               SERIAL PRIMARY KEY,
      date             DATE NOT NULL,
      amount           INTEGER NOT NULL,
      income_type      VARCHAR(20) NOT NULL DEFAULT 'named',
      donor_name       TEXT,
      donor_dob        DATE,
      donor_address    TEXT,
      donor_occupation TEXT,
      donor_phone      VARCHAR(20),
      receipt_no       VARCHAR(30),
      source           VARCHAR(20) DEFAULT 'manual',
      note             TEXT,
      created_at       TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_sponsor_expense (
      id          SERIAL PRIMARY KEY,
      date        DATE NOT NULL,
      amount      INTEGER NOT NULL,
      category    VARCHAR(30) NOT NULL,
      receipt_no  VARCHAR(30),
      receipt_id  INTEGER REFERENCES acct_receipts(id),
      source      VARCHAR(20) DEFAULT 'manual',
      note        TEXT,
      created_at  TIMESTAMP DEFAULT NOW()
    )
  `);
  await db.run(`
    CREATE TABLE IF NOT EXISTS acct_staff_payments (
      id                  SERIAL PRIMARY KEY,
      payment_date        DATE NOT NULL,
      staff_role          VARCHAR(20) NOT NULL,
      staff_name          TEXT NOT NULL,
      staff_account       TEXT,
      allowance           INTEGER DEFAULT 0,
      daily_expense       INTEGER DEFAULT 20000,
      meal_provided       INTEGER DEFAULT 0,
      transport_deduction INTEGER DEFAULT 0,
      total_actual        INTEGER,
      receipt_no          VARCHAR(30),
      transaction_id      INTEGER REFERENCES acct_transactions(id),
      approved            BOOLEAN DEFAULT FALSE,
      note                TEXT,
      created_at          TIMESTAMP DEFAULT NOW()
    )
  `);
  // ─────────────────────────────────────────────────────────────────────

  // 성능 인덱스 (없으면 생성)
  await db.run(`CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_messages_room_time ON messages(room_id, created_at DESC)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_message_reads_msg ON message_reads(message_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id)`);

  // 선거 핵심 일정 + 기본 채팅방 항상 보장 (ON CONFLICT DO NOTHING으로 중복 안전)
  await seedElectionSchedules();

  // 채팅방 이름 마이그레이션
  await db.run(`UPDATE rooms SET name = '홍캠프 보안 채팅방', description = '홍성훈 캠프 전용 보안 채팅방' WHERE id = 'room_general'`);
  await db.run(`UPDATE rooms SET name = '📢 공지', description = '캠프 공지 채널' WHERE id = 'room_announce'`);

  console.log('✅ DB 초기화 완료');
}

async function seedElectionSchedules() {
  // system 유저 생성
  await db.run(`
    INSERT INTO users (id, name, password, role)
    VALUES ('system', '시스템', 'system', 'admin')
    ON CONFLICT DO NOTHING
  `);

  // gtadmin 관리자 계정 생성
  await db.run(`
    INSERT INTO users (id, name, password, role)
    VALUES ('gtadmin', 'gtadmin', 'rlaehdgo123!@#', 'admin')
    ON CONFLICT (id) DO UPDATE SET password = 'rlaehdgo123!@#', role = 'admin'
  `);

  // gtadmin 채팅방 자동 가입
  for (const roomId of ['room_announce', 'room_general']) {
    await db.run(
      `INSERT INTO room_members (room_id, user_id) VALUES ($1, 'gtadmin') ON CONFLICT DO NOTHING`,
      [roomId]
    );
  }

  const scheduleData = [
    ['sch_0220', '예비후보자 등록 개시', '시·도의원 예비후보자 등록 신청 시작', new Date('2026-02-20').getTime() / 1000],
    ['sch_0305a', '공직자 사직 기한', '선거일 전 90일 — 공직자 사직 마감', new Date('2026-03-05').getTime() / 1000],
    ['sch_0305b', '딥페이크 선거운동 금지 시작', '선거일 전 90일부터 AI 딥페이크 선거운동 전면 금지', new Date('2026-03-05').getTime() / 1000],
    ['sch_0404', '지자체장 선거영향 행위 금지', '선거일 전 60일 — 각종 행사 개최·후원 금지', new Date('2026-04-04').getTime() / 1000],
    ['sch_0514', '후보자 등록 신청 시작', '5월 14~15일 후보자 등록 (09:00~18:00)', new Date('2026-05-14').getTime() / 1000],
    ['sch_0521', '선거기간 개시', '선거운동 공식 시작일', new Date('2026-05-21').getTime() / 1000],
    ['sch_0529', '사전투표 시작', '5월 29~30일 사전투표 (06:00~18:00)', new Date('2026-05-29').getTime() / 1000],
    ['sch_0603', '🗳️ 선거일', '제9회 전국동시지방선거 — 투표일 (06:00~18:00)', new Date('2026-06-03').getTime() / 1000],
    ['sch_0615', '선거비용 보전 청구 기한', '선거일 후 10일 이내 제출', new Date('2026-06-15').getTime() / 1000],
    ['sch_0703', '회계보고서 제출 기한', '선거일 후 30일 이내 제출', new Date('2026-07-03').getTime() / 1000],
  ];

  for (const [id, title, description, start_at] of scheduleData) {
    await db.run(
      `INSERT INTO schedules (id, title, description, category, start_at, is_important, created_by)
       VALUES ($1, $2, $3, 'election_law', $4, 1, 'system')
       ON CONFLICT DO NOTHING`,
      [id, title, description, start_at]
    );
  }

  // 전체 공지 채팅방 생성
  await db.run(`
    INSERT INTO rooms (id, name, description, type, created_by)
    VALUES ('room_announce', '📢 캠프 공지', '홍성훈 캠프 전체 공지 채널', 'announce', 'system')
    ON CONFLICT DO NOTHING
  `);

  await db.run(`
    INSERT INTO rooms (id, name, description, type, created_by)
    VALUES ('room_general', '💬 캠프 전체방', '캠프원 전체 채팅방', 'group', 'system')
    ON CONFLICT DO NOTHING
  `);

  console.log('✅ 선거 일정 초기 데이터 등록 완료');
}

module.exports = { db, initDB };
