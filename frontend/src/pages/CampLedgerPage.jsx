import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';

const S = {
  bg:'#0a0e1a', surface:'#111827', surface2:'#1a2236', border:'1px solid #1e2d45',
  accent:'#1e6bff', green:'#10b981', red:'#ef4444', yellow:'#ffa502',
  text:'#e8edf5', sub:'#8896b3', muted:'#4a5878',
};

const TABS = [
  { key: 'bank', label: '후통장' },
  { key: 'kk',   label: '후현금(KK)' },
  { key: 'sy',   label: '후현금(SY)' },
];

const API = '/camp-ledger';

export default function CampLedgerPage() {
  const user = useAuthStore(s => s.user);
  const isAccountant = ['admin','accountant'].includes(user?.role);

  const [tab, setTab] = useState('bank');
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ income: 0, expense: 0, balance: 0 });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [previewImg, setPreviewImg] = useState(null);

  // 입력 폼
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0,10), type: 'expense', amount: '', description: '', note: '' });
  const fileRef = useRef(null);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);

  const toast = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        api.get(`${API}/${tab}`),
        api.get(`${API}/summary/${tab}`),
      ]);
      setRows(listRes.data.data || []);
      setSummary(sumRes.data.data || { income:0, expense:0, balance:0 });
    } catch { setRows([]); setSummary({ income:0, expense:0, balance:0 }); }
    finally { setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setReceiptFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!form.amount || parseInt(form.amount) <= 0) return toast('금액을 입력하세요');
    if (!form.description) return toast('내용을 입력하세요');
    try {
      const fd = new FormData();
      fd.append('date', form.date);
      fd.append('type', form.type);
      fd.append('amount', form.amount);
      fd.append('description', form.description);
      fd.append('note', form.note || '');
      fd.append('has_receipt', receiptFile ? 'true' : 'false');
      if (receiptFile) fd.append('receipt', receiptFile);

      await api.post(`${API}/${tab}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast('등록 완료');
      setForm({ date: new Date().toISOString().slice(0,10), type: 'expense', amount: '', description: '', note: '' });
      setReceiptFile(null); setReceiptPreview(null);
      if (fileRef.current) fileRef.current.value = '';
      setShowForm(false);
      load();
    } catch (e) { toast('등록 실패: ' + (e.response?.data?.message || e.message)); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    try {
      await api.delete(`${API}/${tab}/${id}`);
      toast('삭제 완료'); load();
    } catch { toast('삭제 실패'); }
  };

  const baseUrl = (api.defaults?.baseURL || '').replace(/\/api\/v1$/, '');

  if (!isAccountant) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:S.sub, fontSize:14 }}>
      회계 권한이 필요합니다
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:S.bg, overflow:'hidden' }}>
      {/* 헤더 */}
      <div style={{ background:S.surface, borderBottom:S.border, padding:'12px 16px', flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontSize:15, fontWeight:700, color:S.text }}>💰 캠프 실비 장부</div>
          {isAccountant && (
            <button onClick={() => setShowForm(!showForm)} style={{
              padding:'7px 14px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer',
              background: showForm ? S.red : S.accent, color:'#fff',
            }}>{showForm ? '취소' : '+ 입력'}</button>
          )}
        </div>

        {/* 탭 */}
        <div style={{ display:'flex', gap:6 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowForm(false); }} style={{
              flex:1, padding:'7px 0', fontSize:12, fontWeight:700, borderRadius:8, cursor:'pointer',
              background: tab === t.key ? 'linear-gradient(135deg,#1e6bff,#0047cc)' : S.surface2,
              color: tab === t.key ? '#fff' : S.sub,
              border: tab === t.key ? 'none' : S.border,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* 요약 카드 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, padding:'12px 16px', flexShrink:0 }}>
        <div style={{ background:S.surface, border:S.border, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:S.sub }}>총수입</div>
          <div style={{ fontSize:15, fontWeight:900, color:S.green }}>{summary.income.toLocaleString()}</div>
        </div>
        <div style={{ background:S.surface, border:S.border, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:S.sub }}>총지출</div>
          <div style={{ fontSize:15, fontWeight:900, color:S.red }}>{summary.expense.toLocaleString()}</div>
        </div>
        <div style={{ background: summary.balance >= 0 ? '#0d1f0d' : '#2a0a0a', border: `1px solid ${summary.balance >= 0 ? '#10b98144' : '#ef444444'}`, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:10, color:S.sub }}>현재 잔액</div>
          <div style={{ fontSize:15, fontWeight:900, color: summary.balance >= 0 ? S.green : S.red }}>{summary.balance.toLocaleString()}</div>
        </div>
      </div>

      {/* 입력 폼 */}
      {showForm && (
        <div style={{ padding:'0 16px 12px', flexShrink:0 }}>
          <div style={{ background:S.surface, border:S.border, borderRadius:12, padding:14, display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>날짜</div>
                <input type="date" value={form.date} onChange={e => setForm(f => ({...f, date:e.target.value}))} style={inputStyle} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>구분</div>
                <select value={form.type} onChange={e => setForm(f => ({...f, type:e.target.value}))} style={inputStyle}>
                  <option value="expense">지출</option>
                  <option value="income">수입</option>
                </select>
              </div>
            </div>

            <div>
              <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>금액 (원)</div>
              <input type="number" placeholder="금액 입력" value={form.amount} onChange={e => setForm(f => ({...f, amount:e.target.value}))} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>내용</div>
              <input type="text" placeholder="사용 내역" value={form.description} onChange={e => setForm(f => ({...f, description:e.target.value}))} style={inputStyle} />
            </div>

            <div>
              <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>비고</div>
              <input type="text" placeholder="비고 (선택)" value={form.note} onChange={e => setForm(f => ({...f, note:e.target.value}))} style={inputStyle} />
            </div>

            {/* 영수증 첨부 */}
            <div>
              <div style={{ fontSize:10, color:S.sub, marginBottom:3 }}>영수증 첨부</div>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <button onClick={() => fileRef.current?.click()} style={{
                  padding:'6px 14px', fontSize:11, fontWeight:600, borderRadius:6, cursor:'pointer',
                  background:S.surface2, color:S.sub, border:S.border,
                }}>📎 파일 선택</button>
                {receiptPreview && (
                  <img src={receiptPreview} alt="미리보기" style={{ width:40, height:40, objectFit:'cover', borderRadius:6, border:S.border }} />
                )}
                {receiptFile && <span style={{ fontSize:10, color:S.green }}>✓ {receiptFile.name}</span>}
                <input ref={fileRef} type="file" accept="image/*,.pdf" onChange={handleFileSelect} style={{ display:'none' }} />
              </div>
            </div>

            <button onClick={handleSubmit} style={{
              padding:'11px 0', fontSize:13, fontWeight:700, borderRadius:10, border:'none', cursor:'pointer',
              background:'linear-gradient(135deg,#1e6bff,#0047cc)', color:'#fff', marginTop:4,
            }}>등록하기</button>
          </div>
        </div>
      )}

      {/* 거래 목록 */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 16px 80px' }}>
        {loading ? (
          <div style={{ textAlign:'center', color:S.sub, padding:40 }}>불러오는 중...</div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign:'center', color:S.muted, padding:60 }}>
            <div style={{ fontSize:36, marginBottom:8 }}>📭</div>
            <div style={{ fontSize:13 }}>등록된 내역이 없습니다</div>
          </div>
        ) : rows.map(r => (
          <div key={r.id} style={{
            background:S.surface, border:S.border, borderRadius:10,
            padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:10,
          }}>
            {/* 수입/지출 아이콘 */}
            <div style={{
              width:36, height:36, borderRadius:8, flexShrink:0,
              background: r.type === 'income' ? '#0d2818' : '#2a0a0a',
              border: `1px solid ${r.type === 'income' ? '#10b98144' : '#ef444444'}`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
            }}>{r.type === 'income' ? '📥' : '📤'}</div>

            {/* 내용 */}
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                <span style={{ fontSize:13, fontWeight:700, color:S.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description || '-'}</span>
                {r.has_receipt && (
                  <span onClick={() => {
                    if (r.receipt_path) setPreviewImg(baseUrl + r.receipt_path);
                  }} style={{
                    fontSize:9, background:'#10b98122', color:S.green, padding:'1px 5px',
                    borderRadius:4, cursor: r.receipt_path ? 'pointer' : 'default', fontWeight:600,
                  }}>🧾영수증</span>
                )}
              </div>
              <div style={{ fontSize:10, color:S.muted }}>
                {r.date} · {r.created_by_name || ''}{r.note ? ` · ${r.note}` : ''}
              </div>
            </div>

            {/* 금액 */}
            <div style={{ textAlign:'right', flexShrink:0 }}>
              <div style={{
                fontSize:14, fontWeight:900,
                color: r.type === 'income' ? S.green : S.red,
              }}>{r.type === 'income' ? '+' : '-'}{r.amount.toLocaleString()}</div>
            </div>

            {/* 삭제 */}
            {isAccountant && (
              <button onClick={() => handleDelete(r.id)} style={{
                background:'none', border:'none', color:S.muted, cursor:'pointer', fontSize:14, padding:4, flexShrink:0,
              }}>🗑️</button>
            )}
          </div>
        ))}
      </div>

      {/* 영수증 미리보기 모달 */}
      {previewImg && (
        <div onClick={() => setPreviewImg(null)} style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.9)', zIndex:2000,
          display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
        }}>
          <img src={previewImg} alt="영수증" style={{
            maxWidth:'90%', maxHeight:'85vh', objectFit:'contain', borderRadius:8,
          }} onError={() => { setPreviewImg(null); toast('이미지를 불러올 수 없습니다'); }} />
          <div style={{ position:'absolute', top:20, right:20, color:'#fff', fontSize:24, cursor:'pointer' }}>✕</div>
        </div>
      )}

      {/* 토스트 */}
      {msg && (
        <div style={{
          position:'fixed', bottom:80, left:'50%', transform:'translateX(-50%)',
          background:S.surface, border:S.border, borderRadius:10,
          padding:'10px 20px', fontSize:13, color:S.text, zIndex:9999,
          boxShadow:'0 4px 20px rgba(0,0,0,0.5)',
        }}>{msg}</div>
      )}
    </div>
  );
}

const inputStyle = {
  width:'100%', background:'#1a2236', border:'1px solid #1e2d45',
  borderRadius:8, padding:'9px 12px', color:'#e8edf5',
  fontSize:13, fontFamily:"'Noto Sans KR',sans-serif", outline:'none', boxSizing:'border-box',
};
