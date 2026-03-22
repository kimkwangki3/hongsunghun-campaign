import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [uploadNote, setUploadNote] = useState('');

  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  async function handleSheetsSync() {
    setSyncLoading(true);
    try {
      const r = await api.post('/accounting/sheets/sync');
      const d = r.data.data;
      toast(`✅ 동기화 완료 — 거래 ${d.tx}건 · 영수증 ${d.receipts}건 · 수당 ${d.staff}건`);
    } catch (e) {
      toast(`❌ ${e.response?.data?.message || '동기화 실패'}`);
    } finally { setSyncLoading(false); }
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

  useEffect(() => { loadSummary(); loadRecentReceipts(); loadPendingReceipts(); }, [loadSummary, loadRecentReceipts, loadPendingReceipts]);
  useEffect(() => {
    if (!isAccountant) return;
    api.get('/accounting/sheets/url').then(r => {
      if (r.data.data?.url) setSheetUrl(r.data.data.url);
    }).catch(() => {});
  }, [isAccountant]);
  useEffect(() => {
    if (tab === 0) { loadSummary(); loadRecentReceipts(); loadPendingReceipts(); }
    if (tab === 1) loadTransactions();
    if (tab === 2 && isAccountant) api.get('/accounting/sms?status=PENDING').then(r => setSmsList(r.data.data || [])).catch(() => {});
    if (tab === 3 && isAccountant) {
      api.get('/accounting/sponsor/income').then(r => setSponsorIncome(r.data.data || [])).catch(() => {});
      api.get('/accounting/sponsor/expense').then(r => setSponsorExpense(r.data.data || [])).catch(() => {});
    }
    if (tab === 4 && isAccountant) api.get('/accounting/staff').then(r => setStaff(r.data.data || [])).catch(() => {});
  }, [tab, isAccountant, loadSummary, loadTransactions, loadPendingReceipts]);

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
      await api.post(url, { ...form, ...(receiptId ? { receipt_id: receiptId } : {}) });
      toast('✅ 등록 완료');
      setModal(null); setForm({}); clearModalReceipt();
      if (modal === 'tx') { loadTransactions(); loadSummary(); loadPendingReceipts(); loadRecentReceipts(); }
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

            {/* 미처리 영수증 (회계담당/관리자) */}
            {isAccountant && pendingReceipts.length > 0 && (
              <Card style={{ border: '1px solid #ffa50244', background: '#1a1500' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: S.yellow }}>
                    🧾 미처리 영수증 ({pendingReceipts.length}건)
                  </div>
                  <div style={{ fontSize: 10, color: S.muted }}>탭하여 거래 등록</div>
                </div>
                {pendingReceipts.map(r => (
                  <div key={r.id} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '10px 0', borderBottom: `1px solid ${S.surface2}`
                  }}>
                    {/* 썸네일 */}
                    <div style={{ flexShrink: 0 }}>
                      {(r.gcs_url || r.image_url) ? (
                        <img
                          src={r.gcs_url || r.image_url}
                          alt="영수증"
                          style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 6, background: S.surface2 }}
                          onError={e => { e.target.style.display='none'; }}
                        />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 6, background: S.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🧾</div>
                      )}
                    </div>
                    {/* 정보 */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: S.text, marginBottom: 2 }}>
                        {r.note || r.ocr_vendor || '설명 없음'}
                      </div>
                      <div style={{ fontSize: 10, color: S.sub, marginBottom: 4 }}>
                        {r.uploader_name || '알수없음'} · {r.uploaded_at ? new Date(r.uploaded_at).toLocaleDateString('ko-KR') : ''}
                        {r.ocr_amount ? <span style={{ color: S.green, marginLeft: 4 }}>  {r.ocr_amount.toLocaleString()}원</span> : null}
                        {r.ocr_vendor && r.note ? <span style={{ color: S.muted, marginLeft: 4 }}>({r.ocr_vendor})</span> : null}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                        {r.ocr_receipt_type && <Badge color={S.muted}>{r.ocr_receipt_type}</Badge>}
                        {r.category_suggestion && <Badge color={S.accent}>{r.category_suggestion}</Badge>}
                      </div>
                      <button
                        onClick={() => {
                          setModal('tx');
                          setForm({
                            date: r.ocr_date || today,
                            type: 'expense',
                            cost_type: 'election_cost',
                            category: r.category_suggestion || '',
                            amount: r.ocr_amount || '',
                            description: r.note || r.ocr_vendor || '',
                            receipt_id: r.id,
                          });
                        }}
                        style={{
                          padding: '5px 14px', background: S.accent, color: '#fff',
                          border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          cursor: 'pointer', fontFamily: "'Noto Sans KR',sans-serif"
                        }}
                      >+ 거래 등록</button>
                    </div>
                  </div>
                ))}
              </Card>
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

            {/* 영수증 날짜별 다운로드 (회계담당/관리자) */}
            {isAccountant && (
              <Card>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>📥 영수증 ZIP 다운로드</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: S.sub, marginBottom: 3 }}>시작일</div>
                    <input type="date" value={dlFrom} onChange={e => setDlFrom(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: S.sub, marginBottom: 3 }}>종료일</div>
                    <input type="date" value={dlTo} onChange={e => setDlTo(e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <button onClick={handleDownloadReceipts} disabled={dlLoading || !dlFrom || !dlTo} style={{
                  width: '100%', padding: '10px 0',
                  background: dlLoading ? S.muted : '#065f46',
                  color: '#fff', border: 'none', borderRadius: 8,
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  opacity: (!dlFrom || !dlTo) ? 0.5 : 1,
                  fontFamily: "'Noto Sans KR',sans-serif"
                }}>
                  {dlLoading ? '다운로드 중...' : '📦 ZIP으로 다운로드'}
                </button>
                <div style={{ fontSize: 10, color: S.muted, marginTop: 6, lineHeight: 1.5 }}>
                  원본 영수증은 Google Cloud에도 자동 백업됩니다
                </div>
              </Card>
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
                <ReceiptAttach
                  preview={modalReceiptPreview}
                  file={modalReceiptFile}
                  inputRef={modalReceiptRef}
                  onSelect={handleModalReceiptSelect}
                  onClear={clearModalReceipt}
                />
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
              <button onClick={() => { setModal(null); setForm({}); clearModalReceipt(); }} style={{
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
