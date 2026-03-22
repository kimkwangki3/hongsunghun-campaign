import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';

const LIMIT = 52289440;
const S = {
  bg:      '#0a0e1a',
  surface: '#111827',
  surface2:'#1a2236',
  border:  '1px solid #1e2d45',
  accent:  '#1e6bff',
  green:   '#10b981',
  red:     '#ef4444',
  yellow:  '#ffa502',
  text:    '#e8edf5',
  sub:     '#8896b3',
  muted:   '#4a5878',
};

function Badge({ color, children }) {
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}55`,
      borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700
    }}>{children}</span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: S.surface, border: S.border, borderRadius: 12, padding: 16, ...style }}>
      {children}
    </div>
  );
}

function GaugeBar({ pct, color = S.accent, warn = 80, danger = 95 }) {
  const c = pct >= danger ? S.red : pct >= warn ? S.yellow : color;
  return (
    <div style={{ background: S.surface2, borderRadius: 4, height: 8, overflow: 'hidden', margin: '8px 0' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: c, borderRadius: 4, transition: 'width 0.4s' }} />
    </div>
  );
}

const TABS = ['대시보드', '수입/지출', 'SMS', '후원회', '수당'];
const ACCT_TABS = ['대시보드', '수입/지출']; // 일반 사용자용

export default function AccountingPage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const isAccountant = ['admin', 'accountant'].includes(user?.role);
  const tabs = isAccountant ? TABS : ACCT_TABS;

  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [txFilter, setTxFilter] = useState({ type: '', cost_type: '' });
  const [smsList, setSmsList] = useState([]);
  const [smsInput, setSmsInput] = useState('');
  const [sponsorIncome, setSponsorIncome] = useState([]);
  const [sponsorExpense, setSponsorExpense] = useState([]);
  const [staff, setStaff] = useState([]);
  const [modal, setModal] = useState(null); // { type: 'tx'|'sponsor_income'|'sponsor_expense'|'staff' }
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const loadSummary = useCallback(async () => {
    try { const r = await api.get('/accounting/summary'); setSummary(r.data.data); } catch {}
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (txFilter.type) params.set('type', txFilter.type);
      if (txFilter.cost_type) params.set('cost_type', txFilter.cost_type);
      const r = await api.get(`/accounting/transactions?${params}`);
      setTransactions(r.data.data || []);
    } catch {}
  }, [txFilter]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    if (tab === 0) loadSummary();
    if (tab === 1) loadTransactions();
    if (tab === 2 && isAccountant) api.get('/accounting/sms?status=PENDING').then(r => setSmsList(r.data.data || [])).catch(() => {});
    if (tab === 3 && isAccountant) {
      api.get('/accounting/sponsor/income').then(r => setSponsorIncome(r.data.data || [])).catch(() => {});
      api.get('/accounting/sponsor/expense').then(r => setSponsorExpense(r.data.data || [])).catch(() => {});
    }
    if (tab === 4 && isAccountant) api.get('/accounting/staff').then(r => setStaff(r.data.data || [])).catch(() => {});
  }, [tab, isAccountant, loadSummary, loadTransactions]);

  async function handleSmsParse() {
    const lines = smsInput.split('\n').filter(l => l.trim());
    if (!lines.length) return;
    setLoading(true);
    try {
      const r = await api.post('/accounting/sms/upload', { texts: lines });
      toast(`✅ 신규 ${r.data.data.summary.new}건 / 중복 ${r.data.data.summary.duplicate}건`);
      setSmsInput('');
      api.get('/accounting/sms?status=PENDING').then(r => setSmsList(r.data.data || []));
    } catch { toast('❌ SMS 파싱 실패'); } finally { setLoading(false); }
  }

  async function approveSms(sms) {
    try {
      await api.post(`/accounting/sms/${sms.id}/approve`, {
        date: sms.date || new Date().toISOString().split('T')[0],
        amount: sms.amount, type: sms.type === 'income' ? 'income' : 'expense',
        cost_type: sms.cost_type || 'election_cost',
        category: sms.category, reimbursable: sms.reimbursable ?? true,
        description: sms.counterpart || sms.raw_text.substring(0, 40),
      });
      setSmsList(prev => prev.filter(s => s.id !== sms.id));
      loadSummary();
      toast('✅ 승인됨');
    } catch { toast('❌ 승인 실패'); }
  }

  async function skipSms(id) {
    try {
      await api.post(`/accounting/sms/${id}/skip`, { reason: '수동 건너뜀' });
      setSmsList(prev => prev.filter(s => s.id !== id));
    } catch {}
  }

  async function submitForm() {
    setLoading(true);
    try {
      let url = '', method = 'post';
      if (modal === 'tx') url = '/accounting/transactions';
      else if (modal === 'sponsor_income') url = '/accounting/sponsor/income';
      else if (modal === 'sponsor_expense') url = '/accounting/sponsor/expense';
      else if (modal === 'staff') url = '/accounting/staff';
      await api[method](url, form);
      toast('✅ 등록 완료');
      setModal(null); setForm({});
      if (modal === 'tx') { loadTransactions(); loadSummary(); }
      if (modal === 'sponsor_income' || modal === 'sponsor_expense') {
        api.get('/accounting/sponsor/income').then(r => setSponsorIncome(r.data.data || []));
        api.get('/accounting/sponsor/expense').then(r => setSponsorExpense(r.data.data || []));
        loadSummary();
      }
      if (modal === 'staff') api.get('/accounting/staff').then(r => setStaff(r.data.data || []));
    } catch (e) { toast(`❌ ${e.response?.data?.message || '등록 실패'}`); } finally { setLoading(false); }
  }

  async function deleteTx(id) {
    if (!confirm('삭제할까요?')) return;
    try { await api.delete(`/accounting/transactions/${id}`); loadTransactions(); loadSummary(); toast('삭제됨'); } catch {}
  }

  const today = new Date().toISOString().split('T')[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: S.bg, fontFamily: "'Noto Sans KR',sans-serif", color: S.text }}>

      {/* 헤더 */}
      <div style={{ background: S.surface, borderBottom: S.border, padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>선거 회계 관리</div>
              <div style={{ fontSize: 10, color: S.sub }}>순천시 제7선거구 · 제한액 {LIMIT.toLocaleString()}원</div>
            </div>
          </div>
          {isAccountant && (
            <button onClick={() => { setModal('tx'); setForm({ date: today, type: 'expense', cost_type: 'election_cost' }); }} style={{
              background: S.accent, color: '#fff', border: 'none', borderRadius: 8,
              padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
            }}>+ 등록</button>
          )}
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20,
              background: tab === i ? S.accent : S.surface2,
              color: tab === i ? '#fff' : S.sub,
              border: tab === i ? 'none' : S.border,
              cursor: 'pointer', whiteSpace: 'nowrap'
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>

        {/* ── 대시보드 ── */}
        {tab === 0 && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* 선거비용 게이지 */}
            <Card>
              <div style={{ fontSize: 12, color: S.sub, marginBottom: 4 }}>선거비용 사용 현황</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: summary.over_limit ? S.red : S.text }}>
                  {summary.election_cost.toLocaleString()}원
                </span>
                <span style={{ fontSize: 12, color: S.sub }}>/ {LIMIT.toLocaleString()}원</span>
              </div>
              <GaugeBar pct={summary.used_pct} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: summary.over_limit ? S.red : S.green }}>
                  {summary.over_limit ? '⛔ 제한액 초과!' : `잔여 ${summary.remaining.toLocaleString()}원`}
                </span>
                <span style={{ color: S.sub }}>{summary.used_pct}% 사용</span>
              </div>
            </Card>

            {/* 수입/지출 요약 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Card>
                <div style={{ fontSize: 11, color: S.sub }}>총 수입</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: S.green, marginTop: 4 }}>
                  {summary.income.toLocaleString()}원
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: 11, color: S.sub }}>총 지출</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: S.red, marginTop: 4 }}>
                  {summary.expense.toLocaleString()}원
                </div>
              </Card>
            </div>

            {/* 잔액 */}
            <Card style={{ background: summary.balance >= 0 ? '#0d2a1a' : '#2a0d0d', borderColor: summary.balance >= 0 ? '#10b98144' : '#ef444444' }}>
              <div style={{ fontSize: 11, color: S.sub }}>잔액</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: summary.balance >= 0 ? S.green : S.red, marginTop: 4 }}>
                {summary.balance.toLocaleString()}원
              </div>
            </Card>

            {/* 후원회 */}
            {isAccountant && (
              <Card>
                <div style={{ fontSize: 12, color: S.sub, marginBottom: 4 }}>후원회 모금 현황</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{summary.sponsor_income.toLocaleString()}원</span>
                  <span style={{ fontSize: 11, color: S.sub }}>/ {summary.sponsor_limit.toLocaleString()}원</span>
                </div>
                <GaugeBar pct={summary.sponsor_pct} warn={80} danger={95} />
                <div style={{ fontSize: 11, color: S.sub }}>{summary.sponsor_pct}% 사용</div>
              </Card>
            )}

            {/* SMS 미처리 */}
            {isAccountant && summary.pending_sms > 0 && (
              <div onClick={() => setTab(2)} style={{
                background: '#2a1a0d', border: '1px solid #ffa50244', borderRadius: 12,
                padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10
              }}>
                <span style={{ fontSize: 20 }}>📩</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.yellow }}>SMS {summary.pending_sms}건 미처리</div>
                  <div style={{ fontSize: 11, color: S.sub }}>탭하여 처리하기</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 수입/지출 목록 ── */}
        {tab === 1 && (
          <div>
            {/* 필터 */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {[['', '전체'], ['income', '수입'], ['expense', '지출']].map(([v, l]) => (
                <button key={v} onClick={() => setTxFilter(f => ({ ...f, type: v }))} style={{
                  padding: '5px 12px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                  background: txFilter.type === v ? S.accent : S.surface2,
                  color: txFilter.type === v ? '#fff' : S.sub, border: S.border
                }}>{l}</button>
              ))}
              {[['', '전체'], ['election_cost', '선거비용'], ['non_election_cost', '비선거비용']].map(([v, l]) => (
                <button key={v} onClick={() => setTxFilter(f => ({ ...f, cost_type: v }))} style={{
                  padding: '5px 12px', fontSize: 11, borderRadius: 20, cursor: 'pointer',
                  background: txFilter.cost_type === v ? '#7c3aed' : S.surface2,
                  color: txFilter.cost_type === v ? '#fff' : S.sub, border: S.border
                }}>{l}</button>
              ))}
            </div>

            {transactions.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 40, fontSize: 13 }}>등록된 거래가 없습니다</div>
            ) : transactions.map(tx => (
              <div key={tx.id} style={{
                background: S.surface, border: S.border, borderRadius: 10,
                padding: '12px 14px', marginBottom: 8,
                borderLeft: `3px solid ${tx.type === 'income' ? S.green : S.red}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{tx.description || tx.category || '-'}</span>
                      {tx.receipt_no && <Badge color={S.muted}>{tx.receipt_no}</Badge>}
                      {tx.reimbursable && <Badge color={S.green}>보전</Badge>}
                    </div>
                    <div style={{ fontSize: 11, color: S.sub, marginTop: 3 }}>
                      {tx.date} · {tx.category} · {tx.created_by_name || '-'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: tx.type === 'income' ? S.green : S.red }}>
                      {tx.type === 'income' ? '+' : '-'}{tx.amount.toLocaleString()}원
                    </div>
                    {isAccountant && (
                      <button onClick={() => deleteTx(tx.id)} style={{
                        fontSize: 10, color: S.muted, background: 'none', border: 'none',
                        cursor: 'pointer', marginTop: 4, padding: 0
                      }}>삭제</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── SMS 파싱 (회계담당+관리자) ── */}
        {tab === 2 && isAccountant && (
          <div>
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📱 SMS 붙여넣기</div>
              <textarea
                value={smsInput}
                onChange={e => setSmsInput(e.target.value)}
                placeholder={'[국민] 홍길동 입금 50,000원 잔액 1,234,567 12/25 14:30\n여러 건을 줄바꿈으로 구분하세요'}
                style={{
                  width: '100%', background: S.surface2, border: S.border, borderRadius: 8,
                  padding: 10, color: S.text, fontSize: 12, resize: 'vertical', minHeight: 100,
                  fontFamily: "'Noto Sans KR',sans-serif", boxSizing: 'border-box'
                }}
              />
              <button onClick={handleSmsParse} disabled={loading || !smsInput.trim()} style={{
                width: '100%', marginTop: 8, padding: '10px 0', background: S.accent, color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: loading || !smsInput.trim() ? 0.5 : 1
              }}>파싱 실행</button>
            </Card>

            <div style={{ fontSize: 12, fontWeight: 700, color: S.sub, marginBottom: 8 }}>
              미처리 SMS ({smsList.length}건)
            </div>
            {smsList.map(sms => (
              <Card key={sms.id} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: S.sub, marginBottom: 6, lineHeight: 1.5 }}>
                  {sms.raw_text?.substring(0, 80)}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {sms.amount > 0 && <Badge color={S.green}>{sms.amount?.toLocaleString()}원</Badge>}
                  {sms.type && <Badge color={sms.type === 'income' ? S.green : S.red}>{sms.type === 'income' ? '입금' : '출금'}</Badge>}
                  {sms.category && <Badge color={S.accent}>{sms.category}</Badge>}
                  {sms.date && <Badge color={S.muted}>{sms.date}</Badge>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => approveSms(sms)} style={{
                    flex: 1, padding: '7px 0', background: S.green, color: '#fff',
                    border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer'
                  }}>✅ 승인</button>
                  <button onClick={() => skipSms(sms.id)} style={{
                    padding: '7px 14px', background: S.surface2, color: S.sub,
                    border: S.border, borderRadius: 8, fontSize: 12, cursor: 'pointer'
                  }}>건너뜀</button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 후원회 (회계담당+관리자) ── */}
        {tab === 3 && isAccountant && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => { setModal('sponsor_income'); setForm({ date: today, income_type: 'named' }); }} style={{
                flex: 1, padding: '9px 0', background: S.green, color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer'
              }}>+ 후원금 수입</button>
              <button onClick={() => { setModal('sponsor_expense'); setForm({ date: today }); }} style={{
                flex: 1, padding: '9px 0', background: S.red, color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: 'pointer'
              }}>+ 후원회 지출</button>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: S.sub, marginBottom: 8 }}>후원금 수입</div>
            {sponsorIncome.map(r => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.donor_name || '익명'}</div>
                    <div style={{ fontSize: 11, color: S.sub }}>{r.date}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: S.green }}>+{r.amount.toLocaleString()}원</div>
                </div>
              </Card>
            ))}

            <div style={{ fontSize: 12, fontWeight: 700, color: S.sub, margin: '16px 0 8px' }}>후원회 지출</div>
            {sponsorExpense.map(r => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.category}</div>
                    <div style={{ fontSize: 11, color: S.sub }}>{r.date} {r.note && `· ${r.note}`}</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: S.red }}>-{r.amount.toLocaleString()}원</div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 수당 (회계담당+관리자) ── */}
        {tab === 4 && isAccountant && (
          <div>
            <button onClick={() => { setModal('staff'); setForm({ payment_date: today, staff_role: 'worker', meal_provided: 0, transport_deduction: 0 }); }} style={{
              width: '100%', padding: '10px 0', background: S.accent, color: '#fff',
              border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', marginBottom: 12
            }}>+ 수당 등록</button>

            {staff.map(s => (
              <Card key={s.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{s.staff_name}</div>
                    <div style={{ fontSize: 11, color: S.sub }}>{s.payment_date} · {
                      s.staff_role === 'manager' ? '선거사무장' :
                      s.staff_role === 'accountant' ? '회계책임자' :
                      s.staff_role === 'branch_manager' ? '선거연락소장' : '선거사무원'
                    }</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: S.accent }}>
                    {s.total_actual?.toLocaleString()}원
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── 등록 모달 ── */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
          display: 'flex', alignItems: 'flex-end', zIndex: 1000
        }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{
            background: S.surface, borderRadius: '16px 16px 0 0', padding: 20,
            width: '100%', maxWidth: 600, margin: '0 auto',
            maxHeight: '80vh', overflowY: 'auto'
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>
              {modal === 'tx' ? '수입/지출 등록' :
               modal === 'sponsor_income' ? '후원금 수입 등록' :
               modal === 'sponsor_expense' ? '후원회 지출 등록' : '수당 등록'}
            </div>

            {/* 수입/지출 폼 */}
            {modal === 'tx' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="구분">
                  <select value={form.type||'expense'} onChange={e => setForm(f => ({...f,type:e.target.value}))} style={inputStyle}>
                    <option value="expense">지출</option>
                    <option value="income">수입</option>
                  </select>
                </FormRow>
                <FormRow label="비용구분">
                  <select value={form.cost_type||''} onChange={e => setForm(f => ({...f,cost_type:e.target.value}))} style={inputStyle}>
                    <option value="election_cost">선거비용 (보전 가능)</option>
                    <option value="non_election_cost">비선거비용</option>
                  </select>
                </FormRow>
                <FormRow label="과목">
                  <select value={form.category||''} onChange={e => setForm(f => ({...f,category:e.target.value}))} style={inputStyle}>
                    <option value="">선택</option>
                    {['홍보물제작비','광고비','식비','다과음료비','차량운행비','통신비','선거사무관계자수당','사무용품비','사무소임차료','사무소유지비','기탁금','기타'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="금액"><input type="number" placeholder="원" value={form.amount||''} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="내용"><input type="text" placeholder="거래처/설명" value={form.description||''} onChange={e => setForm(f => ({...f,description:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
              </div>
            )}

            {/* 후원금 수입 폼 */}
            {modal === 'sponsor_income' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="금액"><input type="number" placeholder="원" value={form.amount||''} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="기부자명"><input type="text" value={form.donor_name||''} onChange={e => setForm(f => ({...f,donor_name:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="연락처"><input type="text" value={form.donor_phone||''} onChange={e => setForm(f => ({...f,donor_phone:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
              </div>
            )}

            {/* 후원회 지출 폼 */}
            {modal === 'sponsor_expense' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="과목">
                  <select value={form.category||''} onChange={e => setForm(f => ({...f,category:e.target.value}))} style={inputStyle}>
                    <option value="">선택</option>
                    {['기부금','후원금모금경비','인건비','사무소설치운영비','기타경비'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="금액"><input type="number" placeholder="원" value={form.amount||''} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
              </div>
            )}

            {/* 수당 폼 */}
            {modal === 'staff' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormRow label="날짜"><input type="date" value={form.payment_date||''} onChange={e => setForm(f => ({...f,payment_date:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="직책">
                  <select value={form.staff_role||'worker'} onChange={e => setForm(f => ({...f,staff_role:e.target.value}))} style={inputStyle}>
                    <option value="manager">선거사무장 (상한 10만원)</option>
                    <option value="branch_manager">선거연락소장 (상한 10만원)</option>
                    <option value="accountant">회계책임자 (상한 10만원)</option>
                    <option value="worker">선거사무원 (상한 6만원)</option>
                  </select>
                </FormRow>
                <FormRow label="성명"><input type="text" value={form.staff_name||''} onChange={e => setForm(f => ({...f,staff_name:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="수당"><input type="number" placeholder="원" value={form.allowance||''} onChange={e => setForm(f => ({...f,allowance:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="식사제공"><input type="number" min="0" max="3" placeholder="0~3회" value={form.meal_provided||0} onChange={e => setForm(f => ({...f,meal_provided:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="교통공제"><input type="number" placeholder="원" value={form.transport_deduction||0} onChange={e => setForm(f => ({...f,transport_deduction:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <div style={{ fontSize: 11, color: S.sub, background: S.surface2, borderRadius: 8, padding: 10 }}>
                  예상 합계: {((form.allowance||0) + 20000 - (form.transport_deduction||0) + Math.max(0, 25000 - (form.meal_provided||0)*8330)).toLocaleString()}원
                  <div style={{ marginTop: 4 }}>일비 20,000 + 식비 {Math.max(0, 25000 - (form.meal_provided||0)*8330).toLocaleString()}원</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setModal(null); setForm({}); }} style={{
                flex: 1, padding: '11px 0', background: S.surface2, color: S.sub,
                border: S.border, borderRadius: 10, fontSize: 13, cursor: 'pointer'
              }}>취소</button>
              <button onClick={submitForm} disabled={loading} style={{
                flex: 2, padding: '11px 0', background: S.accent, color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: loading ? 0.5 : 1
              }}>등록</button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {msg && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          background: '#1a2236', border: S.border, borderRadius: 10,
          padding: '10px 20px', fontSize: 13, color: S.text, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>{msg}</div>
      )}
    </div>
  );
}

const inputStyle = {
  width: '100%', background: '#1a2236', border: '1px solid #1e2d45',
  borderRadius: 8, padding: '9px 12px', color: '#e8edf5',
  fontSize: 13, fontFamily: "'Noto Sans KR',sans-serif", outline: 'none', boxSizing: 'border-box'
};

function FormRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8896b3', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
