import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../hooks/useSocket';
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

const TABS = ['대시보드', '수입/지출', '미처리영수증', 'SMS', '후원회', '수당', '영수증', '비품관리'];
const ACCT_TABS = ['대시보드', '수입/지출']; // 일반 사용자용

// ── 선관위 양식 과목 체계 ──────────────────────────────
// 수입 과목 (계정과목)
const INCOME_CATEGORIES = ['자기부담금', '차입금', '정당지원금', '기탁금반환금', '기타수입'];

// 지출 계정과목 (대분류) → 세목 (소분류) 매핑
// 비선거비용 계정 → cost_type 자동 non_election_cost
const EXPENSE_ACCOUNTS = {
  '선전비':           ['인쇄물제작비(홍보물)', '현수막·포스터제작비', '신문광고비', '방송광고비', '인터넷·SNS광고비', '선거공보제작비'],
  '사무소설치유지비':  ['사무소임차료', '집기·비품비', '수도광열비', '사무용품비', '기타사무소비'],
  '인건비·수당':      ['선거사무원수당', '선거사무장수당', '선거연락소장수당', '회계책임자수당'],
  '실비':             ['일비', '식비', '교통비'],
  '통신비':           ['전화·인터넷비', '우편비'],
  '차량비':           ['차량유류비', '차량임차료', '차량수리비'],
  '집회비':           ['다과·음료비', '행사진행비'],
  '기탁금':           ['선관위기탁금'],
  '비선거비용':       ['정치활동비', '기타비선거비용'],  // ← 이 계정은 non_election_cost 자동
};
// 비선거비용 계정과목 목록
const NON_ELECTION_ACCOUNTS = new Set(['비선거비용']);

const ASSET_LOCATIONS = ['선거사무소 본소', '선거연락소 1', '선거연락소 2', '선거연락소 3', '기타'];

