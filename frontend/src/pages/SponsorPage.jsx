// SponsorPage.jsx — 후원회 전용 회계 (관리자·회계책임자만)
import { useState, useEffect, useCallback } from 'react';
import { useSocket } from '../hooks/useSocket';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';

const SPONSOR_LIMIT = 26144720;
const DONOR_LIMIT   = 5000000;
const today = new Date().toISOString().split('T')[0];

const S = {
  bg:      '#0a0e1a',
  surface: '#111827',
  surface2:'#1a2236',
  border:  '1px solid #1e2d45',
  accent:  '#1e6bff',
  green:   '#10b981',
  red:     '#ef4444',
  yellow:  '#ffa502',
  purple:  '#7c3aed',
  text:    '#e8edf5',
  sub:     '#8896b3',
  muted:   '#4a5878',
};

const inputStyle = {
  width: '100%', background: S.surface2, border: S.border, borderRadius: 8,
  padding: '9px 12px', color: S.text, fontSize: 13, boxSizing: 'border-box',
  fontFamily: "'Noto Sans KR',sans-serif",
};

function Card({ children, style }) {
  return <div style={{ background: S.surface, border: S.border, borderRadius: 12, padding: 14, ...style }}>{children}</div>;
}
function Badge({ color, children }) {
  return <span style={{ background: color+'22', color, border:`1px solid ${color}55`, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{children}</span>;
}
function FormRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize:11, color:S.sub, marginBottom:4 }}>{label}</div>
      {children}
    </div>
  );
}

function toKorean(n) {
  if (!n || n <= 0) return '';
  const units = ['', '만', '억'];
  let result = '';
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const smallUnits = ['', '십', '백', '천'];
  let num = Math.floor(n);
  let unitIdx = 0;
  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      let part = '';
      for (let i = 3; i >= 0; i--) {
        const d = Math.floor(chunk / Math.pow(10, i)) % 10;
        if (d > 0) part += (d === 1 && i > 0 ? '' : digits[d]) + smallUnits[i];
      }
      result = part + units[unitIdx] + result;
    }
    num = Math.floor(num / 10000);
    unitIdx++;
  }
  return result + '원';
}

function AmountInput({ value, onChange }) {
  return (
    <div>
      <input type="number" value={value||''} onChange={onChange}
        style={inputStyle} placeholder="0" />
      {value > 0 && (
        <div style={{ fontSize:11, color:S.sub, marginTop:3 }}>
          {Number(value).toLocaleString()}원 ({toKorean(Number(value))})
        </div>
      )}
    </div>
  );
}

const TABS = ['대시보드', '미처리SMS', '후원금수입', '지출', '후원자목록'];

