// utils/acctSmsService.js — 선거회계 SMS 파싱 서비스
const crypto = require('crypto');
const { db } = require('../database');

const ELECTION_COST_KEYWORDS = [
  { keywords: ['인쇄','현수막','홍보','명함','공보','벽보'], category: '홍보물제작비', reimbursable: true },
  { keywords: ['신문','방송','광고','인터넷광고'], category: '광고비', reimbursable: true },
  { keywords: ['식당','음식','식사','도시락','밥'], category: '식비', reimbursable: true },
  { keywords: ['카페','음료','커피','다과'], category: '다과음료비', reimbursable: true },
  { keywords: ['주유','기름','연료','주유소'], category: '차량운행비', reimbursable: true },
  { keywords: ['렌트','차량임차','렌터카'], category: '차량임차비', reimbursable: true },
  { keywords: ['통신','전화','문자','sms'], category: '통신비', reimbursable: true },
  { keywords: ['수당','급여','인건'], category: '선거사무관계자수당', reimbursable: true },
  { keywords: ['사무용품','문구','복사'], category: '사무용품비', reimbursable: true },
];
const NON_ELECTION_KEYWORDS = [
  { keywords: ['임차','임대','사무소임차'], category: '사무소임차료', reimbursable: false },
  { keywords: ['전기','수도','관리비','가스'], category: '사무소유지비', reimbursable: false },
  { keywords: ['기탁금'], category: '기탁금', reimbursable: false },
];

function generateHash(text) {
  const normalized = text.trim().replace(/\s+/g, ' ').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

function parseSmsText(raw) {
  const text = raw.trim();
  const bankMatch = text.match(/^\[([^\]]+)\]/);
  const bank = bankMatch ? bankMatch[1] : '알수없음';
  const isIncome = /입금/.test(text);
  const isExpense = /출금|이체출금/.test(text);
  const type = isIncome ? 'income' : isExpense ? 'expense' : 'unknown';
  const txMatch = text.match(/(?:입금|출금|이체)\s*([0-9,]+)원?/);
  const balMatch = text.match(/잔액\s*([0-9,]+)/);
  const txAmt = txMatch ? parseInt(txMatch[1].replace(/,/g, '')) : 0;
  const balAmt = balMatch ? parseInt(balMatch[1].replace(/,/g, '')) : null;
  const fallback = [...text.matchAll(/([0-9,]+)원/g)]
    .map(m => parseInt(m[1].replace(/,/g, '')))
    .filter(a => a > 100 && a !== balAmt);
  const amount = txAmt > 0 ? txAmt : (fallback[0] || 0);
  const counterpartMatch = text.match(/(?:입금|출금|이체)\s+[0-9,]+원?\s+([가-힣a-zA-Z○○\(\)㈜]{2,20})/);
  const counterpart = counterpartMatch ? counterpartMatch[1] : '';
  const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})/);
  const now = new Date();
  const date = dateMatch
    ? `${now.getFullYear()}-${dateMatch[1].padStart(2, '0')}-${dateMatch[2].padStart(2, '0')}`
    : new Date().toISOString().split('T')[0];
  return { bank, type, amount, balance: balAmt, counterpart, date };
}

function mapCategory(counterpart) {
  const text = counterpart.toLowerCase();
  for (const item of ELECTION_COST_KEYWORDS) {
    if (item.keywords.some(k => text.includes(k))) {
      return { category: item.category, cost_type: 'election_cost', reimbursable: item.reimbursable };
    }
  }
  for (const item of NON_ELECTION_KEYWORDS) {
    if (item.keywords.some(k => text.includes(k))) {
      return { category: item.category, cost_type: 'non_election_cost', reimbursable: false };
    }
  }
  return { category: null, cost_type: null, reimbursable: null };
}

async function processBatchSms(smsList) {
  const results = [];
  let newCount = 0, dupCount = 0, failCount = 0;
  for (const raw of smsList) {
    if (!raw.trim()) continue;
    try {
      const hash = generateHash(raw);
      const dup = await db.get('SELECT id FROM acct_sms_raw WHERE hash=$1', [hash]);
      if (dup) {
        dupCount++;
        results.push({ raw_text: raw, status: 'SKIPPED', reason: 'duplicate' });
        continue;
      }
      const ins = await db.get(
        'INSERT INTO acct_sms_raw (raw_text, hash) VALUES ($1,$2) RETURNING id',
        [raw, hash]
      );
      const parsed = parseSmsText(raw);
      const mapped = parsed.type !== 'unknown' ? mapCategory(parsed.counterpart) : {};
      newCount++;
      results.push({ id: ins.id, raw_text: raw, status: 'PARSED', ...parsed, ...mapped });
    } catch (e) {
      failCount++;
      results.push({ raw_text: raw, status: 'FAILED', reason: e.message });
    }
  }
  return { results, summary: { new: newCount, duplicate: dupCount, failed: failCount } };
}

async function getPendingCount() {
  const r = await db.get('SELECT COUNT(*) cnt FROM acct_sms_raw WHERE status=$1', ['PENDING']);
  return parseInt(r?.cnt || 0);
}

module.exports = { processBatchSms, getPendingCount, parseSmsText, mapCategory };