export default function AccountingPage() {
  const user = useAuthStore(s => s.user);

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
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [dlFrom, setDlFrom] = useState('');
  const [dlTo, setDlTo] = useState('');
  const [dlLoading, setDlLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [recentReceipts, setRecentReceipts] = useState([]);
  const fileInputRef = useRef(null);
  const [modalReceiptFile, setModalReceiptFile] = useState(null);
  const [modalReceiptPreview, setModalReceiptPreview] = useState(null);
  const modalReceiptRef = useRef(null);
  const [modalReceiptUrl, setModalReceiptUrl] = useState(null);
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [uploadNote, setUploadNote] = useState('');
  const [assets, setAssets] = useState([]);
  const [stickerTarget, setStickerTarget] = useState(null); // 스티커 인쇄 대상
  const [allReceipts, setAllReceipts] = useState([]);
  const [assetReceiptSearch, setAssetReceiptSearch] = useState('');
  const [assetReceiptOpen, setAssetReceiptOpen] = useState(false);
  const [pendingSmsCnt, setPendingSmsCnt] = useState(0);
  const [pendingSmsRows, setPendingSmsRows] = useState([]);
  const [pendingSubTab, setPendingSubTab] = useState('receipt'); // 'receipt' | 'sms'
  const [postSaveTx, setPostSaveTx] = useState(null); // 비품등록 유도용 저장된 거래

  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  // ── 소켓: 미처리 SMS 실시간 배지 업데이트 ──────────────
  useSocket({
    onSmsPendingUpdate: useCallback(({ count }) => {
      setPendingSmsCnt(count);
      if (count > 0) toast(`📱 미처리 SMS ${count}건`);
    }, []),
  });

  // ── 미처리 SMS 목록 로드 ──────────────────────────────
  const loadPendingSms = useCallback(async () => {
    if (!isAccountant) return;
    try {
      const r = await api.get('/accounting/sms/pending');
      const rows = r.data.data || [];
      setPendingSmsRows(rows);
      setPendingSmsCnt(rows.length);
    } catch { /* 권한없으면 무시 */ }
  }, [isAccountant]);

  async function handleSheetsSync() {
    setSyncLoading(true);
    try {
      const r = await api.post('/accounting/sheets/sync');
      const d = r.data.data;
      if (d.url) setSheetUrl(d.url);
      toast(`✅ 동기화 완료 — 거래 ${d.tx}건 · 영수증 ${d.receipts}건 · 수당 ${d.staff}건`);
    } catch (e) {
      toast(`❌ ${e.response?.data?.message || '동기화 실패'}`);
    } finally { setSyncLoading(false); }
  }

  async function handleReset() {
    const confirmed = window.confirm(
      '⚠️ 회계 초기화\n\n모든 거래내역, 영수증, SMS, 비품, 수당 데이터가 삭제됩니다.\n\n정말 초기화하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)'
    );
    if (!confirmed) return;
    const confirmed2 = window.confirm('마지막 확인: 회계 데이터를 완전히 삭제합니다.');
    if (!confirmed2) return;
    try {
      await api.delete('/accounting/reset');
      toast('✅ 회계 데이터가 초기화되었습니다.');
      loadSummary(); loadTransactions(); loadPendingReceipts(); loadPendingSms();
    } catch (e) {
      toast('❌ ' + (e.response?.data?.message || '초기화 실패'));
    }
  }

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

  const loadRecentReceipts = useCallback(async () => {
    try {
      const r = await api.get('/accounting/receipts');
      setRecentReceipts((r.data.data || []).slice(0, 5));
    } catch {}
  }, []);

  const loadPendingReceipts = useCallback(async () => {
    if (!isAccountant) return;
    try {
      const r = await api.get('/accounting/receipts/pending');
      setPendingReceipts(r.data.data || []);
    } catch {}
  }, [isAccountant]);

  const loadAssets = useCallback(async () => {
    try {
      const r = await api.get('/accounting/assets');
      setAssets(r.data.data || []);
    } catch {}
  }, []);

  useEffect(() => { loadSummary(); loadRecentReceipts(); loadPendingReceipts(); }, [loadSummary, loadRecentReceipts, loadPendingReceipts]);
  // 30초마다 미처리 영수증 카운트 갱신 (배지 실시간 반영)
  useEffect(() => {
    if (!isAccountant) return;
    const timer = setInterval(() => loadPendingReceipts(), 30000);
    return () => clearInterval(timer);
  }, [isAccountant, loadPendingReceipts]);
  useEffect(() => {
    if (!isAccountant) return;
    api.get('/accounting/sheets/url').then(r => {
      if (r.data.data?.url) setSheetUrl(r.data.data.url);
    }).catch(() => {});
  }, [isAccountant]);
  useEffect(() => {
    if (tab === 0) { loadSummary(); loadRecentReceipts(); loadPendingReceipts(); }
    if (tab === 1) loadTransactions();
    if (tab === 2 && isAccountant) { loadPendingReceipts(); loadPendingSms(); }
    if (tab === 3 && isAccountant) api.get('/accounting/sms?status=PENDING').then(r => setSmsList(r.data.data || [])).catch(() => {});
    if (tab === 4 && isAccountant) {
      api.get('/accounting/sponsor/income').then(r => setSponsorIncome(r.data.data || [])).catch(() => {});
      api.get('/accounting/sponsor/expense').then(r => setSponsorExpense(r.data.data || [])).catch(() => {});
    }
    if (tab === 5 && isAccountant) api.get('/accounting/staff').then(r => setStaff(r.data.data || [])).catch(() => {});
    if (tab === 6 && isAccountant) api.get('/accounting/receipts/list').then(r => setAllReceipts(r.data.data || [])).catch(() => {});
    if (tab === 7) loadAssets();
  }, [tab, isAccountant, loadSummary, loadTransactions, loadPendingReceipts, loadPendingSms, loadAssets]);

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
        category: sms.category,
        reimbursable: (sms.date && sms.date < '2026-05-14') ? false : (sms.reimbursable ?? true),
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

  function clearModalReceipt() {
    setModalReceiptFile(null);
    setModalReceiptPreview(null);
    if (modalReceiptRef.current) modalReceiptRef.current.value = '';
  }

  function handleModalReceiptSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setModalReceiptFile(file);
    const reader = new FileReader();
    reader.onload = ev => setModalReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function submitForm() {
    setLoading(true);
    try {
      // 영수증 파일이 있으면 먼저 업로드 → receipt_id 획득
      let receiptId = form.receipt_id || null;
      if (modalReceiptFile) {
        const fd = new FormData();
        fd.append('file', modalReceiptFile);
        const r = await api.post('/accounting/receipts/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        receiptId = r.data.data?.id || null;
        loadRecentReceipts();
      }

      let url = '';
      if (modal === 'tx') url = '/accounting/transactions';
      else if (modal === 'sponsor_income') url = '/accounting/sponsor/income';
      else if (modal === 'sponsor_expense') url = '/accounting/sponsor/expense';
      else if (modal === 'staff') url = '/accounting/staff';
      const savedForm = { ...form };
      const res = await api.post(url, { ...form, ...(receiptId ? { receipt_id: receiptId } : {}) });
      const savedTx = res.data.data;
      toast('✅ 등록 완료');
      setModal(null); setForm({}); clearModalReceipt(); setModalReceiptUrl(null);
      if (modal === 'tx') {
        loadTransactions(); loadSummary(); loadPendingReceipts(); loadRecentReceipts();
        // 비품 체크됐으면 비품등록 유도
        if (savedForm.type === 'expense' && savedForm.is_asset) {
          setPostSaveTx({ ...savedTx, _formDescription: savedForm.description, _formAmount: savedForm.amount, _formDate: savedForm.date, _formCategory: savedForm.category });
        }
      }
      if (modal === 'sponsor_income' || modal === 'sponsor_expense') {
        api.get('/accounting/sponsor/income').then(r => setSponsorIncome(r.data.data || []));
        api.get('/accounting/sponsor/expense').then(r => setSponsorExpense(r.data.data || []));
        loadSummary();
      }
      if (modal === 'staff') api.get('/accounting/staff').then(r => setStaff(r.data.data || []));
    } catch (e) { toast(`❌ ${e.response?.data?.message || '등록 실패'}`); } finally { setLoading(false); }
  }

  async function handleDownloadReceipts() {
    if (!dlFrom || !dlTo) { toast('❌ 날짜 범위를 선택하세요'); return; }
    setDlLoading(true);
    try {
      const r = await api.get(`/accounting/receipts/download?from=${dlFrom}&to=${dlTo}`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipts_${dlFrom}_${dlTo}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast('✅ 다운로드 완료');
    } catch (e) {
      const msg = e.response?.status === 404 ? '해당 기간 영수증 없음' : '다운로드 실패';
      toast(`❌ ${msg}`);
    } finally { setDlLoading(false); }
  }

  function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = ev => setUploadPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleReceiptUpload() {
    if (!uploadFile) return;
    setUploadLoading(true);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      if (uploadNote.trim()) fd.append('note', uploadNote.trim());
      const r = await api.post('/accounting/receipts/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const d = r.data.data;
      setUploadResult({ ok: true, data: d });
      setUploadFile(null);
      setUploadPreview(null);
      setUploadNote('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast('✅ 영수증 저장 완료');
      loadRecentReceipts();
    } catch (e) {
      setUploadResult({ ok: false, msg: e.response?.data?.message || '업로드 실패' });
      toast('❌ 업로드 실패');
    } finally { setUploadLoading(false); }
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
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {isAccountant && sheetUrl && (
              <a href={sheetUrl} target="_blank" rel="noopener noreferrer" style={{
                background:'#0f5132', color:'#fff', border:'none', borderRadius:8,
                padding:'7px 12px', fontSize:11, fontWeight:700, cursor:'pointer',
                textDecoration:'none', display:'flex', alignItems:'center', gap:4
              }}>📊 시트</a>
            )}
            {user?.role === 'admin' && (
              <button onClick={handleReset} style={{
                background:'#2a0a0a', color:'#f87171', border:'1px solid #f8717144',
                borderRadius:8, padding:'7px 10px', fontSize:11, cursor:'pointer'
              }}>🗑️ 초기화</button>
            )}
            {isAccountant && (
              <button onClick={handleSheetsSync} disabled={syncLoading} style={{
                background:'#1a3a1a', color:'#4ade80', border:'1px solid #4ade8044', borderRadius:8,
                padding:'7px 12px', fontSize:11, fontWeight:700, cursor:'pointer',
                opacity: syncLoading ? 0.6 : 1
              }}>{syncLoading ? '동기화중...' : '🔄 동기화'}</button>
            )}
            {isAccountant && (
              <button onClick={() => { setModal('tx'); setForm({ date: today, type: 'expense', cost_type: 'election_cost' }); }} style={{
                background: S.accent, color: '#fff', border: 'none', borderRadius: 8,
                padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer'
              }}>+ 등록</button>
            )}
          </div>
        </div>

        {/* 탭 */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, overflowX: 'auto' }}>
          {tabs.map((t, i) => {
            const isPendingTab = isAccountant && t === '미처리영수증';
            const badgeCount = isPendingTab ? (pendingReceipts.length + pendingSmsCnt) : 0;
            return (
              <button key={i} onClick={() => { setTab(i); if (isPendingTab) { localStorage.setItem('pendingTabViewed', Date.now()); loadPendingSms(); } }} style={{
                padding: '5px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20,
                background: tab === i ? S.accent : S.surface2,
                color: tab === i ? '#fff' : S.sub,
                border: tab === i ? 'none' : S.border,
                cursor: 'pointer', whiteSpace: 'nowrap', position: 'relative', display: 'flex', alignItems: 'center', gap: 4
              }}>
                {t}
                {badgeCount > 0 && (
                  <span style={{
                    background: S.red, color: '#fff', borderRadius: 10,
                    fontSize: 9, fontWeight: 900, padding: '1px 5px', minWidth: 16, textAlign: 'center',
                    animation: 'pulse 1.5s infinite'
                  }}>{badgeCount}</span>
                )}
              </button>
            );
          })}
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

            {/* ── 영수증 업로드 (전체 이용) ── */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🧾 영수증 업로드</div>

              {/* 파일 선택 영역 */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${uploadPreview ? S.accent : S.muted}`,
                  borderRadius: 10, padding: uploadPreview ? 0 : '20px 0',
                  textAlign: 'center', cursor: 'pointer', overflow: 'hidden',
                  transition: 'border-color 0.2s'
                }}
              >
                {uploadPreview ? (
                  <img src={uploadPreview} alt="미리보기"
                    style={{ width: '100%', maxHeight: 180, objectFit: 'contain', display: 'block' }} />
                ) : (
                  <div>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📷</div>
                    <div style={{ fontSize: 12, color: S.sub }}>탭하여 사진 선택</div>
                    <div style={{ fontSize: 10, color: S.muted, marginTop: 3 }}>JPG · PNG · HEIC · WEBP</div>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic"
                capture="environment"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />

              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: S.sub, marginBottom: 4 }}>메모 (용도/거래처 설명)</div>
                <input
                  type="text"
                  placeholder="예: 현수막 제작비 - 홍길동인쇄소"
                  value={uploadNote}
                  onChange={e => setUploadNote(e.target.value)}
                  style={inputStyle}
                />
              </div>

              {uploadFile && (
                <div style={{ fontSize: 11, color: S.sub, marginTop: 6, marginBottom: 6 }}>
                  📎 {uploadFile.name}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {uploadPreview && (
                  <button onClick={() => { setUploadFile(null); setUploadPreview(null); setUploadResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} style={{
                    padding: '9px 14px', background: S.surface2, color: S.sub,
                    border: S.border, borderRadius: 8, fontSize: 12, cursor: 'pointer'
                  }}>취소</button>
                )}
                <button
                  onClick={handleReceiptUpload}
                  disabled={!uploadFile || uploadLoading}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: uploadFile ? S.accent : S.muted,
                    color: '#fff', border: 'none', borderRadius: 8,
                    fontWeight: 700, fontSize: 13, cursor: uploadFile ? 'pointer' : 'default',
                    opacity: uploadLoading ? 0.6 : 1,
                    fontFamily: "'Noto Sans KR',sans-serif"
                  }}
                >
                  {uploadLoading ? '업로드 중...' : '업로드'}
                </button>
              </div>

              {/* OCR 결과 */}
              {uploadResult?.ok && uploadResult.data && (
                <div style={{ marginTop: 10, background: S.surface2, borderRadius: 8, padding: 10 }}>
                  <div style={{ fontSize: 11, color: S.green, fontWeight: 700, marginBottom: 6 }}>✅ AI 분석 완료</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {uploadResult.data.ocr_date    && <Badge color={S.sub}>{uploadResult.data.ocr_date}</Badge>}
                    {uploadResult.data.ocr_amount  && <Badge color={S.green}>{uploadResult.data.ocr_amount.toLocaleString()}원</Badge>}
                    {uploadResult.data.ocr_vendor  && <Badge color={S.accent}>{uploadResult.data.ocr_vendor}</Badge>}
                    {uploadResult.data.category_suggestion && <Badge color="#7c3aed">{uploadResult.data.category_suggestion}</Badge>}
                    {uploadResult.data.ocr_receipt_type && <Badge color={S.muted}>{uploadResult.data.ocr_receipt_type}</Badge>}
                  </div>
                </div>
              )}
              {uploadResult?.ok && !uploadResult.data?.ocr_date && (
                <div style={{ marginTop: 8, fontSize: 11, color: S.sub }}>저장 완료 (OCR 분석 없음)</div>
              )}
            </Card>

            {/* 미처리 영수증 요약 배너 (회계담당/관리자) - 클릭하면 미처리 탭으로 이동 */}
            {isAccountant && pendingReceipts.length > 0 && (
              <div onClick={() => setTab(2)} style={{
                background: '#2a1500', border: '1px solid #ffa50244', borderRadius: 12,
                padding: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12
              }}>
                <div style={{ background: S.yellow, color: '#000', borderRadius: '50%', width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0, fontWeight: 900 }}>
                  {pendingReceipts.length}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.yellow }}>미처리 영수증 {pendingReceipts.length}건</div>
                  <div style={{ fontSize: 11, color: S.sub }}>탭하여 처리하기 →</div>
                </div>
              </div>
            )}

            {/* 최근 업로드 영수증 */}
            {recentReceipts.length > 0 && (
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: S.sub }}>최근 업로드 영수증</div>
                {recentReceipts.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 0', borderBottom: `1px solid ${S.surface2}`
                  }}>
                    {r.image_url ? (
                      <img
                        src={r.gcs_url || r.image_url}
                        alt="영수증"
                        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0, background: S.surface2 }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: 6, background: S.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 18 }}>🧾</span>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.ocr_vendor || '업체 미인식'}
                        {r.ocr_amount ? <span style={{ color: S.green, marginLeft: 6 }}>{r.ocr_amount.toLocaleString()}원</span> : null}
                      </div>
                      <div style={{ fontSize: 10, color: S.muted }}>
                        {r.ocr_date || ''} · {r.uploader_name || '알수없음'}
                        {r.gcs_url && <span style={{ color: '#10b981', marginLeft: 4 }}>☁ 백업완료</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </Card>
            )}

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

        {/* ── 미처리 탭 (회계담당+관리자) ── */}
        {tab === 2 && isAccountant && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* 서브탭 */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {[
                { key: 'receipt', label: '🧾 미처리 영수증', cnt: pendingReceipts.length },
                { key: 'sms',     label: '📱 미처리 SMS',    cnt: pendingSmsCnt },
              ].map(({ key, label, cnt }) => (
                <button key={key} onClick={() => setPendingSubTab(key)} style={{
                  padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                  background: pendingSubTab === key ? S.accent : S.surface2,
                  color: pendingSubTab === key ? '#fff' : S.sub,
                  border: pendingSubTab === key ? 'none' : S.border,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                }}>
                  {label}
                  {cnt > 0 && <span style={{ background: S.red, color: '#fff', borderRadius: 10, fontSize: 9, fontWeight: 900, padding: '1px 5px' }}>{cnt}</span>}
                </button>
              ))}
              <button onClick={() => { loadPendingReceipts(); loadPendingSms(); }} style={{
                marginLeft: 'auto', background: S.surface2, color: S.sub, border: S.border,
                borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer'
              }}>새로고침</button>
            </div>

            {/* ── 미처리 영수증 서브탭 ── */}
            {pendingSubTab === 'receipt' && (pendingReceipts.length === 0 ? (
              <div style={{ textAlign: 'center', color: S.muted, padding: 60, fontSize: 13 }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                미처리 영수증이 없습니다
              </div>
            ) : pendingReceipts.map(r => (
              <Card key={r.id} style={{ border: '1px solid #ffa50233' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  {/* 썸네일 */}
                  {(r.gcs_url || r.image_url) ? (
                    <img
                      src={r.gcs_url || r.image_url}
                      alt="영수증"
                      style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 8, background: S.surface2, flexShrink: 0 }}
                      onError={e => { e.target.style.display='none'; }}
                    />
                  ) : (
                    <div style={{ width: 70, height: 70, borderRadius: 8, background: S.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🧾</div>
                  )}
                  {/* 정보 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{r.note || r.ocr_vendor || '설명 없음'}</span>
                      <span style={{ background: '#ffa50222', color: S.yellow, border: '1px solid #ffa50244', borderRadius: 6, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>미처리</span>
                    </div>
                    <div style={{ fontSize: 11, color: S.sub, marginBottom: 4 }}>
                      👤 {r.uploader_name || '알수없음'} · {r.uploaded_at ? new Date(r.uploaded_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {r.ocr_date && <Badge color={S.sub}>{String(r.ocr_date).split('T')[0]}</Badge>}
                      {r.ocr_amount > 0 && <Badge color={S.green}>{r.ocr_amount.toLocaleString()}원</Badge>}
                      {r.ocr_receipt_type && <Badge color={S.muted}>{r.ocr_receipt_type}</Badge>}
                      {r.category_suggestion && <Badge color={S.accent}>{r.category_suggestion}</Badge>}
                      {r.ocr_vendor && r.note && <Badge color={S.muted}>{r.ocr_vendor}</Badge>}
                    </div>
                    <button
                      onClick={() => {
                        setModal('tx');
                        setModalReceiptUrl(r.gcs_url || r.image_url || null);
                        setForm({
                          date: r.ocr_date ? String(r.ocr_date).split('T')[0] : today,
                          type: 'expense',
                          cost_type: 'election_cost',
                          category: r.category_suggestion || '',
                          amount: r.ocr_amount || '',
                          description: r.note || r.ocr_vendor || '',
                          receipt_id: r.id,
                          reimbursable: (r.ocr_date && r.ocr_date < '2026-05-14') ? false : (r.reimbursable_guess ?? true),
                        });
                      }}
                      style={{
                        padding: '7px 18px', background: S.accent, color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif"
                      }}
                    >+ 거래 등록</button>
                  </div>
                </div>
              </Card>
            )))}

            {/* ── 미처리 SMS 서브탭 ── */}
            {pendingSubTab === 'sms' && (
              <div>
                {pendingSmsRows.length === 0 ? (
                  <div style={{ textAlign: 'center', color: S.muted, padding: 60, fontSize: 13 }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>✅</div>
                    미처리 SMS가 없습니다
                  </div>
                ) : pendingSmsRows.map(sms => (
                  <Card key={sms.id} style={{ marginBottom: 8, border: '1px solid #1e6bff33' }}>
                    <div style={{ fontSize: 11, color: S.sub, marginBottom: 6, lineHeight: 1.6, wordBreak: 'break-all' }}>
                      <span style={{ background: '#1e6bff22', color: S.accent, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700, marginRight: 6 }}>📱 SMS</span>
                      {sms.raw_text}
                    </div>
                    <div style={{ fontSize: 10, color: S.muted, marginBottom: 8 }}>
                      수신: {sms.received_at ? new Date(sms.received_at).toLocaleString('ko-KR') : ''} · 출처: {sms.source || 'auto'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => {
                        setModal('tx');
                        setForm({
                          date: today, type: 'expense', cost_type: 'election_cost',
                          description: sms.raw_text?.substring(0, 50) || '',
                          sms_id: sms.id,
                        });
                      }} style={{
                        flex: 1, padding: '7px 0', background: S.accent, color: '#fff',
                        border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer'
                      }}>+ 거래 등록</button>
                      <button onClick={async () => {
                        await api.patch(`/accounting/sms/${sms.id}/skip`, { reason: '수동 무시' });
                        loadPendingSms(); toast('🚫 무시 처리됨');
                      }} style={{
                        padding: '7px 14px', background: S.surface2, color: S.sub,
                        border: S.border, borderRadius: 8, fontSize: 12, cursor: 'pointer'
                      }}>무시</button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── SMS 파싱 (회계담당+관리자) ── */}
        {tab === 3 && isAccountant && (
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
        {tab === 4 && isAccountant && (
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
        {tab === 5 && isAccountant && (
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

        {/* ── 영수증 관리 (회계담당+관리자) ── */}
        {tab === 6 && isAccountant && (
          <ReceiptTab
            allReceipts={allReceipts}
            dlFrom={dlFrom} dlTo={dlTo}
            setDlFrom={setDlFrom} setDlTo={setDlTo}
            dlLoading={dlLoading}
            onDownload={handleDownloadReceipts}
          />
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

                {/* ① 날짜 */}
                <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
                {form.date && form.date < '2026-05-14' && (
                  <div style={{ background: '#3a1f00', border: '1px solid #ff8c00', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#ffa502' }}>
                    ⚠️ <strong>예비후보자 기간</strong> (2026-05-14 이전)은 선거비용 보전 대상이 아닙니다.
                  </div>
                )}

                {/* ② 구분: 수입 / 지출 */}
                <FormRow label="구분 (수입·지출)">
                  <select value={form.type||'expense'} onChange={e => setForm(f => ({...f, type: e.target.value, account: '', category: '', cost_type: 'election_cost'}))} style={inputStyle}>
                    <option value="expense">지출</option>
                    <option value="income">수입</option>
                  </select>
                </FormRow>

                {/* ③-수입: 수입과목(계정과목) */}
                {form.type === 'income' && (
                  <FormRow label="수입과목 (계정과목)">
                    <select value={form.account_type||''} onChange={e => setForm(f => ({...f, account_type: e.target.value, category: e.target.value}))} style={inputStyle}>
                      <option value="">— 선택 —</option>
                      {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div style={{ fontSize: 10, color: S.muted, marginTop: 3 }}>자기부담금·차입금·정당지원금·기탁금반환금 중 선택</div>
                  </FormRow>
                )}

                {/* ③-지출: 계정과목(대분류) → 세목(소분류) → 비용구분 자동판별 */}
                {form.type === 'expense' && (<>
                  <FormRow label="계정과목 (대분류)">
                    <select value={form.account||''} onChange={e => {
                      const acct = e.target.value;
                      const isNonElection = NON_ELECTION_ACCOUNTS.has(acct);
                      setForm(f => ({
                        ...f,
                        account: acct,
                        category: '',
                        cost_type: isNonElection ? 'non_election_cost' : 'election_cost',
                      }));
                    }} style={inputStyle}>
                      <option value="">— 선택 —</option>
                      {Object.keys(EXPENSE_ACCOUNTS).map(a => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                  </FormRow>

                  {form.account && (
                    <FormRow label={`세목 (${form.account} 소분류)`}>
                      <select value={form.category||''} onChange={e => setForm(f => ({...f, category: e.target.value}))} style={inputStyle}>
                        <option value="">— 선택 —</option>
                        {(EXPENSE_ACCOUNTS[form.account]||[]).map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </FormRow>
                  )}

                  {/* 비용구분: 계정 선택 시 자동 판별 + 수동 변경 가능 */}
                  <div style={{
                    background: S.surface2, border: S.border, borderRadius: 8,
                    padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    <div style={{ fontSize: 11, color: S.sub, minWidth: 56 }}>비용구분</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[['election_cost','선거비용 (보전가능)'],['non_election_cost','비선거비용']].map(([val, lbl]) => (
                        <button key={val} onClick={() => setForm(f => ({...f, cost_type: val}))} style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: 'none',
                          background: form.cost_type === val ? (val === 'election_cost' ? S.accent : S.yellow) : S.surface,
                          color: form.cost_type === val ? '#fff' : S.muted,
                        }}>{lbl}</button>
                      ))}
                    </div>
                    {form.date && form.date < '2026-05-14' && form.cost_type === 'election_cost' && (
                      <span style={{ fontSize: 10, color: S.yellow }}>(보전불가)</span>
                    )}
                  </div>

                  {/* ④ 비품 여부 — 지출 계정 선택 후 바로 확인 */}
                  <div style={{
                    background: form.is_asset ? '#1a0a2e' : S.surface2,
                    border: form.is_asset ? '1px solid #7c3aed' : S.border,
                    borderRadius: 10, padding: '12px 14px',
                    display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer'
                  }} onClick={() => setForm(f => ({ ...f, is_asset: !f.is_asset }))}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 6, border: `2px solid ${form.is_asset ? '#7c3aed' : S.muted}`,
                      background: form.is_asset ? '#7c3aed' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {form.is_asset && <span style={{ color: '#fff', fontSize: 14, fontWeight: 900 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: form.is_asset ? '#c084fc' : S.text }}>
                        🏷️ 이 지출은 비품입니다
                      </div>
                      <div style={{ fontSize: 11, color: S.sub, marginTop: 1 }}>
                        {form.is_asset
                          ? '저장 후 비품 등록 → 스티커 출력이 자동으로 진행됩니다'
                          : '책상, 의자, 전자기기 등 선거사무소 비품이면 체크'}
                      </div>
                    </div>
                  </div>
                  {form.is_asset && (
                    <div style={{ background: '#3a0000', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ef4444', fontWeight: 700, lineHeight: 1.6 }}>
                      ⛔ 비품 체크 시 거래 저장 후 <strong>반드시</strong> 비품 등록을 완료해야 합니다.<br />
                      <span style={{ fontWeight: 400, color: '#fca5a5' }}>미등록 시 구글시트에 '미등록'으로 표시되며 선관위 제출 자료에서 누락됩니다.</span>
                    </div>
                  )}
                </>)}

                {/* 금액·내용·비고 — 수입/지출 공통 */}
                <FormRow label="금액 (원)"><AmountInput value={form.amount} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} /></FormRow>
                <FormRow label="내용·적요">
                  <input type="text" placeholder="지출 내용 또는 거래처명" value={form.description||''} onChange={e => setForm(f => ({...f,description:e.target.value}))} style={inputStyle} />
                </FormRow>
                <FormRow label="비고">
                  <input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} />
                </FormRow>

                {/* 연결된 영수증 or 새 첨부 */}
                {form.receipt_id ? (
                  <div style={{ background: '#0d1f0d', border: '1px solid #10b98144', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {modalReceiptUrl ? (
                      <img src={modalReceiptUrl} alt="영수증"
                        style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, background: '#1a2236', flexShrink: 0 }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: 6, background: '#1a2236', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>🧾</div>
                    )}
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>✓ 영수증 연결됨</div>
                      <div style={{ fontSize: 10, color: '#8896b3', marginTop: 2 }}>영수증 #{form.receipt_id}</div>
                    </div>
                  </div>
                ) : (
                  <ReceiptAttach
                    preview={modalReceiptPreview}
                    file={modalReceiptFile}
                    inputRef={modalReceiptRef}
                    onSelect={handleModalReceiptSelect}
                    onClear={clearModalReceipt}
                  />
                )}
              </div>
            )}

            {/* 후원금 수입 폼 */}
            {modal === 'sponsor_income' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <FormRow label="날짜"><input type="date" value={form.date||''} onChange={e => setForm(f => ({...f,date:e.target.value}))} style={inputStyle} /></FormRow>
                <FormRow label="금액"><AmountInput value={form.amount} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} /></FormRow>
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
                <FormRow label="금액"><AmountInput value={form.amount} onChange={e => setForm(f => ({...f,amount:parseInt(e.target.value)||0}))} /></FormRow>
                <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
                <ReceiptAttach
                  preview={modalReceiptPreview}
                  file={modalReceiptFile}
                  inputRef={modalReceiptRef}
                  onSelect={handleModalReceiptSelect}
                  onClear={clearModalReceipt}
                />
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
                <FormRow label="수당"><AmountInput value={form.allowance} onChange={e => setForm(f => ({...f,allowance:parseInt(e.target.value)||0}))} /></FormRow>
                <FormRow label="식사제공"><input type="number" min="0" max="3" placeholder="0~3회" value={form.meal_provided||0} onChange={e => setForm(f => ({...f,meal_provided:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <FormRow label="교통공제"><input type="number" placeholder="원" value={form.transport_deduction||0} onChange={e => setForm(f => ({...f,transport_deduction:parseInt(e.target.value)||0}))} style={inputStyle} /></FormRow>
                <div style={{ fontSize: 11, color: S.sub, background: S.surface2, borderRadius: 8, padding: 10 }}>
                  예상 합계: {((form.allowance||0) + 20000 - (form.transport_deduction||0) + Math.max(0, 25000 - (form.meal_provided||0)*8330)).toLocaleString()}원
                  <div style={{ marginTop: 4 }}>일비 20,000 + 식비 {Math.max(0, 25000 - (form.meal_provided||0)*8330).toLocaleString()}원</div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setModal(null); setForm({}); clearModalReceipt(); setModalReceiptUrl(null); }} style={{
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

      {/* ── 비품관리 탭 ── */}
      {tab === 7 && (
        <div>
          {/* 통계 요약 */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: S.surface, border: S.border, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.accent }}>{assets.length}</div>
              <div style={{ fontSize: 10, color: S.sub, marginTop: 2 }}>전체 비품</div>
            </div>
            <div style={{ flex: 1, background: S.surface, border: S.border, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.green }}>{assets.filter(a => a.accounted).length}</div>
              <div style={{ fontSize: 10, color: S.sub, marginTop: 2 }}>회계등록 완료</div>
            </div>
            <div style={{ flex: 1, background: S.surface, border: S.border, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: S.red }}>{assets.filter(a => !a.accounted).length}</div>
              <div style={{ fontSize: 10, color: S.sub, marginTop: 2 }}>미등록</div>
            </div>
            <div style={{ flex: 1, background: S.surface, border: S.border, borderRadius: 10, padding: '10px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 900, color: S.yellow }}>
                {assets.reduce((s, a) => s + (a.total_amount||0), 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 10, color: S.sub, marginTop: 2 }}>합계(원)</div>
            </div>
          </div>

          <div style={{ background: '#1a1a0a', border: '1px solid #ffa50244', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#ffa502', marginBottom: 12 }}>
            💡 비품 등록은 <strong>수입/지출 등록</strong> 시 '이 지출은 비품입니다' 체크를 통해서만 이루어집니다.
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {assets.length > 0 && (
              <button onClick={() => setStickerTarget('all')} style={{
                padding: '10px 16px', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer'
              }}>🏷️ 전체 스티커 인쇄</button>
            )}
          </div>

          {/* 비품 목록 */}
          {assets.length === 0 ? (
            <div style={{ textAlign: 'center', color: S.sub, padding: '40px 0', fontSize: 13 }}>등록된 비품이 없습니다.</div>
          ) : (
            assets.map(a => (
              <Card key={a.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 900, color: '#7c3aed', background: '#7c3aed22', border: '1px solid #7c3aed44', borderRadius: 5, padding: '1px 7px' }}>{a.asset_no}</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{a.name}</span>
                      <Badge color={a.accounted ? S.green : S.red}>{a.accounted ? '✅ 회계등록완료' : '❌ 미등록'}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: S.sub }}>
                      수량 {a.quantity}개 · {a.unit_price?.toLocaleString()}원 · 합계 <strong style={{ color: S.text }}>{a.total_amount?.toLocaleString()}원</strong>
                    </div>
                    <div style={{ fontSize: 11, color: S.sub, marginTop: 2 }}>
                      {a.purchase_date} · {a.vendor||'-'} · {a.location}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 8, flexShrink: 0 }}>
                    <button onClick={() => setStickerTarget(a)} style={{
                      padding: '5px 10px', background: '#7c3aed', color: '#fff',
                      border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontWeight: 700
                    }}>🏷️ 스티커</button>
                    {isAccountant && (
                      <>
                        <button onClick={async () => {
                          await api.patch(`/accounting/assets/${a.id}/accounted`, { accounted: !a.accounted });
                          loadAssets();
                          toast(a.accounted ? '❌ 미등록으로 변경' : '✅ 회계등록 완료 처리');
                        }} style={{
                          padding: '5px 10px', background: a.accounted ? S.surface2 : S.green, color: '#fff',
                          border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer'
                        }}>{a.accounted ? '취소' : '등록완료'}</button>
                        <button onClick={async () => {
                          if (!window.confirm(`"${a.name}" 삭제하시겠습니까?`)) return;
                          await api.delete(`/accounting/assets/${a.id}`);
                          loadAssets(); toast('🗑️ 삭제됨');
                        }} style={{
                          padding: '5px 10px', background: S.surface2, color: S.sub,
                          border: S.border, borderRadius: 6, fontSize: 11, cursor: 'pointer'
                        }}>삭제</button>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ── 비품 등록 모달 ── */}
      {modal === 'asset' && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}
          onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{ background: S.surface, borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 600, margin: '0 auto', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>비품 등록</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <FormRow label="품목명"><input type="text" placeholder="예: 접이식 테이블" value={form.name||''} onChange={e => setForm(f => ({...f,name:e.target.value}))} style={inputStyle} /></FormRow>
              <FormRow label="구매일"><input type="date" value={form.purchase_date||''} onChange={e => setForm(f => ({...f,purchase_date:e.target.value}))} style={inputStyle} /></FormRow>
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><FormRow label="수량"><input type="number" min="1" value={form.quantity||1} onChange={e => setForm(f => ({...f,quantity:parseInt(e.target.value)||1}))} style={inputStyle} /></FormRow></div>
                <div style={{ flex: 2 }}><FormRow label="단가(원)"><AmountInput value={form.unit_price} onChange={e => setForm(f => ({...f,unit_price:parseInt(e.target.value)||0}))} /></FormRow></div>
              </div>
              {form.quantity > 0 && form.unit_price > 0 && (
                <div style={{ background: S.surface2, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: S.sub }}>
                  합계: <strong style={{ color: S.text }}>{((form.quantity||1) * (form.unit_price||0)).toLocaleString()}원</strong>
                </div>
              )}
              {/* ── 영수증 연동 ── */}
              <div>
                <div style={{ fontSize: 11, color: S.sub, marginBottom: 4 }}>영수증 연동 <span style={{ color: S.muted }}>(현금영수증·카드·SMS 포함)</span></div>
                {form.receipt_id ? (
                  <div style={{ background: '#0a2a0a', border: '1px solid #10b98144', borderRadius: 8, padding: '8px 12px', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: S.green }}>✅ 영수증 #{form.receipt_id} — {form._receiptLabel}</span>
                    <button onClick={() => setForm(f => ({ ...f, receipt_id: null, _receiptLabel: null }))} style={{ background: 'none', border: 'none', color: S.red, cursor: 'pointer', fontSize: 12 }}>연결 해제</button>
                  </div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="업체명·금액·날짜로 검색 (예: 사무용가구, 50000)"
                      value={assetReceiptSearch}
                      onChange={e => { setAssetReceiptSearch(e.target.value); setAssetReceiptOpen(true); }}
                      onFocus={() => setAssetReceiptOpen(true)}
                      style={inputStyle}
                    />
                    {assetReceiptOpen && assetReceiptSearch.length > 0 && (() => {
                      const q = assetReceiptSearch.toLowerCase();
                      const filtered = allReceipts.filter(r =>
                        (r.ocr_vendor||'').toLowerCase().includes(q) ||
                        String(r.ocr_amount||'').includes(q) ||
                        (r.ocr_date||'').includes(q) ||
                        (r.source||'').toLowerCase().includes(q)
                      );
                      return (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: S.surface2, border: S.border, borderRadius: 8, zIndex: 200, maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                          {filtered.length === 0 ? (
                            <div style={{ padding: 12, fontSize: 12, color: S.sub, textAlign: 'center' }}>검색 결과 없음</div>
                          ) : filtered.slice(0, 20).map(r => (
                            <div key={r.id}
                              onClick={() => {
                                const label = `${r.ocr_vendor||'업체미상'} ${Number(r.ocr_amount||0).toLocaleString()}원 (${r.ocr_date||''})`;
                                setForm(f => ({
                                  ...f,
                                  receipt_id: r.id,
                                  _receiptLabel: label,
                                  vendor: f.vendor || r.ocr_vendor || '',
                                  unit_price: f.unit_price || (r.ocr_amount ? parseInt(r.ocr_amount) : 0),
                                  purchase_date: r.ocr_date || f.purchase_date,
                                }));
                                setAssetReceiptSearch('');
                                setAssetReceiptOpen(false);
                              }}
                              style={{ padding: '9px 12px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #1e2d45', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#1e2d45'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <div>
                                <span style={{ fontWeight: 700, color: S.text }}>{r.ocr_vendor||'업체미상'}</span>
                                <span style={{ marginLeft: 6, fontSize: 11, color: S.sub, background: r.source === 'sms' ? '#1a2a3a' : '#1a2a1a', borderRadius: 4, padding: '1px 5px' }}>
                                  {r.source === 'sms' ? '📱 SMS' : r.source === 'upload' ? '🧾 영수증' : '📄 ' + (r.source||'-')}
                                </span>
                                <div style={{ fontSize: 10, color: S.muted, marginTop: 1 }}>{r.ocr_date||r.uploaded_at?.slice(0,10)||''} · #{r.id}</div>
                              </div>
                              <div style={{ color: S.yellow, fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{Number(r.ocr_amount||0).toLocaleString()}원</div>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>

              <FormRow label="구매처"><input type="text" placeholder="구매처/업체명" value={form.vendor||''} onChange={e => setForm(f => ({...f,vendor:e.target.value}))} style={inputStyle} /></FormRow>
              <FormRow label="비치장소">
                <select value={form.location||'선거사무소 본소'} onChange={e => setForm(f => ({...f,location:e.target.value}))} style={inputStyle}>
                  {ASSET_LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </FormRow>
              <FormRow label="상태">
                <select value={form.status||'사용중'} onChange={e => setForm(f => ({...f,status:e.target.value}))} style={inputStyle}>
                  <option value="사용중">사용중</option>
                  <option value="반납예정">반납예정</option>
                  <option value="반납완료">반납완료</option>
                </select>
              </FormRow>
              <FormRow label="비고"><input type="text" value={form.note||''} onChange={e => setForm(f => ({...f,note:e.target.value}))} style={inputStyle} /></FormRow>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="assetAccounted" checked={!!form.accounted} onChange={e => setForm(f => ({...f,accounted:e.target.checked}))} />
                <label htmlFor="assetAccounted" style={{ fontSize: 13, color: S.text, cursor: 'pointer' }}>회계등록 완료 (거래 연결됨)</label>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => { setModal(null); setForm({}); }} style={{ flex: 1, padding: '11px 0', background: S.surface2, color: S.sub, border: S.border, borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>취소</button>
              <button disabled={loading} onClick={async () => {
                if (!form.name || !form.purchase_date || !form.unit_price) { toast('❌ 품목명·구매일·단가 필수'); return; }
                setLoading(true);
                try {
                  const res = await api.post('/accounting/assets', { ...form, total_amount: (form.quantity||1) * (form.unit_price||0) });
                  const newAsset = res.data.data;
                  // 거래와 비품 연결 (transaction_id가 있을 때)
                  if (form.transaction_id && newAsset?.id) {
                    api.patch(`/accounting/transactions/${form.transaction_id}/asset`, { asset_id: newAsset.id }).catch(() => {});
                  }
                  toast('✅ 비품 등록 완료 — 스티커를 출력하세요');
                  setModal(null); setForm({});
                  loadAssets();
                  // 스티커 바로 출력 유도
                  if (newAsset) setTimeout(() => setStickerTarget(newAsset), 300);
                } catch (e) { toast('❌ ' + (e.response?.data?.message || '등록 실패')); }
                finally { setLoading(false); }
              }} style={{ flex: 2, padding: '11px 0', background: S.accent, color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>등록</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 비품등록 강제 유도 모달 (거래 저장 후 is_asset=true 일 때) ── */}
      {postSaveTx && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1500, padding: 20 }}>
          <div style={{ background: S.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🏷️</div>
            <div style={{ fontSize: 16, fontWeight: 900, textAlign: 'center', marginBottom: 8 }}>비품 등록이 필요합니다</div>
            <div style={{ fontSize: 13, color: S.sub, textAlign: 'center', lineHeight: 1.6, marginBottom: 20 }}>
              거래가 등록되었습니다.<br />
              <strong style={{ color: S.text }}>{postSaveTx._formDescription}</strong>{' '}
              <strong style={{ color: S.yellow }}>{Number(postSaveTx._formAmount||0).toLocaleString()}원</strong><br />
              비품 등록 후 스티커를 출력해야 합니다.
            </div>
            <div style={{ background: S.surface2, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: S.sub, marginBottom: 20 }}>
              ⚠️ 비품 등록을 완료해야 구글시트에 <strong style={{ color: S.green }}>비품등록완료</strong>로 표시됩니다.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => {
                const tx = postSaveTx;
                setPostSaveTx(null);
                setModal('asset');
                setAssetReceiptSearch(''); setAssetReceiptOpen(false);
                if (allReceipts.length === 0) api.get('/accounting/receipts/list').then(r => setAllReceipts(r.data.data || [])).catch(() => {});
                setForm({
                  purchase_date: tx._formDate || today,
                  name: tx._formDescription || '',
                  unit_price: tx._formAmount || 0,
                  quantity: 1,
                  status: '사용중',
                  location: '선거사무소 본소',
                  transaction_id: tx.id,
                  accounted: true,
                });
              }} style={{
                width: '100%', padding: '13px 0', background: '#7c3aed', color: '#fff',
                border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer'
              }}>🏷️ 지금 비품 등록하기 (필수)</button>
              <button onClick={() => setPostSaveTx(null)} style={{
                width: '100%', padding: '8px 0', background: 'transparent', color: S.muted,
                border: 'none', fontSize: 11, cursor: 'pointer', textDecoration: 'underline'
              }}>나중에 하기 (비품 미등록 상태로 유지됨)</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 스티커 인쇄 모달 ── */}
      {stickerTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 500, color: '#111', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 16, color: '#111' }}>
              🏷️ 스티커 미리보기 {stickerTarget === 'all' ? `(전체 ${assets.length}개)` : ''}
            </div>
            {/* 스티커 영역 */}
            <div id="sticker-print-area">
              {(stickerTarget === 'all' ? assets : [stickerTarget]).map(a => (
                <div key={a.id} style={{
                  border: '2px solid #111', borderRadius: 8, padding: '14px 18px', marginBottom: 12,
                  fontFamily: "'Noto Sans KR', sans-serif", pageBreakInside: 'avoid'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#555' }}>홍성훈 선거사무소</div>
                    <div style={{ fontSize: 11, color: '#888' }}>제9회 지방선거</div>
                  </div>
                  <div style={{ borderTop: '1px solid #ccc', paddingTop: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 900, background: '#111', color: '#fff', padding: '2px 10px', borderRadius: 4 }}>{a.asset_no}</span>
                      <span style={{ fontSize: 16, fontWeight: 900 }}>{a.name}</span>
                    </div>
                    <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                      <tbody>
                        <tr><td style={{ color: '#555', paddingRight: 12, paddingBottom: 2 }}>수 량</td><td style={{ fontWeight: 700 }}>{a.quantity}개</td><td style={{ color: '#555', paddingRight: 12, paddingLeft: 16 }}>단 가</td><td style={{ fontWeight: 700 }}>{(a.unit_price||0).toLocaleString()}원</td></tr>
                        <tr><td style={{ color: '#555', paddingRight: 12, paddingBottom: 2 }}>합 계</td><td style={{ fontWeight: 700, color: '#d00' }}>{(a.total_amount||0).toLocaleString()}원</td><td style={{ color: '#555', paddingRight: 12, paddingLeft: 16 }}>구매일</td><td style={{ fontWeight: 700 }}>{a.purchase_date}</td></tr>
                        <tr><td style={{ color: '#555', paddingRight: 12 }}>구매처</td><td colSpan={3} style={{ fontWeight: 700 }}>{a.vendor||'-'}</td></tr>
                        <tr><td style={{ color: '#555', paddingRight: 12 }}>비치장소</td><td colSpan={3} style={{ fontWeight: 700 }}>{a.location}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button onClick={() => setStickerTarget(null)} style={{ flex: 1, padding: '11px 0', background: '#eee', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>닫기</button>
              <button onClick={() => {
                const printWin = window.open('', '_blank');
                const area = document.getElementById('sticker-print-area').innerHTML;
                printWin.document.write(`
                  <html><head><title>비품 스티커</title>
                  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap" rel="stylesheet">
                  <style>
                    body { font-family:'Noto Sans KR',sans-serif; margin: 20px; background:#fff; }
                    @media print { @page { margin: 10mm; } body { margin: 0; } }
                  </style></head>
                  <body>${area}</body></html>
                `);
                printWin.document.close();
                printWin.focus();
                setTimeout(() => { printWin.print(); printWin.close(); }, 500);
              }} style={{ flex: 2, padding: '11px 0', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>🖨️ 인쇄하기</button>
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

// ── 영수증 탭 컴포넌트 ─────────────────────────────────────
function ReceiptTab({ allReceipts, dlFrom, dlTo, setDlFrom, setDlTo, dlLoading, onDownload }) {
  const S2 = { bg:'#0a0e1a', surface:'#111827', surface2:'#1a2236', border:'1px solid #1e2d45', accent:'#1e6bff', green:'#10b981', red:'#ef4444', sub:'#8896b3', muted:'#4a5878', text:'#e8edf5' };

  // ocr_date 기준으로 날짜 그룹핑
  const grouped = allReceipts.reduce((acc, r) => {
    const d = r.ocr_date ? String(r.ocr_date).split('T')[0] : null;
    const key = d || '날짜 미인식';
    if (!acc[key]) acc[key] = [];
    acc[key].push(r);
    return acc;
  }, {});
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  async function downloadDay(date) {
    if (date === '날짜 미인식') return;
    try {
      const r = await (await import('../utils/api')).api.get(
        `/accounting/receipts/download?from=${date}&to=${date}`,
        { responseType: 'blob' }
      );
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url;
      a.download = `영수증_${date}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 범위 다운로드 */}
      <div style={{ background: S2.surface, border: S2.border, borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>📦 기간별 ZIP 다운로드</div>
        <div style={{ fontSize: 11, color: S2.sub, marginBottom: 8 }}>영수증에 기재된 날짜 기준으로 다운로드</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: S2.sub, marginBottom: 3 }}>시작일</div>
            <input type="date" value={dlFrom} onChange={e => setDlFrom(e.target.value)}
              style={{ width:'100%', background:'#1a2236', border:'1px solid #1e2d45', borderRadius:8, padding:'8px 10px', color:'#e8edf5', fontSize:13, boxSizing:'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: S2.sub, marginBottom: 3 }}>종료일</div>
            <input type="date" value={dlTo} onChange={e => setDlTo(e.target.value)}
              style={{ width:'100%', background:'#1a2236', border:'1px solid #1e2d45', borderRadius:8, padding:'8px 10px', color:'#e8edf5', fontSize:13, boxSizing:'border-box' }} />
          </div>
        </div>
        <button onClick={onDownload} disabled={dlLoading || !dlFrom || !dlTo} style={{
          width:'100%', padding:'10px 0', background: (!dlFrom||!dlTo) ? S2.muted : '#065f46',
          color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13,
          cursor: (!dlFrom||!dlTo) ? 'default' : 'pointer', opacity: dlLoading ? 0.6 : 1,
          fontFamily:"'Noto Sans KR',sans-serif"
        }}>{dlLoading ? '다운로드 중...' : '📦 ZIP으로 다운로드'}</button>
      </div>

      {/* 날짜별 목록 */}
      <div style={{ fontSize: 12, fontWeight: 700, color: S2.sub }}>{allReceipts.length}개 영수증 (날짜별)</div>

      {sortedDates.map(date => (
        <div key={date} style={{ background: S2.surface, border: S2.border, borderRadius: 12, overflow: 'hidden' }}>
          {/* 날짜 헤더 */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background: S2.surface2 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {date === '날짜 미인식' ? '📋 날짜 미인식' : `📅 ${date}`}
              <span style={{ fontSize: 11, color: S2.sub, marginLeft: 8 }}>{grouped[date].length}건</span>
            </div>
            {date !== '날짜 미인식' && (
              <button onClick={() => downloadDay(date)} style={{
                padding:'4px 12px', background:'#065f46', color:'#fff',
                border:'none', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer',
                fontFamily:"'Noto Sans KR',sans-serif"
              }}>⬇ 다운로드</button>
            )}
          </div>

          {/* 영수증 목록 */}
          {grouped[date].map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderTop:'1px solid #1e2d45' }}>
              {(r.gcs_url || r.image_url) ? (
                <img src={r.gcs_url || r.image_url} alt="영수증"
                  style={{ width:44, height:44, objectFit:'cover', borderRadius:6, background:S2.surface2, flexShrink:0 }}
                  onError={e => { e.target.style.display='none'; }} />
              ) : (
                <div style={{ width:44, height:44, borderRadius:6, background:S2.surface2, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:20 }}>🧾</div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {r.note || r.ocr_vendor || '업체 미인식'}
                  {r.ocr_amount ? <span style={{ color:S2.green, marginLeft:6 }}>{r.ocr_amount.toLocaleString()}원</span> : null}
                </div>
                <div style={{ fontSize:10, color:S2.sub }}>
                  {r.uploader_name || '알수없음'}
                  {r.ocr_receipt_type ? ` · ${r.ocr_receipt_type}` : ''}
                  {r.status === 'PROCESSED' ? <span style={{ color:S2.green, marginLeft:4 }}>✓ 처리완료</span> : <span style={{ color:'#ffa502', marginLeft:4 }}>⏳ 미처리</span>}
                  {r.gcs_url && <span style={{ color:S2.green, marginLeft:4 }}>☁</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}

      {allReceipts.length === 0 && (
        <div style={{ textAlign:'center', color:S2.muted, padding:40, fontSize:13 }}>영수증 없음</div>
      )}
    </div>
  );
}

function ReceiptAttach({ preview, file, inputRef, onSelect, onClear }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8896b3', marginBottom: 4 }}>영수증 첨부 (선택)</div>
      {preview ? (
        <div style={{ position: 'relative' }}>
          <img src={preview} alt="영수증"
            style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, background: '#1a2236', display: 'block' }} />
          <button onClick={onClear} style={{
            position: 'absolute', top: 6, right: 6,
            background: 'rgba(0,0,0,0.65)', color: '#fff', border: 'none',
            borderRadius: '50%', width: 26, height: 26, cursor: 'pointer',
            fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>✕</button>
          <div style={{ fontSize: 10, color: '#8896b3', marginTop: 4 }}>📎 {file?.name}</div>
        </div>
      ) : (
        <div onClick={() => inputRef.current?.click()} style={{
          border: '2px dashed #2a3a55', borderRadius: 8, padding: '14px 0',
          textAlign: 'center', cursor: 'pointer', color: '#4a5878', fontSize: 12
        }}>
          📷 탭하여 영수증 사진 첨부
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*,.heic" capture="environment"
        onChange={onSelect} style={{ display: 'none' }} />
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#8896b3', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function toKorean(n) {
  if (!n || isNaN(n) || parseInt(n) === 0) return '';
  const num = parseInt(n);
  const d = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const p = ['', '십', '백', '천'];
  function group(x) {
    if (x === 0) return '';
    let r = '';
    [Math.floor(x/1000)%10, Math.floor(x/100)%10, Math.floor(x/10)%10, x%10].forEach((v, i) => {
      if (v === 0) return;
      r += (v === 1 && i > 0 ? '' : d[v]) + p[3 - i];
    });
    return r;
  }
  const jo = Math.floor(num / 1e12);
  const eok = Math.floor((num % 1e12) / 1e8);
  const man = Math.floor((num % 1e8) / 1e4);
  const rest = num % 1e4;
  let r = '';
  if (jo)   r += group(jo) + '조 ';
  if (eok)  r += group(eok) + '억 ';
  if (man)  r += group(man) + '만 ';
  if (rest) r += group(rest);
  return r.trim() + '원';
}

function AmountInput({ value, onChange }) {
  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          type="number"
          placeholder="0"
          value={value || ''}
          onChange={onChange}
          style={{ ...{ width:'100%', background:'#1a2236', border:'1px solid #1e2d45', borderRadius:8, padding:'9px 12px', color:'#e8edf5', fontSize:15, fontFamily:"'Noto Sans KR',sans-serif", outline:'none', boxSizing:'border-box', fontWeight:700 } }}
        />
      </div>
      {value > 0 && (
        <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#10b981', fontWeight: 700 }}>{Number(value).toLocaleString()}원</span>
          <span style={{ fontSize: 11, color: '#8896b3' }}>({toKorean(value)})</span>
        </div>
      )}
    </div>
  );
}
