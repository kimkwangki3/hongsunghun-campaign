// routes/notification.js — Agent: NOTIFICATION (pg version)
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendPushToAll } = require('../utils/fcm');

// GET /api/v1/notification — 내 알림 목록
router.get('/', async (req, res) => {
  try {
    const notifications = await db.all(`
      SELECT * FROM notifications
      WHERE user_id = $1 OR user_id IS NULL
      ORDER BY created_at DESC LIMIT 50
    `, [req.user.id]);

    res.json({ success: true, data: notifications });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// PUT /api/v1/notification/read-all — 전체 읽음
router.put('/read-all', async (req, res) => {
  try {
    await db.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = $1 OR user_id IS NULL',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/notification/broadcast — 긴급 공지 (관리자)
router.post('/broadcast', requireAdmin, async (req, res) => {
  try {
    const { title, body, type = 'urgent' } = req.body;
    if (!title || !body) return res.status(400).json({ success: false, message: '제목·내용 필요' });

    const id = uuidv4();
    await db.run(
      'INSERT INTO notifications (id, title, body, type) VALUES ($1, $2, $3, $4)',
      [id, title, body, type]
    );

    // 전체 FCM 발송
    const tokenRows = await db.all('SELECT DISTINCT token FROM device_tokens');
    const tokens = tokenRows.map(r => r.token);
    if (tokens.length > 0) {
      await sendPushToAll(tokens, { title, body, data: { type } });
    }

    // 소켓 실시간 알림
    const io = req.app.get('io');
    io.emit('broadcast_notification', { id, title, body, type, created_at: Math.floor(Date.now() / 1000) });

    res.json({ success: true, message: `${tokens.length}명에게 발송 완료` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

module.exports = router;
