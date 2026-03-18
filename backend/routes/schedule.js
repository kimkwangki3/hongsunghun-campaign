// routes/schedule.js — Agent: BACKEND (pg version)
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database');
const { requireAdmin } = require('../middleware/auth');
const { sendPushToAll } = require('../utils/fcm');

// GET /api/v1/schedule — 일정 목록
router.get('/', async (req, res) => {
  try {
    const { month, year } = req.query;
    let query, params;

    if (month && year) {
      const start = new Date(parseInt(year), parseInt(month) - 1, 1).getTime() / 1000;
      const end = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59).getTime() / 1000;
      query = 'SELECT * FROM schedules WHERE start_at >= $1 AND start_at <= $2 ORDER BY start_at ASC';
      params = [start, end];
    } else {
      query = 'SELECT * FROM schedules ORDER BY start_at ASC';
      params = [];
    }

    const schedules = await db.all(query, params);
    res.json({ success: true, data: schedules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// GET /api/v1/schedule/upcoming — 가까운 일정 5개
router.get('/upcoming', async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const schedules = await db.all(
      'SELECT * FROM schedules WHERE start_at >= $1 ORDER BY start_at ASC LIMIT 5',
      [now]
    );
    res.json({ success: true, data: schedules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// POST /api/v1/schedule — 일정 등록
router.post('/', async (req, res) => {
  try {
    const {
      title, description, location, category = 'campaign',
      startAt, endAt, isImportant = false,
      notifyDayBefore = true, notifyOnDay = true
    } = req.body;

    if (!title || !startAt) {
      return res.status(400).json({ success: false, message: '제목과 시작 일시 필요' });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO schedules (id, title, description, location, category, start_at, end_at, is_important, notify_day_before, notify_on_day, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [id, title, description, location, category, startAt, endAt, isImportant ? 1 : 0, notifyDayBefore ? 1 : 0, notifyOnDay ? 1 : 0, req.user.id]
    );

    // 중요 일정은 즉시 전체 알림
    if (isImportant) {
      const tokenRows = await db.all('SELECT DISTINCT token FROM device_tokens');
      const tokens = tokenRows.map(r => r.token);
      if (tokens.length > 0) {
        sendPushToAll(tokens, {
          title: '📅 새 중요 일정 등록',
          body: `${title} — ${new Date(startAt * 1000).toLocaleDateString('ko-KR')}`,
          data: { type: 'schedule', scheduleId: id }
        });
      }
    }

    res.json({ success: true, data: { id, title } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// PUT /api/v1/schedule/:id — 일정 수정
router.put('/:id', async (req, res) => {
  try {
    const { title, description, location, category, startAt, endAt, isImportant } = req.body;
    const { id } = req.params;

    const schedule = await db.get('SELECT * FROM schedules WHERE id = $1', [id]);
    if (!schedule) return res.status(404).json({ success: false, message: '일정 없음' });

    // 선거법 시스템 일정은 관리자만 수정
    if (schedule.created_by === 'system' && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '시스템 일정은 관리자만 수정 가능' });
    }

    await db.run(
      `UPDATE schedules SET title=$1, description=$2, location=$3, category=$4,
       start_at=$5, end_at=$6, is_important=$7 WHERE id=$8`,
      [title, description, location, category, startAt, endAt, isImportant ? 1 : 0, id]
    );

    res.json({ success: true, message: '수정 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

// DELETE /api/v1/schedule/:id
router.delete('/:id', async (req, res) => {
  try {
    const schedule = await db.get('SELECT * FROM schedules WHERE id = $1', [req.params.id]);
    if (!schedule) return res.status(404).json({ success: false, message: '일정 없음' });
    if (schedule.created_by === 'system') {
      return res.status(403).json({ success: false, message: '선거법 시스템 일정은 삭제 불가' });
    }

    await db.run('DELETE FROM schedules WHERE id = $1', [req.params.id]);
    res.json({ success: true, message: '삭제 완료' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: '서버 오류' });
  }
});

module.exports = router;
