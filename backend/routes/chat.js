// routes/chat.js — Agent: BACKEND (pg version)
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { decrypt } = require('../utils/encryption');

// GET /api/v1/chat/rooms — 내 채팅방 목록
router.get('/rooms', async (req, res) => {
  try {
    const rooms = await db.all(`
      SELECT r.*,
        (SELECT COUNT(*) FROM messages m WHERE m.room_id = r.id AND m.is_deleted = 0) as msg_count,
        (SELECT m.content FROM messages m WHERE m.room_id = r.id ORDER BY m.created_at DESC LIMIT 1) as last_msg_enc,
        (SELECT m.created_at FROM messages m WHERE m.room_id = r.id ORDER BY m.created_at DESC LIMIT 1) as last_msg_at,
        (SELECT COUNT(*) FROM messages m2
         WHERE m2.room_id = r.id AND m2.sender_id != $1
         AND m2.id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)) as unread_count,
        (SELECT COUNT(*) FROM room_members WHERE room_id = r.id) as member_count
      FROM rooms r
      JOIN room_members rm ON rm.room_id = r.id
      WHERE rm.user_id = $3
      ORDER BY COALESCE(last_msg_at, r.created_at) DESC
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

// GET /api/v1/chat/rooms/:roomId/messages — 메시지 조회 (읽음 수 포함)
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { before, limit = 50 } = req.query;

    const member = await db.get(
      'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, req.user.id]
    );
    if (!member) return res.status(403).json({ success: false, message: '접근 권한 없음' });

    let query, params;
    if (before) {
      query = `
        SELECT m.id, m.room_id, m.sender_id, u.name as sender_name,
               m.content, m.type, m.is_deleted, m.created_at,
               (SELECT COUNT(*) FROM message_reads mr WHERE mr.message_id = m.id) as read_count
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.room_id = $1 AND m.created_at < $2
        ORDER BY m.created_at DESC
        LIMIT $3
      `;
      params = [roomId, before, parseInt(limit)];
    } else {
      query = `
        SELECT m.id, m.room_id, m.sender_id, u.name as sender_name,
               m.content, m.type, m.is_deleted, m.created_at,
               (SELECT COUNT(*) FROM message_reads mr WHERE mr.message_id = m.id) as read_count
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.room_id = $1
        ORDER BY m.created_at DESC
        LIMIT $2
      `;
      params = [roomId, parseInt(limit)];
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
      readCount: m.read_count
    })).reverse();

    res.json({ success: true, data: result });
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

module.exports = router;
