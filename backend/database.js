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

  // 선거 핵심 일정 자동 등록 (최초 1회)
  const existing = await db.get('SELECT COUNT(*) as cnt FROM schedules');
  if (parseInt(existing.cnt) === 0) {
    await seedElectionSchedules();
  }

  console.log('✅ DB 초기화 완료');
}

async function seedElectionSchedules() {
  // system 유저 생성
  await db.run(`
    INSERT INTO users (id, name, password, role)
    VALUES ('system', '시스템', 'system', 'admin')
    ON CONFLICT DO NOTHING
  `);

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
