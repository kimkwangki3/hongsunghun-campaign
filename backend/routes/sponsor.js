// routes/sponsor.js — 후원회 회계 전용 (관리자·회계책임자만)
const router = require('express').Router();
const crypto = require('crypto');
const { db } = require('../database');
const { requireAccountant } = require('../middleware/auth');
const { syncAll } = require('../utils/googleSheets');

const SPONSOR_LIMIT  = 26144720; // 후원회 모금 한도 (제한액 50%)
const DONOR_LIMIT    = 5000000;  // 1인 후원 한도 500만원 (정치자금법)

function autoSync() { syncAll(db).catch(e => console.error('[SponsorSync]', e.message)); }

// ── 요약 대시보드 ──────────────────────────────────────────────────
router.get('/summary', requireAccountant, async (req, res) => {
  try {
    const [inc, exp, pendingSms, donors] = await Promise.all([
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income`),
      db.get(`SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_expense`),
      db.get(`SELECT COUNT(*) cnt FROM sponsor_sms_raw WHERE status='PENDING'`),
      db.all(`SELECT donor_name, SUM(amount) total FROM acct_sponsor_income WHERE donor_name IS NOT NULL GROUP BY donor_name ORDER BY total DESC LIMIT 5`),
    ]);
    const totalIncome  = parseInt(inc.t);
    const totalExpense = parseInt(exp.t);
    const balance      = totalIncome - totalExpense;
    res.json({ success: true, data: {
      total_income:  totalIncome,
      total_expense: totalExpense,
      balance,
      limit:         SPONSOR_LIMIT,
      used_pct:      Math.round((totalIncome / SPONSOR_LIMIT) * 100),
      remaining:     SPONSOR_LIMIT - totalIncome,
      over_limit:    totalIncome > SPONSOR_LIMIT,
      pending_sms:   parseInt(pendingSms?.cnt || 0),
      top_donors:    donors,
    }});
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 미처리 SMS 건수 ───────────────────────────────────────────────
router.get('/sms/pending-count', requireAccountant, async (req, res) => {
  try {
    const r = await db.get(`SELECT COUNT(*) cnt FROM sponsor_sms_raw WHERE status='PENDING'`);
    res.json({ success: true, data: { count: parseInt(r?.cnt || 0) } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 목록 (상태별) ─────────────────────────────────────────────
router.get('/sms', requireAccountant, async (req, res) => {
  try {
    const status = req.query.status || 'PENDING';
    const rows = await db.all(
      `SELECT * FROM sponsor_sms_raw WHERE status=$1 ORDER BY received_at DESC LIMIT 100`,
      [status]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 수동 등록 (붙여넣기) ──────────────────────────────────────
router.post('/sms', requireAccountant, async (req, res) => {
  try {
    const lines = (req.body.text || '').split('\n').map(l => l.trim()).filter(Boolean);
    let saved = 0;
    for (const line of lines) {
      const hash = crypto.createHash('sha256').update(line).digest('hex');
      const parsed = parseSponsorSms(line);
      try {
        await db.run(
          `INSERT INTO sponsor_sms_raw (raw_text,hash,source,sms_type,parsed_amount,parsed_sender,parsed_balance)
           VALUES ($1,$2,'manual',$3,$4,$5,$6)`,
          [line, hash, parsed.type, parsed.amount || null, parsed.sender || null, parsed.balance || null]
        );
        saved++;
      } catch { /* 중복 해시 무시 */ }
    }
    res.json({ success: true, data: { saved, total: lines.length } });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 수입으로 처리 ─────────────────────────────────────────────
router.patch('/sms/:id/income', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    // 1인 한도 체크
    if (d.donor_name) {
      const prev = await db.get(
        `SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income WHERE donor_name=$1`, [d.donor_name]
      );
      if (parseInt(prev.t) + d.amount > DONOR_LIMIT) {
        return res.status(400).json({ success: false, message: `⚠️ ${d.donor_name}님 1인 한도 초과. 현재: ${parseInt(prev.t).toLocaleString()}원 / 한도: ${DONOR_LIMIT.toLocaleString()}원` });
      }
    }
    const lastNo = await db.get(`SELECT receipt_no FROM acct_sponsor_income ORDER BY id DESC LIMIT 1`);
    const lastNum = lastNo ? parseInt((lastNo.receipt_no||'후-0').split('-')[1]||0) : 0;
    const receipt_no = `후-${lastNum + 1}`;
    const income = await db.get(
      `INSERT INTO acct_sponsor_income (date,amount,income_type,donor_name,donor_phone,bank_name,account_no,receipt_no,sms_id,source,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sms',$10) RETURNING *`,
      [d.date, d.amount, d.income_type||'named', d.donor_name||null, d.donor_phone||null,
       d.bank_name||null, d.account_no||null, receipt_no, req.params.id, d.note||null]
    );
    await db.run(
      `UPDATE sponsor_sms_raw SET status='PROCESSED', processed_at=NOW(), sms_type='income', income_id=$1 WHERE id=$2`,
      [income.id, req.params.id]
    );
    autoSync();
    res.json({ success: true, data: income });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 지출로 처리 ───────────────────────────────────────────────
router.patch('/sms/:id/expense', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const lastNo = await db.get(`SELECT receipt_no FROM acct_sponsor_expense ORDER BY id DESC LIMIT 1`);
    const lastNum = lastNo ? parseInt((lastNo.receipt_no||'후지-0').split('-')[1]||0) : 0;
    const receipt_no = `후지-${lastNum + 1}`;
    const expense = await db.get(
      `INSERT INTO acct_sponsor_expense (date,amount,category,receipt_no,destination_account,transfer_purpose,sms_id,source,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'sms',$8) RETURNING *`,
      [d.date, d.amount, d.category||'선거자금이체', receipt_no,
       d.destination_account||null, d.transfer_purpose||'선거자금이체', req.params.id, d.note||null]
    );
    await db.run(
      `UPDATE sponsor_sms_raw SET status='PROCESSED', processed_at=NOW(), sms_type='expense', expense_id=$1 WHERE id=$2`,
      [expense.id, req.params.id]
    );
    autoSync();
    res.json({ success: true, data: expense });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 무시 ──────────────────────────────────────────────────────
router.patch('/sms/:id/skip', requireAccountant, async (req, res) => {
  try {
    await db.run(
      `UPDATE sponsor_sms_raw SET status='SKIPPED', skip_reason=$1 WHERE id=$2`,
      [req.body.reason||'수동 무시', req.params.id]
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원금 수입 목록 ──────────────────────────────────────────────
router.get('/income', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM acct_sponsor_income ORDER BY date DESC, id DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원금 수입 수동 등록 ─────────────────────────────────────────
router.post('/income', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    if (d.donor_name) {
      const prev = await db.get(
        `SELECT COALESCE(SUM(amount),0) t FROM acct_sponsor_income WHERE donor_name=$1`, [d.donor_name]
      );
      if (parseInt(prev.t) + d.amount > DONOR_LIMIT) {
        return res.status(400).json({ success: false, message: `⚠️ ${d.donor_name}님 1인 한도 초과 (${DONOR_LIMIT.toLocaleString()}원)` });
      }
    }
    const lastNo = await db.get(`SELECT receipt_no FROM acct_sponsor_income ORDER BY id DESC LIMIT 1`);
    const lastNum = lastNo ? parseInt((lastNo.receipt_no||'후-0').split('-')[1]||0) : 0;
    const row = await db.get(
      `INSERT INTO acct_sponsor_income (date,amount,income_type,donor_name,donor_dob,donor_address,donor_occupation,donor_phone,bank_name,account_no,receipt_no,source,note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12) RETURNING *`,
      [d.date, d.amount, d.income_type||'named', d.donor_name||null, d.donor_dob||null,
       d.donor_address||null, d.donor_occupation||null, d.donor_phone||null,
       d.bank_name||null, d.account_no||null, `후-${lastNum+1}`, d.note||null]
    );
    autoSync();
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원금 수입 삭제 ──────────────────────────────────────────────
router.delete('/income/:id', requireAccountant, async (req, res) => {
  try {
    await db.run(`DELETE FROM acct_sponsor_income WHERE id=$1`, [req.params.id]);
    autoSync();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 지출 목록 ──────────────────────────────────────────────
router.get('/expense', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM acct_sponsor_expense ORDER BY date DESC, id DESC LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 지출 수동 등록 (선거자금이체만) ──────────────────────
router.post('/expense', requireAccountant, async (req, res) => {
  try {
    const d = req.body;
    const lastNo = await db.get(`SELECT receipt_no FROM acct_sponsor_expense ORDER BY id DESC LIMIT 1`);
    const lastNum = lastNo ? parseInt((lastNo.receipt_no||'후지-0').split('-')[1]||0) : 0;
    const row = await db.get(
      `INSERT INTO acct_sponsor_expense (date,amount,category,receipt_no,destination_account,transfer_purpose,source,note)
       VALUES ($1,$2,$3,$4,$5,$6,'manual',$7) RETURNING *`,
      [d.date, d.amount, d.category||'선거자금이체', `후지-${lastNum+1}`,
       d.destination_account||null, d.transfer_purpose||'선거자금이체', d.note||null]
    );
    autoSync();
    res.status(201).json({ success: true, data: row });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원회 지출 삭제 ──────────────────────────────────────────────
router.delete('/expense/:id', requireAccountant, async (req, res) => {
  try {
    await db.run(`DELETE FROM acct_sponsor_expense WHERE id=$1`, [req.params.id]);
    autoSync();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── 후원자 목록 (기부자별 합산) ───────────────────────────────────
router.get('/donors', requireAccountant, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT donor_name, donor_phone, bank_name,
        COUNT(*) cnt, SUM(amount) total, MIN(date) first_date, MAX(date) last_date,
        ROUND(SUM(amount) * 100.0 / $1, 1) pct_of_limit
       FROM acct_sponsor_income
       WHERE donor_name IS NOT NULL
       GROUP BY donor_name, donor_phone, bank_name
       ORDER BY total DESC`,
      [DONOR_LIMIT]
    );
    res.json({ success: true, data: rows });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── SMS 파싱 유틸 ────────────────────────────────────────────────
function parseSponsorSms(text) {
  const amountMatch = text.match(/(\d{1,3}(?:,\d{3})*|\d+)원/);
  const amount = amountMatch ? parseInt(amountMatch[1].replace(/,/g, '')) : null;
  const balanceMatch = text.match(/잔액\s*[\s:]\s*(\d{1,3}(?:,\d{3})*|\d+)/);
  const balance = balanceMatch ? parseInt(balanceMatch[1].replace(/,/g, '')) : null;

  let type = 'unknown';
  let sender = null;
  if (/입금|이체받|수신|받으/.test(text)) {
    type = 'income';
    const senderMatch = text.match(/([가-힣]{2,5})\s*(?:님|씨)?\s*(?:입금|이체)/);
    sender = senderMatch ? senderMatch[1] : null;
  } else if (/출금|이체|지급|송금/.test(text)) {
    type = 'expense';
  }
  return { type, amount, sender, balance };
}

module.exports = router;
