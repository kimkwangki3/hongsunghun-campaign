// routes/auth.js — Agent: BACKEND + SECURITY (pg version)
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { signToken, verifyToken } = require('../middleware/auth');

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, message: '이름과 비밀번호를 입력하세요' });
    }
    if (password.length > 6) {
      return res.status(400).json({ success: false, message: '비밀번호는 6자리 이하로 입력하세요' });
    }

    const existing = await db.get('SELECT id FROM users WHERE name = $1', [name]);
    if (existing) {
      return res.status(409).json({ success: false, message: '이미 등록된 이름입니다' });
    }

    const userId = uuidv4();
    await db.run(
      'INSERT INTO users (id, name, password, role) VALUES ($1, $2, $3, $4)',
      [userId, name, password, 'member']
    );

    // 전체 채팅방 자동 가입
    for (const roomId of ['room_announce', 'room_general']) {
      await db.run(
        'INSERT INTO room_members (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [roomId, userId]
      );
    }

    const token = signToken({ id: userId, name, role: 'member' });
    res.json({ success: true, data: { token, user: { id: userId, name, role: 'member' } } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ success: false, message: '이름과 비밀번호를 입력하세요' });
    }

    const user = await db.get('SELECT * FROM users WHERE name = $1', [name]);
    if (!user) {
      return res.status(401).json({ success: false, message: '등록되지 않은 이름입니다' });
    }

    if (password !== user.password) {
      return res.status(401).json({ success: false, message: '비밀번호가 틀렸습니다' });
    }

    const token = signToken({ id: user.id, name: user.name, role: user.role });
    res.json({
      success: true,
      data: {
        token,
        user: { id: user.id, name: user.name, role: user.role }
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// PUT /api/v1/auth/fcm-token — FCM 토큰 등록/갱신
router.put('/fcm-token', verifyToken, async (req, res) => {
  try {
    const { token, platform = 'web' } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'FCM 토큰 필요' });

    const tokenId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    await db.run(
      `INSERT INTO device_tokens (id, user_id, token, platform, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token) DO UPDATE SET updated_at = $5, platform = $4`,
      [tokenId, req.user.id, token, platform, now]
    );

    res.json({ success: true, message: 'FCM 토큰 등록 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/auth/me
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, role, created_at FROM users WHERE id = $1', [req.user.id]);
    res.json({ success: true, data: user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

module.exports = router;
