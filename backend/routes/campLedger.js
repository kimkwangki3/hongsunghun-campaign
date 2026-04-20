// routes/campLedger.js — 캠프 실비 장부 (후통장 / 후현금KK / 후현금SY)
const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
// 권한: 조회·등록은 전체, 삭제는 본인+관리자 (라우트 내 체크)
const { sendPush } = require('../utils/fcm');

// 영수증 업로드 설정
const uploadsDir = path.join(__dirname, '../public/camp-receipts');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadsDir),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `camp_${Date.now()}_${Math.random().toString(36).slice(2,8)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    /\.(jpg|jpeg|png|webp|heic|pdf)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('이미지/PDF만 가능'));
  }
});

const VALID_TYPES = ['bank', 'kk', 'sy'];
const TYPE_LABELS = { bank: '후통장', kk: '후현금(KK)', sy: '후현금(SY)' };

// ── 요약 (탭별) ──────────────────────────────────────────
router.get('/summary/:ledgerType', async (req, res) => {
  const lt = req.params.ledgerType;
  if (!VALID_TYPES.includes(lt)) return res.status(400).json({ success: false, message: '잘못된 장부 유형' });
  try {
    const [inc, exp] = await Promise.all([
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM camp_ledger WHERE ledger_type=$1 AND type='income'`, [lt]),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM camp_ledger WHERE ledger_type=$1 AND type='expense'`, [lt]),
    ]);
    const income = parseInt(inc.t);
    const expense = parseInt(exp.t);
    res.json({ success: true, data: { income, expense, balance: income - expense } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 목록 조회 ────────────────────────────────────────────
router.get('/:ledgerType', async (req, res) => {
  const lt = req.params.ledgerType;
  if (!VALID_TYPES.includes(lt)) return res.status(400).json({ success: false, message: '잘못된 장부 유형' });
  try {
    const rows = await db.all(
      `SELECT l.*, u.name AS created_by_name FROM camp_ledger l
       LEFT JOIN users u ON l.created_by = u.id
       WHERE l.ledger_type = $1 ORDER BY l.date DESC, l.id DESC`,
      [lt]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 등록 ─────────────────────────────────────────────────
router.post('/:ledgerType', upload.single('receipt'), async (req, res) => {
  const lt = req.params.ledgerType;
  if (!VALID_TYPES.includes(lt)) return res.status(400).json({ success: false, message: '잘못된 장부 유형' });
  try {
    const d = req.body;
    const receiptPath = req.file ? `/camp-receipts/${req.file.filename}` : null;
    const row = await db.get(
      `INSERT INTO camp_ledger (ledger_type, date, type, amount, description, has_receipt, receipt_path, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [lt, d.date, d.type, parseInt(d.amount), d.description || '',
       req.file ? true : (d.has_receipt === 'true'), receiptPath, d.note || '', req.user.id]
    );

    // 알림 발송
    try {
      const tokens = await db.all(`SELECT token FROM device_tokens`);
      const typeLabel = d.type === 'income' ? '수입' : '지출';
      if (tokens.length > 0) {
        sendPush(
          tokens.map(t => t.token),
          `💰 캠프 실비 ${typeLabel}`,
          `[${TYPE_LABELS[lt]}] ${parseInt(d.amount).toLocaleString()}원 — ${d.description || ''}`,
          { type: 'camp_ledger', ledger_type: lt }
        );
      }
    } catch (_) {}

    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 삭제 ─────────────────────────────────────────────────
router.delete('/:ledgerType/:id', async (req, res) => {
  try {
    const row = await db.get(`SELECT * FROM camp_ledger WHERE id=$1 AND ledger_type=$2`, [req.params.id, req.params.ledgerType]);
    if (!row) return res.status(404).json({ success: false, message: '항목 없음' });
    // 본인 등록 항목 또는 관리자만 삭제 가능
    if (row.created_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: '본인이 등록한 항목만 삭제할 수 있습니다' });
    }
    // 영수증 파일 삭제
    if (row.receipt_path) {
      const filePath = path.join(__dirname, '../public', row.receipt_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    await db.run(`DELETE FROM camp_ledger WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
