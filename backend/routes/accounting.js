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
const { sendPush } = require('../utils/fcm');
const { appendRow, setupSheets, syncAll } = require('../utils/googleSheets');

const LIMIT = 52289440; // 순천시 제7선거구 제한액
const SPONSOR_LIMIT = 26144720; // 후원회 모금 한도 (제한액 50%)

// Google Sheets 비동기 fire-and-forget (단일 행 추가)
function toSheets(sheetName, values) {
  appendRow(sheetName, values).catch(e => console.error('[Sheets]', e.message));
}

// 전체 자동 동기화 (모든 쓰기 작업 후 호출)
function autoSync() {
  syncAll(db).catch(e => console.error('[AutoSync]', e.message));
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
    // 예비후보자 기간(~2026-05-13)은 선거비용 보전 불가
    if (d.date && d.date < '2026-05-14') d.reimbursable = false;
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
    // 영수증 상태 PROCESSED + 처리자 기록
    if (d.receipt_id) {
      db.run(
        `UPDATE acct_receipts SET status='PROCESSED', processed_by=$1, processed_at=NOW() WHERE id=$2`,
        [req.user.id, d.receipt_id]
      ).catch(() => {});
    }

    // Google Sheets 자동 동기화 (fire-and-forget)
    autoSync();
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 수정 (회계담당+관리자) ─────────────────────
router.put('/transactions/:id', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    // 예비후보자 기간(~2026-05-13)은 선거비용 보전 불가
    if (d.date && d.date < '2026-05-14') d.reimbursable = false;
    const row = await db.get(
      `UPDATE acct_transactions SET date=$1,amount=$2,description=$3,account_type=$4,
       cost_type=$5,category=$6,account_verified=$7,approved=$8,reimbursable=$9,note=$10,updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [d.date,d.amount,d.description,d.account_type,d.cost_type,
       d.category,d.account_verified,d.approved,d.reimbursable,d.note,req.params.id]
    );
    autoSync();
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 수입/지출 삭제 (회계담당+관리자) ─────────────────────
router.delete('/transactions/:id', requireAccountant, async (req, res) => {
  try {
    await db.run('DELETE FROM acct_transactions WHERE id=$1', [req.params.id]);
    autoSync();
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
    const uploaderNote = req.body?.note || null;
    const row = await db.get(
      `INSERT INTO acct_receipts
         (image_path,image_url,ocr_raw,ocr_date,ocr_amount,ocr_vendor,ocr_vendor_reg_no,
          ocr_receipt_type,ocr_confidence,category_suggestion,reimbursable_guess,note,uploaded_by,uploaded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING *`,
      [finalPath, imageUrl, rawText || null, parsed.date || null, parsed.amount || null,
       parsed.vendor || null, parsed.vendor_reg_no || null,
       parsed.receipt_type || null, parsed.confidence || null,
       parsed.category_suggestion || null, parsed.reimbursable ?? null,
       uploaderNote, req.user.id]
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

    // 회계담당자 + 관리자에게 FCM 푸시 알림
    db.all(
      `SELECT dt.token FROM users u
       JOIN device_tokens dt ON dt.user_id = u.id
       WHERE u.role IN ('admin','accountant') AND u.id != $1`,
      [req.user.id]
    ).then(tokenRows => {
      const tokens = tokenRows.map(t => t.token).filter(Boolean);
      if (tokens.length > 0) {
        sendPush(tokens, {
          title: '🧾 새 영수증 업로드',
          body: `${req.user.name || '캠프원'}님 업로드${row.note ? ' — ' + row.note : ''}${row.ocr_amount ? ' · ' + Number(row.ocr_amount).toLocaleString() + '원' : ''}`,
          data: { type: 'receipt', receiptId: String(row.id) }
        });
      }
    }).catch(() => {});

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

// ── 미처리 영수증 목록 (회계담당+관리자) ────────────────
router.get('/receipts/pending', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT r.*, u.name AS uploader_name, p.name AS processor_name
       FROM acct_receipts r
       LEFT JOIN users u ON r.uploaded_by = u.id
       LEFT JOIN users p ON r.processed_by = p.id
       WHERE r.status = 'PENDING'
         AND r.id NOT IN (SELECT receipt_id FROM acct_transactions WHERE receipt_id IS NOT NULL)
       ORDER BY r.uploaded_at DESC
       LIMIT 100`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 미처리 영수증 수 (회계담당+관리자, 홈화면용) ──────────────
router.get('/receipts/pending-count', requireAccountant, async (req, res) => {
  try {
    const r = await db.get(
      `SELECT COUNT(*) cnt FROM acct_receipts
       WHERE status = 'PENDING'
         AND id NOT IN (SELECT receipt_id FROM acct_transactions WHERE receipt_id IS NOT NULL)`
    );
    res.json({ success: true, data: { count: parseInt(r?.cnt || 0) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 영수증 전체 목록 (회계담당+관리자) — 탭용 ────────────
router.get('/receipts/list', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT r.*, u.name AS uploader_name FROM acct_receipts r
       LEFT JOIN users u ON r.uploaded_by = u.id
       ORDER BY COALESCE(r.ocr_date, r.uploaded_at::date) DESC, r.id DESC
       LIMIT 500`
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

    // ocr_date(영수증 기재 날짜) 기준으로 필터
    const rows = await db.all(
      `SELECT * FROM acct_receipts WHERE ocr_date >= $1 AND ocr_date <= $2 ORDER BY ocr_date, id`,
      [from, to]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '해당 기간 영수증 없음' });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="영수증_${from}_${to}.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', err => { if (!res.headersSent) res.status(500).end(); console.error(err); });
    archive.pipe(res);

    for (const receipt of rows) {
      // 파일명은 영수증 기재 날짜(ocr_date) 기준
      const dateStr = receipt.ocr_date
        ? String(receipt.ocr_date).split('T')[0]
        : (receipt.uploaded_at ? new Date(receipt.uploaded_at).toISOString().split('T')[0] : 'unknown');
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
    // 예비후보자 기간(~2026-05-13)은 선거비용 보전 불가
    if (d.date && d.date < '2026-05-14') d.reimbursable = false;
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
    autoSync();
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
    autoSync();
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 비품 목록 ────────────────────────────────────────
router.get('/assets', requireAccountingView, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT a.*, u.name AS created_by_name FROM acct_assets a
       LEFT JOIN users u ON a.created_by = u.id
       ORDER BY a.asset_no`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 비품 등록 ────────────────────────────────────────
router.post('/assets', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    // 관리번호 자동 채번: 비-001, 비-002...
    const last = await db.get(`SELECT asset_no FROM acct_assets ORDER BY id DESC LIMIT 1`);
    let nextNum = 1;
    if (last) {
      const m = last.asset_no.match(/(\d+)$/);
      if (m) nextNum = parseInt(m[1]) + 1;
    }
    const asset_no = `비-${String(nextNum).padStart(3, '0')}`;
    const total = (d.quantity || 1) * (d.unit_price || 0);
    const row = await db.get(
      `INSERT INTO acct_assets
         (asset_no,name,quantity,unit_price,total_amount,purchase_date,vendor,
          location,transaction_id,receipt_id,status,accounted,note,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [asset_no, d.name, d.quantity||1, d.unit_price||0, total,
       d.purchase_date, d.vendor||null, d.location||'선거사무소 본소',
       d.transaction_id||null, d.receipt_id||null,
       d.status||'사용중', d.accounted??false, d.note||null, req.user.id]
    );
    autoSync();
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 비품 수정 ────────────────────────────────────────
router.put('/assets/:id', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const total = (d.quantity || 1) * (d.unit_price || 0);
    const row = await db.get(
      `UPDATE acct_assets SET name=$1,quantity=$2,unit_price=$3,total_amount=$4,
       purchase_date=$5,vendor=$6,location=$7,transaction_id=$8,receipt_id=$9,
       status=$10,accounted=$11,note=$12 WHERE id=$13 RETURNING *`,
      [d.name, d.quantity||1, d.unit_price||0, total,
       d.purchase_date, d.vendor||null, d.location||'선거사무소 본소',
       d.transaction_id||null, d.receipt_id||null,
       d.status||'사용중', d.accounted??false, d.note||null, req.params.id]
    );
    autoSync();
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 비품 회계등록 체크 토글 ──────────────────────────
router.patch('/assets/:id/accounted', requireAccountant, async (req, res) => {
  try {
    const row = await db.get(
      `UPDATE acct_assets SET accounted=$1 WHERE id=$2 RETURNING *`,
      [req.body.accounted, req.params.id]
    );
    autoSync();
    res.json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 비품 삭제 ────────────────────────────────────────
router.delete('/assets/:id', requireAccountant, async (req, res) => {
  try {
    await db.run('DELETE FROM acct_assets WHERE id=$1', [req.params.id]);
    autoSync();
    res.json({ success: true });
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
    // 새 시트가 생성된 경우 ID를 로그에 남김
    if (result.spreadsheetId && result.spreadsheetId !== process.env.GOOGLE_SHEET_ID) {
      console.log('🆕 새 스프레드시트 생성됨. Render 환경변수 GOOGLE_SHEET_ID를 아래 값으로 변경하세요:');
      console.log('GOOGLE_SHEET_ID =', result.spreadsheetId);
    }
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 테스트 영수증 삽입 (admin 전용, 개발/테스트용) ──────
router.post('/test/seed-receipt', requireAdmin, async (req, res) => {
  try {
    const { v4: uuidv4 } = require('uuid');
    const rows = await db.all(`
      INSERT INTO acct_receipts (image_path, image_url, ocr_date, ocr_amount, ocr_vendor, ocr_vendor_reg_no, ocr_receipt_type, ocr_confidence, category_suggestion, reimbursable_guess, status, uploaded_by, note)
      VALUES
        ('/receipts/test1.jpg', null, '2026-03-20', 220000, '홍캠프인쇄소', '123-45-67890', '세금계산서', 0.92, '홍보물제작비', true, 'PENDING', $1, '현수막 500부 제작'),
        ('/receipts/test2.jpg', null, '2026-03-21', 85000,  '캠프식당',     '234-56-78901', '간이영수증',   0.85, '식비',         true, 'PENDING', $1, '캠프 회의 식사비'),
        ('/receipts/test3.jpg', null, '2026-03-22', 45000,  'GS25편의점',   '345-67-89012', '신용카드매출전표', 0.90, '다과음료비',  true, 'PENDING', $1, '다과 구매')
      RETURNING *
    `, [req.user.id]);
    res.json({ success: true, data: { inserted: rows.length, message: `테스트 영수증 ${rows.length}건 추가됨` } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 구글 시트 연결 진단 (admin) ────────────────────────
router.get('/sheets/diagnose', requireAdmin, async (req, res) => {
  const result = { env: {}, auth: null, spreadsheet: null, error: null };
  try {
    result.env.GOOGLE_SHEET_ID    = process.env.GOOGLE_SHEET_ID    ? '✅ 설정됨 (' + process.env.GOOGLE_SHEET_ID + ')' : '❌ 미설정';
    result.env.FIREBASE_CLIENT_EMAIL = process.env.FIREBASE_CLIENT_EMAIL ? '✅ ' + process.env.FIREBASE_CLIENT_EMAIL : '❌ 미설정';
    result.env.FIREBASE_PRIVATE_KEY  = process.env.FIREBASE_PRIVATE_KEY  ? '✅ 설정됨 (길이:' + process.env.FIREBASE_PRIVATE_KEY.length + ')' : '❌ 미설정';

    const { google } = require('googleapis');
    const auth = new google.auth.JWT(
      process.env.FIREBASE_CLIENT_EMAIL,
      null,
      process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const token = await auth.getAccessToken();
    result.auth = token.token ? '✅ 인증 토큰 획득 성공' : '❌ 토큰 없음';

    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim() });
    result.spreadsheet = '✅ 스프레드시트 접근 성공: ' + meta.data.properties.title;
    result.sheets = meta.data.sheets.map(s => s.properties.title);

    // 쓰기 테스트 - 기존 첫번째 탭에 테스트값 쓰기
    const firstSheet = meta.data.sheets[0]?.properties?.title;
    if (firstSheet) {
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim(),
          range: `${firstSheet}!Z1`,
          valueInputOption: 'RAW',
          requestBody: { values: [['test_ok']] }
        });
        result.writeTest = '✅ 쓰기 성공 (' + firstSheet + '!Z1)';
        // 테스트값 지우기
        await sheets.spreadsheets.values.clear({
          spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim(),
          range: `${firstSheet}!Z1`
        });
      } catch (e2) {
        result.writeTest = '❌ 쓰기 실패: ' + e2.message;
      }

      // addSheet 테스트
      try {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim(),
          requestBody: { requests: [{ addSheet: { properties: { title: '_test_sheet_' } } }] }
        });
        result.addSheetTest = '✅ 시트 추가 성공';
        // 테스트 시트 삭제
        const meta2 = await sheets.spreadsheets.get({ spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim() });
        const testSheetId = meta2.data.sheets.find(s => s.properties.title === '_test_sheet_')?.properties?.sheetId;
        if (testSheetId !== undefined) {
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: (process.env.GOOGLE_SHEET_ID||'').trim(),
            requestBody: { requests: [{ deleteSheet: { sheetId: testSheetId } }] }
          });
        }
      } catch (e3) {
        result.addSheetTest = '❌ 시트 추가 실패: ' + e3.message;
      }
    }
  } catch (e) {
    result.error = e.message;
    result.errorDetail = e.response?.data || null;
  }
  res.json({ success: true, data: result });
});

// ── 시트 URL 반환 ──────────────────────────────────────
router.get('/sheets/url', requireAccountant, (req, res) => {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) return res.json({ success: true, data: { url: null, configured: false } });
  res.json({ success: true, data: { url: `https://docs.google.com/spreadsheets/d/${id}/edit`, configured: true } });
});

module.exports = router;