export default function SponsorPage() {
  const user = useAuthStore(s => s.user);
  const navigate = useNavigate();
  const isAllowed = ['admin', 'accountant'].includes(user?.role);

  const [tab, setTab] = useState(0);
  const [summary, setSummary] = useState(null);
  const [smsList, setSmsList] = useState([]);
  const [smsInput, setSmsInput] = useState('');
  const [incomeList, setIncomeList] = useState([]);
  const [expenseList, setExpenseList] = useState([]);
  const [donors, setDonors] = useState([]);
  const [modal, setModal] = useState(null);  // 'income' | 'expense' | 'sms_income' | 'sms_expense'
  const [form, setForm] = useState({});
  const [activeSms, setActiveSms] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [sponsorSmsCnt, setSponsorSmsCnt] = useState(0);

  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 3500); };

  // 소켓: 후원회 SMS 실시간 배지
  useSocket({
    onSponsorSmsPending: useCallback(({ count }) => {
      setSponsorSmsCnt(count);
      if (count > 0) toast(`💰 후원회 미처리 SMS ${count}건`);
    }, []),
  });

  // 권한 체크
  useEffect(() => {
    if (!isAllowed) navigate('/', { replace: true });
  }, [isAllowed, navigate]);

  const loadSummary = useCallback(async () => {
    try { const r = await api.get('/sponsor/summary'); setSummary(r.data.data); } catch {}
  }, []);

  const loadSms = useCallback(async () => {
    try {
      const r = await api.get('/sponsor/sms?status=PENDING');
      setSmsList(r.data.data || []);
      setSponsorSmsCnt((r.data.data||[]).length);
    } catch {}
  }, []);

  const loadIncome = useCallback(async () => {
    try { const r = await api.get('/sponsor/income'); setIncomeList(r.data.data || []); } catch {}
  }, []);

  const loadExpense = useCallback(async () => {
    try { const r = await api.get('/sponsor/expense'); setExpenseList(r.data.data || []); } catch {}
  }, []);

  const loadDonors = useCallback(async () => {
    try { const r = await api.get('/sponsor/donors'); setDonors(r.data.data || []); } catch {}
  }, []);

  useEffect(() => { loadSummary(); loadSms(); }, [loadSummary, loadSms]);
  useEffect(() => {
    if (tab === 0) loadSummary();
    if (tab === 1) loadSms();
    if (tab === 2) loadIncome();
    if (tab === 3) loadExpense();
    if (tab === 4) loadDonors();
  }, [tab, loadSummary, loadSms, loadIncome, loadExpense, loadDonors]);

  async function handleSmsPaste() {
    if (!smsInput.trim()) return;
    setLoading(true);
    try {
      const r = await api.post('/sponsor/sms', { text: smsInput });
      toast(`✅ ${r.data.data.saved}건 등록됨`);
      setSmsInput(''); loadSms();
    } catch (e) { toast('❌ ' + (e.response?.data?.message || '실패')); }
    finally { setLoading(false); }
  }

  async function handleSmsProcess(smsId, type) {
    if (!form.amount || !form.date) { toast('❌ 날짜·금액 필수'); return; }
    setLoading(true);
    try {
      await api.patch(`/sponsor/sms/${smsId}/${type}`, form);
      toast('✅ 처리 완료');
      setModal(null); setForm({}); setActiveSms(null);
      loadSms(); loadSummary();
      if (type === 'income') loadIncome();
      if (type === 'expense') loadExpense();
    } catch (e) { toast('❌ ' + (e.response?.data?.message || '처리 실패')); }
    finally { setLoading(false); }
  }

  async function handleManualSave() {
    if (!form.amount || !form.date) { toast('❌ 날짜·금액 필수'); return; }
    setLoading(true);
    try {
      const url = modal === 'income' ? '/sponsor/income' : '/sponsor/expense';
      await api.post(url, form);
      toast('✅ 등록 완료');
      setModal(null); setForm({});
      loadSummary();
      if (modal === 'income') loadIncome();
      if (modal === 'expense') loadExpense();
    } catch (e) { toast('❌ ' + (e.response?.data?.message || '등록 실패')); }
    finally { setLoading(false); }
  }

  if (!isAllowed) return null;

  const usedPct = summary ? Math.min(Math.round((summary.total_income / SPONSOR_LIMIT) * 100), 100) : 0;

  return (
    <div style={{ background: S.bg, minHeight: '100%', padding: '0 0 80px', fontFamily: "'Noto Sans KR',sans-serif", color: S.text }}>
      {/* 헤더 */}
      <div style={{ background: '#0d1117', borderBottom: S.border, padding: '12px 16px', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>💰 후원회 회계</div>
            <div style={{ fontSize: 11, color: S.sub, marginTop: 1 }}>홍성훈 후원회 전용 — 관리자·회계책임자</div>
          </div>
          {sponsorSmsCnt > 0 && (
            <div onClick={() => setTab(1)} style={{ cursor: 'pointer', background: '#2a1a00', border: '1px solid #ffa50244', borderRadius: 10, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: S.red, color: '#fff', borderRadius: 10, fontSize: 11, fontWeight: 900, padding: '2px 7px', animation: 'pulse 1.5s infinite' }}>{sponsorSmsCnt}</span>
              <span style={{ fontSize: 12, color: S.yellow, fontWeight: 700 }}>미처리 SMS</span>
            </div>
          )}
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setTab(i)} style={{
              padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20,
              background: tab === i ? S.purple : S.surface2,
              color: tab === i ? '#fff' : S.sub,
              border: tab === i ? 'none' : S.border,
              cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4
            }}>
              {t}
              {i === 1 && sponsorSmsCnt > 0 && (
                <span style={{ background: S.red, color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 900, padding: '1px 5px' }}>{sponsorSmsCnt}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>

        {/* ── 대시보드 ── */}
        {tab === 0 && summary && (
          <div>
            {/* 한도 게이지 */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 12, color: S.sub }}>모금 현황</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: usedPct >= 90 ? S.red : usedPct >= 70 ? S.yellow : S.purple }}>
                    {summary.total_income.toLocaleString()}원
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: S.sub }}>한도</div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{SPONSOR_LIMIT.toLocaleString()}원</div>
                </div>
              </div>
              <div style={{ background: S.surface2, borderRadius: 4, height: 10, overflow: 'hidden' }}>
                <div style={{ width: `${usedPct}%`, height: '100%', background: usedPct >= 90 ? S.red : usedPct >= 70 ? S.yellow : S.purple, borderRadius: 4, transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: S.sub }}>
                <span>{usedPct}% 사용</span>
                <span>잔여 {summary.remaining.toLocaleString()}원</span>
              </div>
            </Card>

            {/* 수입/지출/잔액 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
              {[
                { label: '총 후원금', val: summary.total_income, color: S.green },
                { label: '총 지출',   val: summary.total_expense, color: S.red },
                { label: '잔 액',     val: summary.balance,       color: summary.balance >= 0 ? S.purple : S.red },
              ].map(({ label, val, color }) => (
                <Card key={label} style={{ textAlign: 'center', padding: '10px 8px' }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color }}>{val.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: S.sub, marginTop: 2 }}>{label}</div>
                </Card>
              ))}
            </div>

            {/* 미처리 SMS 배너 */}
            {summary.pending_sms > 0 && (
              <div onClick={() => setTab(1)} style={{ cursor: 'pointer', background: '#2a1500', border: '1px solid #ffa50244', borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ background: S.yellow, color: '#000', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, flexShrink: 0 }}>
                  {summary.pending_sms}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.yellow }}>미처리 후원회 SMS {summary.pending_sms}건</div>
                  <div style={{ fontSize: 11, color: S.sub }}>탭하여 처리하기 →</div>
                </div>
              </div>
            )}

            {/* 상위 후원자 */}
            {summary.top_donors?.length > 0 && (
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>🏆 상위 후원자</div>
                {summary.top_donors.map((d, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: i < summary.top_donors.length-1 ? S.border : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: i === 0 ? S.yellow : S.sub }}>{i+1}</span>
                      <span style={{ fontSize: 13 }}>{d.donor_name}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: S.purple }}>{Number(d.total).toLocaleString()}원</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}

        {/* ── 미처리 SMS ── */}
        {tab === 1 && (
          <div>
            {/* SMS 붙여넣기 */}
            <Card style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>📱 후원회 통장 SMS 붙여넣기</div>
              <textarea value={smsInput} onChange={e => setSmsInput(e.target.value)}
                placeholder={'예)\n[국민] 홍길동 입금 500,000원 잔액 1,500,000원 03/15\n[국민] 선거회계계좌 이체 200,000원 잔액 1,300,000원 03/16'}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }}
              />
              <button onClick={handleSmsPaste} disabled={loading||!smsInput.trim()} style={{
                width: '100%', marginTop: 8, padding: '10px 0', background: S.purple, color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: loading||!smsInput.trim() ? 0.5 : 1
              }}>파싱 저장</button>
            </Card>

            {/* 미처리 목록 */}
            <div style={{ fontSize: 12, fontWeight: 700, color: S.sub, marginBottom: 8 }}>
              미처리 SMS ({smsList.length}건)
            </div>
            {smsList.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 60, fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>미처리 SMS가 없습니다
              </div>
            ) : smsList.map(sms => (
              <Card key={sms.id} style={{ marginBottom: 10, border: '1px solid #7c3aed33' }}>
                <div style={{ fontSize: 11, color: S.sub, lineHeight: 1.6, marginBottom: 8, wordBreak: 'break-all' }}>
                  <span style={{ background: '#7c3aed22', color: S.purple, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, marginRight: 6 }}>💰 후원회</span>
                  {sms.raw_text}
                </div>
                {sms.parsed_amount > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Badge color={S.purple}>{Number(sms.parsed_amount).toLocaleString()}원</Badge>
                    {sms.parsed_sender && <Badge color={S.sub}>{sms.parsed_sender}</Badge>}
                    {sms.sms_type !== 'unknown' && <Badge color={sms.sms_type==='income'?S.green:S.red}>{sms.sms_type==='income'?'입금':'출금'}</Badge>}
                  </div>
                )}
                <div style={{ fontSize: 10, color: S.muted, marginBottom: 8 }}>
                  {sms.received_at ? new Date(sms.received_at).toLocaleString('ko-KR') : ''} · {sms.source}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => {
                    setActiveSms(sms);
                    setModal('sms_income');
                    setForm({
                      date: today,
                      amount: sms.parsed_amount || '',
                      donor_name: sms.parsed_sender || '',
                      income_type: 'named',
                    });
                  }} style={{ flex: 1, padding: '7px 0', background: S.green, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    💰 후원금 입금
                  </button>
                  <button onClick={() => {
                    setActiveSms(sms);
                    setModal('sms_expense');
                    setForm({
                      date: today,
                      amount: sms.parsed_amount || '',
                      category: '선거자금이체',
                      transfer_purpose: '선거자금이체',
                    });
                  }} style={{ flex: 1, padding: '7px 0', background: S.red, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    📤 선거계좌 이체
                  </button>
                  <button onClick={async () => {
                    await api.patch(`/sponsor/sms/${sms.id}/skip`, { reason: '수동 무시' });
                    loadSms(); toast('🚫 무시됨');
                  }} style={{ padding: '7px 12px', background: S.surface2, color: S.sub, border: S.border, borderRadius: 8, fontSize: 12, cursor: 'pointer' }}>무시</button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 후원금 수입 ── */}
        {tab === 2 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>후원금 수입 ({incomeList.length}건)</div>
              <button onClick={() => { setModal('income'); setForm({ date: today, income_type: 'named' }); }} style={{
                padding: '7px 14px', background: S.purple, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>+ 수동 등록</button>
            </div>
            {incomeList.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 50, fontSize: 13 }}>등록된 후원금이 없습니다</div>
            ) : incomeList.map(r => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{r.donor_name || '익명'}</span>
                      <Badge color={r.source==='sms'?S.purple:S.sub}>{r.source==='sms'?'SMS':'수동'}</Badge>
                      <span style={{ fontSize: 11, color: S.muted }}>{r.receipt_no}</span>
                    </div>
                    <div style={{ fontSize: 11, color: S.sub }}>{r.date} · {r.bank_name||''} {r.account_no||''} {r.donor_phone||''}</div>
                    {r.note && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{r.note}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: S.green }}>+{Number(r.amount).toLocaleString()}원</div>
                    <button onClick={async () => {
                      if (!window.confirm('삭제하시겠습니까?')) return;
                      await api.delete(`/sponsor/income/${r.id}`);
                      loadIncome(); loadSummary(); toast('🗑️ 삭제됨');
                    }} style={{ fontSize: 10, color: S.muted, background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>삭제</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 지출 ── */}
        {tab === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>지출 ({expenseList.length}건)</div>
              <button onClick={() => { setModal('expense'); setForm({ date: today, category: '선거자금이체', transfer_purpose: '선거자금이체' }); }} style={{
                padding: '7px 14px', background: S.red, color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>+ 이체 등록</button>
            </div>
            <Card style={{ marginBottom: 12, background: '#0d1a0d', border: '1px solid #10b98122' }}>
              <div style={{ fontSize: 11, color: S.green }}>
                ⚠️ 후원회 지출은 <strong>선거사무실 회계 통장으로의 이체만</strong> 가능합니다 (정치자금법)
              </div>
            </Card>
            {expenseList.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 50, fontSize: 13 }}>등록된 지출이 없습니다</div>
            ) : expenseList.map(r => (
              <Card key={r.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{r.transfer_purpose || r.category}</span>
                      <Badge color={r.source==='sms'?S.purple:S.sub}>{r.source==='sms'?'SMS':'수동'}</Badge>
                      <span style={{ fontSize: 11, color: S.muted }}>{r.receipt_no}</span>
                    </div>
                    <div style={{ fontSize: 11, color: S.sub }}>{r.date} · {r.destination_account || '계좌 미입력'}</div>
                    {r.note && <div style={{ fontSize: 11, color: S.muted, marginTop: 2 }}>{r.note}</div>}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: S.red }}>-{Number(r.amount).toLocaleString()}원</div>
                    <button onClick={async () => {
                      if (!window.confirm('삭제하시겠습니까?')) return;
                      await api.delete(`/sponsor/expense/${r.id}`);
                      loadExpense(); loadSummary(); toast('🗑️ 삭제됨');
                    }} style={{ fontSize: 10, color: S.muted, background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 }}>삭제</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 후원자 목록 ── */}
        {tab === 4 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>후원자 목록 ({donors.length}명)</div>
            {donors.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 50, fontSize: 13 }}>등록된 후원자가 없습니다</div>
            ) : donors.map((d, i) => {
              const pct = Math.round((Number(d.total) / DONOR_LIMIT) * 100);
              const overLimit = Number(d.total) > DONOR_LIMIT;
              return (
                <Card key={i} style={{ marginBottom: 8, border: overLimit ? `1px solid ${S.red}88` : S.border }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{d.donor_name}</div>
                      <div style={{ fontSize: 11, color: S.sub }}>{d.donor_phone||''} {d.bank_name ? `· ${d.bank_name}` : ''}</div>
                      <div style={{ fontSize: 11, color: S.muted, marginTop: 1 }}>
                        {d.cnt}회 입금 · {d.first_date} ~ {d.last_date}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: overLimit ? S.red : S.purple }}>
                        {Number(d.total).toLocaleString()}원
                      </div>
                      {overLimit && <Badge color={S.red}>한도초과</Badge>}
                    </div>
                  </div>
                  <div style={{ background: S.surface2, borderRadius: 4, height: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: overLimit ? S.red : pct >= 80 ? S.yellow : S.purple, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 10, color: S.muted, marginTop: 3 }}>
                    1인 한도 대비 {pct}% ({DONOR_LIMIT.toLocaleString()}원)
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SMS 수입 처리 모달 ── */}
      {(modal === 'sms_income' || modal === 'income') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && (setModal(null), setForm({}), setActiveSms(null))}>
          <div style={{ background: S.surface, borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 600, margin: '0 auto', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: S.green, marginBottom: 16 }}>
              💰 {modal === 'sms_income' ? 'SMS → 후원금 수입 등록' : '후원금 수입 수동 등록'}
            </div>
            {activeSms && (
              <div style={{ background: S.surface2, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: S.sub, marginBottom: 12, wordBreak: 'break-all' }}>{activeSms.raw_text}</div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f=>({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
              <FormRow label="금액(원)"><AmountInput value={form.amount} onChange={e => setForm(f=>({...f,amount:parseInt(e.target.value)||0}))} /></FormRow>
              <FormRow label="후원자 성명">
                <input type="text" value={form.donor_name||''} onChange={e => setForm(f=>({...f,donor_name:e.target.value}))} style={inputStyle} placeholder="홍길동" />
              </FormRow>
              <FormRow label="연락처"><input type="text" value={form.donor_phone||''} onChange={e => setForm(f=>({...f,donor_phone:e.target.value}))} style={inputStyle} placeholder="010-0000-0000" /></FormRow>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><FormRow label="은행"><input type="text" value={form.bank_name||''} onChange={e => setForm(f=>({...f,bank_name:e.target.value}))} style={inputStyle} placeholder="국민은행" /></FormRow></div>
                <div style={{ flex: 2 }}><FormRow label="계좌번호"><input type="text" value={form.account_no||''} onChange={e => setForm(f=>({...f,account_no:e.target.value}))} style={inputStyle} /></FormRow></div>
              </div>
              <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f=>({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setModal(null); setForm({}); setActiveSms(null); }} style={{ flex: 1, padding: '11px 0', background: S.surface2, color: S.sub, border: S.border, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>취소</button>
              <button disabled={loading} onClick={() => modal === 'sms_income' ? handleSmsProcess(activeSms.id, 'income') : handleManualSave()} style={{ flex: 2, padding: '11px 0', background: S.green, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: loading?0.5:1 }}>
                {loading ? '처리 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SMS 지출 처리 / 수동 지출 모달 ── */}
      {(modal === 'sms_expense' || modal === 'expense') && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && (setModal(null), setForm({}), setActiveSms(null))}>
          <div style={{ background: S.surface, borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 600, margin: '0 auto', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: S.red, marginBottom: 16 }}>
              📤 {modal === 'sms_expense' ? 'SMS → 선거계좌 이체 등록' : '이체 수동 등록'}
            </div>
            {activeSms && (
              <div style={{ background: S.surface2, borderRadius: 8, padding: '8px 12px', fontSize: 11, color: S.sub, marginBottom: 12, wordBreak: 'break-all' }}>{activeSms.raw_text}</div>
            )}
            <div style={{ background: '#0d1a0d', border: '1px solid #10b98122', borderRadius: 8, padding: '8px 12px', fontSize: 11, color: S.green, marginBottom: 12 }}>
              ⚠️ 후원회 지출은 선거사무실 회계 통장으로의 이체만 허용됩니다
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f=>({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
              <FormRow label="이체 금액(원)"><AmountInput value={form.amount} onChange={e => setForm(f=>({...f,amount:parseInt(e.target.value)||0}))} /></FormRow>
              <FormRow label="이체 목적">
                <select value={form.transfer_purpose||'선거자금이체'} onChange={e => setForm(f=>({...f,transfer_purpose:e.target.value, category:e.target.value}))} style={inputStyle}>
                  <option value="선거자금이체">선거자금이체 (선거회계 통장)</option>
                  <option value="후원회운영비">후원회 운영비</option>
                  <option value="한도초과반환">한도 초과 반환</option>
                  <option value="기탁금">선관위 기탁금</option>
                </select>
              </FormRow>
              <FormRow label="수신 계좌 (선거사무소 회계 통장)">
                <input type="text" value={form.destination_account||''} onChange={e => setForm(f=>({...f,destination_account:e.target.value}))} style={inputStyle} placeholder="은행명 계좌번호" />
              </FormRow>
              <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f=>({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setModal(null); setForm({}); setActiveSms(null); }} style={{ flex: 1, padding: '11px 0', background: S.surface2, color: S.sub, border: S.border, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>취소</button>
              <button disabled={loading} onClick={() => modal === 'sms_expense' ? handleSmsProcess(activeSms.id, 'expense') : handleManualSave()} style={{ flex: 2, padding: '11px 0', background: S.red, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: loading?0.5:1 }}>
                {loading ? '처리 중...' : '등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {msg && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', background: '#1a2236', border: S.border, borderRadius: 10, padding: '10px 20px', fontSize: 13, color: S.text, zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
          {msg}
        </div>
      )}
    </div>
  );
}
