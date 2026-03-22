// routes/accounting.js — 선거회계 관리
const router = require('express').Router();
const multer = require('multer');
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { db } = require('../database');
const { requireAccountant, requireAccountingView } = require('../middleware/auth');
const { processBatchSms, getPendingCount } = require('../utils/acctSmsService');
const { backupToGCS, downloadGCSBuffer } = require('../utils/gcsBackup');
const { appendRow, setupSheets, syncAll } = require('../utils/googleSheets');

const LIMIT = 52289440; // 순천시 제7선거구 제한액
const SPONSOR_LIMIT = 26144720; // 후원회 모금 한도 (제한액 50%)

// Google Sheets 비동기 fire-and-forget
function toSheets(sheetName, values) {
  appendRow(sheetName, values).catch(e => console.error('[Sheets]', e.message));
}

// 영수증 업로드 설정
const uploadsDir = path.join(__dirname, '../public/receipts');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /\.(jpg|jpeg|png|webp|heic)$/i.test(file.originalname) ? cb(null, true) : cb(new Error('이미지만 가능'));
  }
});

// ── 대시보드 (모든 로그인 사용자) ───────────────────────
router.get('/summary', requireAccountingView, async (req, res) => {
  try {
    const [inc, exp, elec, nonElec, sponsorInc, sponsorExp, pendingSms] = await Promise.all([
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_transactions WHERE type='income'`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_transactions WHERE type='expense'`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_transactions WHERE type='expense' AND cost_type='election_cost'`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_transactions WHERE type='expense' AND cost_type='non_election_cost'`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_expense`),
      getPendingCount(),
    ]);
    const electionCost = parseInt(elec.t);
    res.json({ success: true, data: {
      income:         parseInt(inc.t),
      expense:        parseInt(exp.t),
      election_cost:  electionCost,
      non_election:   parseInt(nonElec.t),
      balance:        parseInt(inc.t) - parseInt(exp.t),
      limit:          LIMIT,
      used_pct:       Math.round((electionCost / LIMIT) * 100),
      remaining:      LIMIT - electionCost,
      over_limit:     electionCost > LIMIT,
      sponsor_income: parseInt(sponsorInc.t),
      sponsor_expense:parseInt(sponsorExp.t),
      sponsor_limit:  SPONSOR_LIMIT,
      sponsor_pct:    Math.round((parseInt(sponsorInc.t) / SPONSOR_LIMIT) * 100),
      pending_sms:    pendingSms,
    }});
  } catch (e) { console.error(e); res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 목록 (모든 로그인 사용자 — 읽기 전용) ────
router.get('/transactions', requireAccountingView, async (req, res) => {
  try {
    const { type, cost_type, from, to, limit = 100, offset = 0 } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (type)      { params.push(type);      where += ` AND t.type=$${params.length}`; }
    if (cost_type) { params.push(cost_type); where += ` AND t.cost_type=$${params.length}`; }
    if (from)      { params.push(from);      where += ` AND t.date>=$${params.length}`; }
    if (to)        { params.push(to);        where += ` AND t.date<=$${params.length}`; }
    params.push(parseInt(limit), parseInt(offset));
    const rows = await db.all(
      `SELECT t.*, u.name AS created_by_name, r.image_url AS receipt_url
       FROM acct_transactions t
       LEFT JOIN users u ON t.created_by = u.id
       LEFT JOIN acct_receipts r ON t.receipt_id = r.id
       ${where}
       ORDER BY t.date DESC, t.id DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 등록 (회계담당+관리자) ────────────────────
router.post('/transactions', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    if (d.cost_type === 'election_cost' && d.type === 'expense') {
      const used = await db.get(
        `SELECT COALESCE(SUM(amount),0) t FROM acct_transactions WHERE type='expense' AND cost_type='election_cost'`
      );
      if (parseInt(used.t) + d.amount > LIMIT) {
        return res.status(400).json({ success: false, message: `선거비용제한액 초과. 현재: ${used.t}원 / 제한: ${LIMIT.toLocaleString()}원` });
      }
    }
    // 영수증 번호 자동 채번
    if (!d.receipt_no) {
      const prefix = d.type === 'income' ? '수' : (d.cost_type === 'election_cost' ? '자(비)' : '자');
      const last = await db.get(
        `SELECT receipt_no FROM acct_transactions WHERE receipt_no LIKE $1 ORDER BY id DESC LIMIT 1`,
        [`${prefix}-%`]
      );
      const lastNum = last ? parseInt(last.receipt_no.split('-')[1] || 0) : 0;
      d.receipt_no = `${prefix}-${lastNum + 1}`;
    }
    const row = await db.get(
      `INSERT INTO acct_transactions
         (date,amount,type,description,account_type,cost_type,category,
          receipt_no,receipt_id,account_verified,approved,reimbursable,source,note,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'manual',$13,$14) RETURNING *`,
      [d.date, d.amount, d.type, d.description, d.account_type, d.cost_type,
       d.category, d.receipt_no, d.receipt_id || null,
       d.account_verified ?? false, d.approved ?? false, d.reimbursable,
       d.note, req.user.id]
    );
    // Google Sheets 자동 동기화 (fire-and-forget)
    toSheets('수입지출장부', [
      '', row.date,
      row.type === 'income' ? '수입' : '지출',
      row.cost_type === 'election_cost' ? '선거비용' : row.cost_type === 'non_election_cost' ? '비선거비용' : '',
      row.category||'', row.description||'', row.amount,
      row.receipt_no||'', row.account_verified?'O':'', row.reimbursable?'O':'',
      row.note||'', req.user.name||req.user.id,
      new Date().toLocaleString('ko-KR'),
    ]);
    if (row.type === 'expense' && row.cost_type === 'election_cost') {
      toSheets('선거비용명세', ['', row.date, row.category||'', row.description||'', row.amount, '', row.receipt_no||'', row.reimbursable?'O':'', row.note||'']);
    }
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 수정 (회계담당+관리자) ─────────────────────
router.put('/transactions/:id', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const row = await db.get(
      `UPDATE acct_transactions SET date=$1,amount=$2,description=$3,account_type=$4,
       cost_type=$5,category=$6,account_verified=$7,approved=$8,reimbursable=$9,note=$10,updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [d.date,d.amount,d.description,d.account_type,d.cost_type,
       d.category,d.account_verified,d.approved,d.reimbursable,d.note,req.params.id]
    );
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 삭제 (회계담당+관리자) ─────────────────────
router.delete('/transactions/:id', requireAccountant, async (req, res) => {
  try {
    await db.run('DELETE FROM acct_transactions WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 보전 시뮬레이터 (읽기) ────────────────────────────
router.get('/reimbursement-sim', requireAccountingView, async (req, res) => {
  try {
    const pct = parseFloat(req.query.vote_pct || 0);
    const r = await db.get(
      `SELECT COALESCE(SUM(amount),0) t FROM acct_transactions
       WHERE type='expense' AND cost_type='election_cost' AND reimbursable=true`
    );
    const total = parseInt(r.t);
    let amount = 0, rate = '미보전';
    if (pct >= 15)      { amount = total; rate = '전액'; }
    else if (pct >= 10) { amount = Math.floor(total * 0.5); rate = '50%'; }
    res.json({ success: true, data: { vote_pct: pct, reimbursable_total: total, amount, rate } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 영수증 OCR 업로드 (모든 로그인 사용자) ─────────────
// 규칙: 업로드된 파일은 절대 삭제 금지 — OCR 실패해도 DB에 저장 + GCS 백업
router.post('/receipts/upload', requireAccountingView, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: '파일 없음' });

  // 파일명에 확장자 추가 (multer 기본은 확장자 없이 저장)
  const origExt = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const finalPath = req.file.path + origExt;
  try { fs.renameSync(req.file.path, finalPath); } catch {}

  const imageUrl = `/receipts/${req.file.filename}${origExt}`;
  let rawText = '', parsed = {};

  // OCR 시도 (실패해도 진행)
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      const imgBuf = fs.readFileSync(finalPath);
      const b64 = imgBuf.toString('base64');
      const mediaType =
        origExt === '.png'  ? 'image/png'  :
        origExt === '.webp' ? 'image/webp' : 'image/jpeg';
      const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
              { type: 'text', text: '이 영수증을 분석해 JSON만 반환하세요:\n{"date":"YYYY-MM-DD","amount":숫자,"vendor":"업체명","vendor_reg_no":"사업자번호","receipt_type":"세금계산서|카드매출전표|현금영수증|간이영수증|수령증","category_suggestion":"선거비용과목","reimbursable":true/false,"confidence":0.0~1.0}' }
            ]
          }]
        })
      });
      const aiData = await aiResp.json();
      rawText = aiData.content?.[0]?.text || '';
      try { parsed = JSON.parse(rawText.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch {}
    }
  } catch (ocrErr) {
    console.error('OCR 오류 (파일 보존 후 계속):', ocrErr.message);
  }

  // 항상 DB 저장 (OCR 성공/실패 무관)
  try {
    const row = await db.get(
      `INSERT INTO acct_receipts
         (image_path,image_url,ocr_raw,ocr_date,ocr_amount,ocr_vendor,ocr_vendor_reg_no,
          ocr_receipt_type,ocr_confidence,category_suggestion,reimbursable_guess,uploaded_by,uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING *`,
      [finalPath, imageUrl, rawText || null, parsed.date || null, parsed.amount || null,
       parsed.vendor || null, parsed.vendor_reg_no || null,
       parsed.receipt_type || null, parsed.confidence || null,
       parsed.category_suggestion || null, parsed.reimbursable ?? null,
       req.user.id]
    );

    // GCS 백업 — 비동기 fire-and-forget (실패해도 응답에 영향 없음)
    backupToGCS(finalPath, req.file.originalname).then(gcsUrl => {
      if (gcsUrl) {
        db.run('UPDATE acct_receipts SET gcs_url=$1 WHERE id=$2', [gcsUrl, row.id])
          .then(() => console.log(`✅ GCS 백업 완료 (id=${row.id}): ${gcsUrl}`))
          .catch(() => {});
      }
    }).catch(() => {});

    // Google Sheets 영수증목록 동기화
    toSheets('영수증목록', ['', new Date().toLocaleDateString('ko-KR'), row.ocr_date||'', row.ocr_vendor||'', row.ocr_vendor_reg_no||'', row.ocr_receipt_type||'', row.ocr_amount||'', row.category_suggestion||'', req.user.name||req.user.id, '']);
    res.json({ success: true, data: row });
  } catch (e) {
    console.error('영수증 DB 저장 오류:', e);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ── 영수증 목록 (읽기) ───────────────────────────────
router.get('/receipts', requireAccountingView, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT r.*, u.name AS uploader_name FROM acct_receipts r
       LEFT JOIN users u ON r.uploaded_by = u.id
       ORDER BY r.uploaded_at DESC LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 영수증 날짜별 ZIP 다운로드 (회계담당+관리자) ──────────
router.get('/receipts/download', requireAccountant, async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ success: false, message: '날짜 범위 필요 (?from=YYYY-MM-DD&to=YYYY-MM-DD)' });
    }

    const rows = await db.all(
      `SELECT * FROM acct_receipts WHERE uploaded_at::date >= $1 AND uploaded_at::date <= $2 ORDER BY uploaded_at`,
      [from, to]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '해당 기간 영수증 없음' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="receipts_${from}_${to}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { if (!res.headersSent) res.status(500).end(); console.error(err); });
    archive.pipe(res);

    for (const receipt of rows) {
      const dateStr = receipt.uploaded_at
        ? new Date(receipt.uploaded_at).toISOString().split('T')[0]
        : 'unknown';
      const ext = receipt.image_path ? (path.extname(receipt.image_path) || '.jpg') : '.jpg';
      const vendor = (receipt.ocr_vendor || 'receipt').replace(/[^a-zA-Z가-힣0-9]/g, '_').substring(0, 20);
      const filename = `${dateStr}_${String(receipt.id).padStart(4, '0')}_${vendor}${ext}`;

      if (receipt.image_path && fs.existsSync(receipt.image_path)) {
        archive.file(receipt.image_path, { name: filename });
      } else if (receipt.gcs_url) {
        try {
          const buf = await downloadGCSBuffer(receipt.gcs_url);
          archive.append(buf, { name: filename });
        } catch (e) {
          console.warn(`GCS 다운로드 건너뜀 (id=${receipt.id}):`, e.message);
        }
      }
    }

    await archive.finalize();
  } catch (e) {
    console.error('영수증 다운로드 오류:', e);
    if (!res.headersSent) res.status(500).json({ success: false, message: e.message });
  }
});

// ── SMS 입력 (회계담당+관리자) ──────────────────────────
router.post('/sms/upload', requireAccountant, async (req, res) => {
  try {
    const { texts } = req.body;
    if (!texts || !Array.isArray(texts)) return res.status(400).json({ success: false, message: '텍스트 배열 필요' });
    const result = await processBatchSms(texts);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 목록 (회계담당+관리자) ─────────────────────────
router.get('/sms', requireAccountant, async (req, res) => {
  try {
    const { status } = req.query;
    const rows = await db.all(
      `SELECT * FROM acct_sms_raw ${status ? 'WHERE status=$1' : ''} ORDER BY received_at DESC LIMIT 200`,
      status ? [status] : []
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 승인 → 거래 등록 (회계담당+관리자) ──────────────
router.post('/sms/:id/approve', requireAccountant, async (req, res) => {
  try {
    const sms = await db.get('SELECT * FROM acct_sms_raw WHERE id=$1', [req.params.id]);
    if (!sms) return res.status(404).json({ success: false, message: 'SMS 없음' });
    const d = req.body; // 사용자가 과목 등 보정 후 전송
    const row = await db.get(
      `INSERT INTO acct_transactions
         (date,amount,type,description,cost_type,category,reimbursable,source,sms_id,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sms_auto',$8,$9) RETURNING *`,
      [d.date, d.amount, d.type, d.description || sms.raw_text.substring(0, 50),
       d.cost_type, d.category, d.reimbursable ?? null, sms.id, req.user.id]
    );
    await db.run(
      `UPDATE acct_sms_raw SET status='PROCESSED', processed_at=NOW(), transaction_id=$1 WHERE id=$2`,
      [row.id, sms.id]
    );
    toSheets('수입지출장부', [
      '', row.date,
      row.type === 'income' ? '수입' : '지출',
      row.cost_type === 'election_cost' ? '선거비용' : row.cost_type === 'non_election_cost' ? '비선거비용' : '',
      row.category||'', row.description||'', row.amount,
      row.receipt_no||'', '', row.reimbursable?'O':'',
      'SMS자동', req.user.name||req.user.id, new Date().toLocaleString('ko-KR'),
    ]);
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 건너뜀 (회계담당+관리자) ───────────────────────
router.post('/sms/:id/skip', requireAccountant, async (req, res) => {
  try {
    await db.run(
      `UPDATE acct_sms_raw SET status='SKIPPED', skip_reason=$1 WHERE id=$2`,
      [req.body.reason || '수동 건너뜀', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 수입 목록 (회계담당+관리자) ──────────────────
router.get('/sponsor/income', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM acct_sponsor_income ORDER BY date DESC LIMIT 200');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 수입 등록 (회계담당+관리자) ──────────────────
router.post('/sponsor/income', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    // 1인 한도 확인 (500만원)
    if (d.donor_name) {
      const donorTotal = await db.get(
        'SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income WHERE donor_name=$1',
        [d.donor_name]
      );
      if (parseInt(donorTotal.t) + d.amount > 5000000) {
        return res.status(400).json({ success: false, message: `1인 후원 한도(500만원) 초과` });
      }
    }
    // 총 모금 한도 확인
    const total = await db.get('SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income');
    if (parseInt(total.t) + d.amount > SPONSOR_LIMIT) {
      return res.status(400).json({ success: false, message: `후원회 모금 한도(${SPONSOR_LIMIT.toLocaleString()}원) 초과` });
    }
    const row = await db.get(
      `INSERT INTO acct_sponsor_income
         (date,amount,income_type,donor_name,donor_dob,donor_address,donor_occupation,donor_phone,receipt_no,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [d.date, d.amount, d.income_type || 'named', d.donor_name, d.donor_dob,
       d.donor_address, d.donor_occupation, d.donor_phone, d.receipt_no, d.note]
    );
    toSheets('후원회수입', ['', row.date, row.donor_name||'익명', row.donor_dob||'', row.donor_address||'', row.donor_occupation||'', row.donor_phone||'', row.amount, row.receipt_no||'', row.note||'']);
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 지출 목록/등록 (회계담당+관리자) ─────────────
router.get('/sponsor/expense', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM acct_sponsor_expense ORDER BY date DESC LIMIT 200');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/sponsor/expense', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const row = await db.get(
      `INSERT INTO acct_sponsor_expense (date,amount,category,receipt_no,note)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [d.date, d.amount, d.category, d.receipt_no, d.note]
    );
    toSheets('후원회지출', ['', row.date, row.category, row.note||'', row.amount, row.receipt_no||'', '']);
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수당 목록/등록 (회계담당+관리자) ────────────────────
const STAFF_LIMITS = { manager: 100000, branch_manager: 100000, accountant: 100000, worker: 60000 };
router.get('/staff', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM acct_staff_payments ORDER BY payment_date DESC LIMIT 200');
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});
router.post('/staff', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const maxAllowance = STAFF_LIMITS[d.staff_role] || 60000;
    if (d.allowance > maxAllowance) {
      return res.status(400).json({ success: false, message: `수당 상한 초과 (최대 ${maxAllowance.toLocaleString()}원)` });
    }
    const mealActual = Math.max(0, 25000 - (d.meal_provided || 0) * 8330);
    const total = (d.allowance || 0) + 20000 - (d.transport_deduction || 0) + mealActual;
    const row = await db.get(
      `INSERT INTO acct_staff_payments
         (payment_date,staff_role,staff_name,staff_account,allowance,meal_provided,transport_deduction,total_actual,receipt_no,approved,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [d.payment_date, d.staff_role, d.staff_name, d.staff_account,
       d.allowance || 0, d.meal_provided || 0, d.transport_deduction || 0,
       total, d.receipt_no, d.approved ?? false, d.note]
    );
    const ROLE_MAP_LOCAL = { manager:'선거사무장', branch_manager:'선거연락소장', accountant:'회계책임자', worker:'선거사무원' };
    toSheets('수당실비명세', ['', row.payment_date, ROLE_MAP_LOCAL[row.staff_role]||row.staff_role, row.staff_name, row.staff_account||'', row.allowance, 20000, Math.max(0,25000-(row.meal_provided||0)*8330), row.transport_deduction||0, row.total_actual||0, row.receipt_no||'', row.approved?'승인':'미승인', row.note||'']);
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 구글시트 초기화 (admin) ────────────────────────────
const { requireAdmin } = require('../middleware/auth');
router.post('/sheets/setup', requireAdmin, async (req, res) => {
  try {
    const sheets = await setupSheets();
    res.json({ success: true, data: { sheets } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 구글시트 전체 동기화 (admin+accountant) ────────────
router.post('/sheets/sync', requireAccountant, async (req, res) => {
  try {
    const result = await syncAll(db);
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 시트 URL 반환 ──────────────────────────────────────
router.get('/sheets/url', requireAccountant, (req, res) => {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) return res.json({ success: true, data: { url: null, configured: false } });
  res.json({ success: true, data: { url: `https://docs.google.com/spreadsheets/d/${id}/edit`, configured: true } });
});

module.exports = router;
