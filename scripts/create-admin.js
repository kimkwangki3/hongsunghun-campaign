// scripts/create-admin.js
// 사용법: node scripts/create-admin.js
require('dotenv').config({ path: './backend/.env' });
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

const DB_PATH = process.env.DATABASE_PATH || './backend/campaign.db';
const db = new Database(DB_PATH);

// DB 테이블 존재 확인
try {
  db.prepare('SELECT 1 FROM users LIMIT 1').get();
} catch {
  console.error('❌ DB가 초기화되지 않았습니다. 먼저 서버를 한 번 실행하세요:');
  console.error('   cd backend && node server.js');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log('\n===== 홍성훈 캠프 관리자 계정 생성 =====\n');

  const name  = await ask('이름: ');
  const phone = await ask('전화번호 (예: 010-1234-5678): ');
  const pw    = await ask('비밀번호: ');

  if (!name || !phone || !pw) {
    console.log('❌ 모든 항목을 입력해야 합니다'); process.exit(1);
  }

  const existing = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (existing) {
    // 기존 회원을 관리자로 승격
    db.prepare("UPDATE users SET role = 'admin' WHERE phone = ?").run(phone);
    console.log(`\n✅ 기존 회원 '${name}'을 관리자로 승격했습니다`);
  } else {
    const hashedPw = await bcrypt.hash(pw, 12);
    const userId = uuidv4();
    db.prepare(
      "INSERT INTO users (id, name, phone, password, role) VALUES (?, ?, ?, ?, 'admin')"
    ).run(userId, name, phone, hashedPw);

    // 전체 방 자동 가입
    ['room_announce', 'room_general'].forEach(roomId => {
      db.prepare('INSERT OR IGNORE INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, userId);
    });

    console.log(`\n✅ 관리자 계정 생성 완료`);
    console.log(`   이름: ${name}`);
    console.log(`   전화번호: ${phone}`);
    console.log(`   권한: admin\n`);
  }

  rl.close();
}

main().catch(err => { console.error(err); process.exit(1); });
