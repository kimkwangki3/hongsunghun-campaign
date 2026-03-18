import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';

const inputSt = {
  width:'100%', padding:'11px 14px', borderRadius:10,
  background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)',
  color:'#e0e0ff', fontSize:14, outline:'none',
  fontFamily:"'Noto Sans KR', sans-serif", boxSizing:'border-box'
};

export default function AdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [members, setMembers] = useState([]);
  const [broadcast, setBroadcast] = useState({ title:'', body:'' });
  const [resultMsg, setResultMsg] = useState('');
  const [activeTab, setActiveTab] = useState('members');

  useEffect(() => {
    api.get('/chat/members').then(r => setMembers(r.data.data));
  }, []);

  if (user?.role !== 'admin') {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
        height:'100%', flexDirection:'column', gap:8, color:'#ef4444' }}>
        <div style={{ fontSize:40 }}>🔒</div>
        <div style={{ fontSize:14 }}>관리자만 접근 가능합니다</div>
      </div>
    );
  }

  async function sendBroadcast(e) {
    e.preventDefault();
    if (!broadcast.title.trim() || !broadcast.body.trim()) return;
    try {
      const r = await api.post('/notification/broadcast', { ...broadcast, type:'urgent' });
      setResultMsg('✅ ' + r.data.message);
      setBroadcast({ title:'', body:'' });
    } catch(err) {
      setResultMsg('❌ ' + (err.response?.data?.message || '발송 실패'));
    }
    setTimeout(() => setResultMsg(''), 5000);
  }

  const TABS = [['members','👥 멤버'],['broadcast','🚨 긴급공지']];

  return (
    <div style={{ height:'100%', overflowY:'auto', padding:'16px',
      fontFamily:"'Noto Sans KR', sans-serif" }}>

      <div style={{ fontSize:18, fontWeight:700, color:'#e0e0f8', marginBottom:16 }}>
        ⚙️ 관리자 패널
      </div>

      {/* 회원 관리 바로가기 */}
      <button onClick={() => navigate('/admin/members')} style={{
        width:'100%', padding:'14px 16px', borderRadius:12, border:'none',
        background:'rgba(129,140,248,0.1)', cursor:'pointer', marginBottom:16,
        display:'flex', alignItems:'center', justifyContent:'space-between',
        fontFamily:"'Noto Sans KR', sans-serif"
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>👥</span>
          <div style={{ textAlign:'left' }}>
            <div style={{ fontSize:14, fontWeight:600, color:'#818cf8' }}>회원 관리</div>
            <div style={{ fontSize:11, color:'#50507a', marginTop:1 }}>역할 변경 · 회원 삭제</div>
          </div>
        </div>
        <span style={{ color:'#818cf8', fontSize:18 }}>›</span>
      </button>

      {/* 탭 */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {TABS.map(([k,l]) => (
          <button key={k} onClick={() => setActiveTab(k)} style={{
            padding:'7px 18px', borderRadius:20, border:'none', cursor:'pointer',
            background: activeTab===k ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.05)',
            color: activeTab===k ? '#818cf8' : '#60608a',
            fontSize:13, fontWeight: activeTab===k ? 700 : 400,
            outline: activeTab===k ? '1px solid rgba(129,140,248,0.35)' : 'none',
            fontFamily:"'Noto Sans KR', sans-serif"
          }}>{l}</button>
        ))}
      </div>

      {/* 멤버 목록 */}
      {activeTab === 'members' && (
        <div>
          <div style={{ fontSize:12, color:'#50507a', marginBottom:10 }}>
            전체 캠프원 {members.length}명
          </div>
          {members.map(m => {
            const roleColor = m.role==='admin' ? '#f59e0b' : m.role==='member' ? '#818cf8' : '#50507a';
            const roleLabel = m.role==='admin' ? '관리자' : m.role==='member' ? '캠프원' : '뷰어';
            return (
              <div key={m.id} style={{
                display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'12px 14px', marginBottom:8,
                background:'rgba(255,255,255,0.03)',
                border:'1px solid rgba(255,255,255,0.06)', borderRadius:10
              }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{
                    width:36, height:36, borderRadius:'50%',
                    background:'linear-gradient(135deg, #4f46e5, #7c3aed)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:15, fontWeight:700, color:'#fff', flexShrink:0
                  }}>{m.name[0]}</div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#d0d0f0' }}>{m.name}</div>
                    <div style={{ fontSize:11, color:'#40406a' }}>
                      가입일: {new Date(m.created_at * 1000).toLocaleDateString('ko-KR')}
                    </div>
                  </div>
                </div>
                <span style={{
                  fontSize:11, padding:'3px 10px', borderRadius:10, fontWeight:600,
                  background: roleColor + '20', color: roleColor
                }}>{roleLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 긴급 공지 */}
      {activeTab === 'broadcast' && (
        <form onSubmit={sendBroadcast} style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{
            background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)',
            borderRadius:10, padding:'12px 14px', fontSize:12, color:'#fca5a5', lineHeight:1.6
          }}>
            🚨 긴급 공지는 모든 캠프원 기기에 즉시 푸시 알림으로 발송됩니다.<br/>
            신중하게 사용하세요.
          </div>

          <div>
            <label style={{ fontSize:12, color:'#6060a0', marginBottom:6, display:'block' }}>제목</label>
            <input value={broadcast.title}
              onChange={e => setBroadcast(b => ({...b, title:e.target.value}))}
              placeholder="긴급 공지 제목" style={inputSt} />
          </div>

          <div>
            <label style={{ fontSize:12, color:'#6060a0', marginBottom:6, display:'block' }}>내용</label>
            <textarea value={broadcast.body}
              onChange={e => setBroadcast(b => ({...b, body:e.target.value}))}
              placeholder="공지 내용을 입력하세요" rows={5}
              style={{ ...inputSt, resize:'none', lineHeight:1.6 }} />
          </div>

          {resultMsg && (
            <div style={{
              background: resultMsg.startsWith('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
              border: '1px solid ' + (resultMsg.startsWith('✅') ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'),
              borderRadius:8, padding:'10px 14px', fontSize:13,
              color: resultMsg.startsWith('✅') ? '#86efac' : '#fca5a5'
            }}>{resultMsg}</div>
          )}

          <button type="submit" style={{
            padding:'13px', borderRadius:12, border:'none',
            background:'linear-gradient(135deg, #ef4444, #dc2626)',
            color:'#fff', fontSize:14, fontWeight:700, cursor:'pointer',
            fontFamily:"'Noto Sans KR', sans-serif",
            boxShadow:'0 4px 16px rgba(239,68,68,0.35)'
          }}>🚨 전체 캠프원에게 발송</button>
        </form>
      )}
    </div>
  );
}
