// routes/chat.js — Agent: BACKEND (pg version)
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { db } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { decrypt, encrypt } = require('../utils/encryption');

// 업로드 디렉토리
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|zip|txt|mp4|mov)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('지원하지 않는 파일 형식'));
  }
});

// GET /api/v1/chat/rooms — 내 채팅방 목록
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await db.all(`
      WITH last_msgs AS (
        SELECT DISTINCT ON (room_id)
          room_id, content AS last_msg_enc, created_at AS last_msg_at
        FROM messages
        ORDER BY room_id, created_at DESC
      ),
      msg_counts AS (
        SELECT room_id, COUNT(*) AS msg_count
        FROM messages WHERE is_deleted = 0
        GROUP BY room_id
      ),
      unread AS (
        SELECT m.room_id, COUNT(*) AS unread_count
        FROM messages m
        WHERE m.sender_id != $1
          AND NOT EXISTS (
            SELECT 1 FROM message_reads mr
            WHERE mr.message_id = m.id AND mr.user_id = $2
          )
        GROUP BY m.room_id
      ),
      member_counts AS (
        SELECT rm2.room_id, COUNT(*) AS member_count
        FROM room_members rm2
        JOIN users u2 ON rm2.user_id = u2.id
        WHERE u2.role != 'admin'
        GROUP BY rm2.room_id
      )
      SELECT r.*,
        COALESCE(mc.msg_count, 0) AS msg_count,
        lm.last_msg_enc,
        lm.last_msg_at,
        COALESCE(u.unread_count, 0) AS unread_count,
        COALESCE(mbc.member_count, 0) AS member_count
      FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      LEFT JOIN last_msgs lm ON lm.room_id = r.id
      LEFT JOIN msg_counts mc ON mc.room_id = r.id
      LEFT JOIN unread u ON u.room_id = r.id
      LEFT JOIN member_counts mbc ON mbc.room_id = r.id
      WHERE rm.user_id = $3
      ORDER BY COALESCE(lm.last_msg_at, r.created_at) DESC
    `, [req.user.id, req.user.id, req.user.id]);

    const result = rooms.map(r => ({
      ...r,
      lastMessage: r.last_msg_enc ? (() => {
        try { return decrypt(r.last_msg_enc); } catch { return ''; }
      })() : null,
      last_msg_enc: undefined
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/chat/rooms — 채팅방 생성 (관리자만)
router.post('/rooms', requireAdmin, async (req, res) => {
  try {
    const { name, description, type = 'group', memberIds = [] } = req.body;
    if (!name) return res.status(400).json({ success: false, message: '방 이름 필요' });

    const roomId = uuidv4();
    await db.run(
      'INSERT INTO rooms (id, name, description, type, created_by) VALUES ($1, $2, $3, $4, $5)',
      [roomId, name, description, type, req.user.id]
    );

    const allMembers = [...new Set([req.user.id, ...memberIds])];
    for (const uid of allMembers) {
      await db.run(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roomId, uid]
      );
    }

    const io = req.app.get('io');
    allMembers.forEach(uid => {
      const socketId = req.app.get('onlineUsers').get(uid);
      if (socketId) {
        io.to(socketId).socketsJoin(roomId);
        io.to(socketId).emit('room_invited', { roomId, name, type });
      }
    });

    res.json({ success: true, data: { id: roomId, name, type } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/chat/rooms/:roomId — 단일 방 정보
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await db.get(`
      SELECT r.*,
        (SELECT COUNT(*) FROM room_members rm2 JOIN users u2 ON rm2.user_id = u2.id WHERE rm2.room_id = r.id AND u2.role != 'admin') as member_count
      FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      WHERE r.id = $1 AND rm.user_id = $2
    `, [roomId, req.user.id]);
    if (!room) return res.status(404).json({ success: false, message: '방 없음' });
    res.json({ success: true, data: room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/chat/rooms/:roomId/messages — 메시지 조회 (읽음 수 포함)
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { before, limit = 50 } = req.query;

    const isAdmin = req.user.role === 'admin';

    if (!isAdmin) {
      const member = await db.get(
        'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
        [roomId, req.user.id]
      );
      if (!member) return res.status(403).json({ success: false, message: '접근 권한 없음' });
    }

    // admin은 전체 기간 + cleared_at 무시 (삭제 후에도 전부 열람 가능)
    let sinceAt = 0;
    if (!isAdmin) {
      const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
      const room = await db.get('SELECT COALESCE(cleared_at, 0) as cleared_at FROM rooms WHERE id = $1', [roomId]);
      sinceAt = Math.max(twoDaysAgo, room?.cleared_at || 0);
    }

    // JOIN 기반으로 N+1 서브쿼리 제거 (메시지 50개 → 쿼리 1번으로 처리)
    let query, params;
    if (before) {
      query = `
        SELECT m.id, m.room_id, m.sender_id, u.name as sender_name,
               m.content, m.type, m.is_deleted, m.created_at,
               COUNT(mr.message_id) AS read_count,
               MAX(CASE WHEN mr.user_id = $5 THEN 1 ELSE 0 END) AS read_by_me
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN message_reads mr ON mr.message_id = m.id
        WHERE m.room_id = $1 AND m.created_at < $2 AND m.created_at >= $3
        GROUP BY m.id, u.name
        ORDER BY m.created_at DESC
        LIMIT $4
      `;
      params = [roomId, before, sinceAt, parseInt(limit), req.user.id];
    } else {
      query = `
        SELECT m.id, m.room_id, m.sender_id, u.name as sender_name,
               m.content, m.type, m.is_deleted, m.created_at,
               COUNT(mr.message_id) AS read_count,
               MAX(CASE WHEN mr.user_id = $4 THEN 1 ELSE 0 END) AS read_by_me
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        LEFT JOIN message_reads mr ON mr.message_id = m.id
        WHERE m.room_id = $1 AND m.created_at >= $3
        GROUP BY m.id, u.name
        ORDER BY m.created_at DESC
        LIMIT $2
      `;
      params = [roomId, parseInt(limit), sinceAt, req.user.id];
    }

    const messages = await db.all(query, params);

    const result = messages.map(m => ({
      id: m.id,
      roomId: m.room_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      content: m.is_deleted ? '삭제된 메시지입니다' : (() => {
        try { return decrypt(m.content); } catch { return m.content; }
      })(),
      type: m.type,
      createdAt: m.created_at,
      readCount: m.read_count,
      readByMe: !!m.read_by_me
    })).reverse();

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// DELETE /api/v1/chat/rooms/:roomId/messages — 전체 메시지 삭제
router.delete('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const room = await db.get('SELECT id FROM rooms WHERE id = $1', [roomId]);
    if (!room) return res.status(404).json({ success: false, message: '방 없음' });

    // DB에는 보존, cleared_at 이전 메시지만 채팅창에서 숨김
    const now = Math.floor(Date.now() / 1000);
    await db.run('UPDATE rooms SET cleared_at = $1 WHERE id = $2', [now, roomId]);

    // 소켓으로 실시간 갱신
    req.app.get('io').to(roomId).emit('messages_cleared', { roomId });

    res.json({ success: true, message: '대화 내용이 전체 삭제되었습니다' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/chat/messages/:messageId/readers — 읽은 사람 목록
router.get('/messages/:messageId/readers', async (req, res) => {
  try {
    const { messageId } = req.params;

    const msg = await db.get('SELECT room_id FROM messages WHERE id = $1', [messageId]);
    if (!msg) return res.status(404).json({ success: false, message: '메시지 없음' });

    const member = await db.get(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [msg.room_id, req.user.id]
    );
    if (!member) return res.status(403).json({ success: false, message: '접근 권한 없음' });

    const readers = await db.all(`
      SELECT u.id, u.name, mr.read_at
      FROM message_reads mr
      JOIN users u ON mr.user_id = u.id
      WHERE mr.message_id = $1
      ORDER BY mr.read_at ASC
    `, [messageId]);

    res.json({ success: true, data: readers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/chat/upload — 파일 업로드
router.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });
  const imageExts = /\.(jpg|jpeg|png|gif|webp)$/i;
  const isImage = imageExts.test(req.file.originalname);
  res.json({
    success: true,
    data: {
      url: `/uploads/${req.file.filename}`,
      name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
      type: isImage ? 'image' : 'file'
    }
  });
});

// GET /api/v1/chat/members — 전체 캠프원 목록
router.get('/members', async (req, res) => {
  try {
    const users = await db.all(
      "SELECT id, name, role, created_at FROM users WHERE id != 'system' ORDER BY name"
    );
    res.json({ success: true, data: users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/chat/admin/dms — 관리자 전용: 모든 1:1 대화방 목록
router.get('/admin/dms', requireAdmin, async (req, res) => {
  try {
    const rooms = await db.all(`
      SELECT r.id, r.name, r.created_at,
        (SELECT m.content FROM messages m WHERE m.room_id = r.id ORDER BY m.created_at DESC LIMIT 1) as last_msg_enc,
        (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id) as msg_count,
        (SELECT STRING_AGG(u.name, ' · ' ORDER BY u.name) FROM room_members rm JOIN users u ON rm.user_id = u.id WHERE rm.room_id = r.id) as members
      FROM rooms r
      WHERE r.type = 'direct'
      ORDER BY (SELECT MAX(m.created_at) FROM messages m WHERE m.room_id = r.id) DESC NULLS LAST
    `);

    const result = rooms.map(r => ({
      ...r,
      lastMessage: r.last_msg_enc ? (() => { try { return decrypt(r.last_msg_enc); } catch { return ''; } })() : null,
      last_msg_enc: undefined,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/chat/dm — 1:1 DM방 생성 or 기존 방 반환
router.post('/dm', async (req, res) => {
  try {
    const { targetUserId } = req.body;
    const myId = req.user.id;
    if (!targetUserId || targetUserId === myId) {
      return res.status(400).json({ success: false, message: '대상 사용자 필요' });
    }

    // 이미 존재하는 DM방 확인
    const existing = await db.get(`
      SELECT r.id FROM rooms r
      JOIN room_members rm1 ON r.id = rm1.room_id AND rm1.user_id = $1
      JOIN room_members rm2 ON r.id = rm2.room_id AND rm2.user_id = $2
      WHERE r.type = 'direct'
      LIMIT 1
    `, [myId, targetUserId]);

    if (existing) {
      return res.json({ success: true, data: { roomId: existing.id } });
    }

    // 신규 DM방 생성
    const target = await db.get('SELECT name FROM users WHERE id = $1', [targetUserId]);
    const me = await db.get('SELECT name FROM users WHERE id = $1', [myId]);
    const roomId = uuidv4();
    const roomName = `${me.name} · ${target.name}`;

    await db.run(
      'INSERT INTO rooms (id, name, type, created_by) VALUES ($1, $2, $3, $4)',
      [roomId, roomName, 'direct', myId]
    );
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, myId]);
    await db.run('INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)', [roomId, targetUserId]);

    // 소켓: 상대방도 방에 join
    const io = req.app.get('io');
    const onlineUsers = req.app.get('onlineUsers');
    [myId, targetUserId].forEach(uid => {
      const sid = onlineUsers.get(uid);
      if (sid) io.to(sid).socketsJoin(roomId);
    });

    res.json({ success: true, data: { roomId } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

module.exports = router;
