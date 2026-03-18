// src/pages/MembersAdminPage.jsx — admin 전용 회원 관리
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';

export default function MembersAdminPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name }
  const [msg, setMsg] = useState('');

  if (user?.role !== 'admin') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', flexDirection: 'column', gap: 8, color: '#ef4444' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <div style={{ fontSize: 14 }}>관리자만 접근 가능합니다</div>
      </div>
    );
  }

  function load() {
    api.get('/auth/users')
      .then(r => setMembers(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function showMsg(text) {
    setMsg(text);
    setTimeout(() => setMsg(''), 3000);
  }

  async function changeRole(id, currentRole) {
    const newRole = currentRole === 'admin' ? 'member' : 'admin';
    try {
      await api.put(`/auth/users/${id}/role`, { role: newRole });
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role: newRole } : m));
      showMsg('✅ 역할이 변경되었습니다');
    } catch (err) {
      showMsg('❌ ' + (err.response?.data?.message || '변경 실패'));
    }
  }

  async function deleteMember() {
    if (!confirmDelete) return;
    try {
      await api.delete(`/auth/users/${confirmDelete.id}`);
      setMembers(prev => prev.filter(m => m.id !== confirmDelete.id));
      showMsg('✅ 회원이 삭제되었습니다');
    } catch (err) {
      showMsg('❌ ' + (err.response?.data?.message || '삭제 실패'));
    } finally {
      setConfirmDelete(null);
    }
  }

  const ROLE = { admin: { label: '관리자', color: '#f59e0b' }, member: { label: '캠프원', color: '#818cf8' } };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0d0d1a',
      fontFamily: "'Noto Sans KR', sans-serif" }}>

      {/* 헤더 */}
      <div style={{
        padding: '12px 16px', background: '#111127',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 20
        }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8' }}>회원 관리</div>
          <div style={{ fontSize: 11, color: '#50507a' }}>전체 {members.length}명</div>
        </div>
      </div>

      {/* 안내 메시지 */}
      {msg && (
        <div style={{
          margin: '12px 16px 0',
          background: msg.startsWith('✅') ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)',
          border: '1px solid ' + (msg.startsWith('✅') ? 'rgba(74,222,128,0.3)' : 'rgba(239,68,68,0.3)'),
          borderRadius: 10, padding: '10px 14px', fontSize: 13,
          color: msg.startsWith('✅') ? '#86efac' : '#fca5a5'
        }}>{msg}</div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#404060' }}>불러오는 중...</div>
      ) : (
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {members.map(m => {
            const role = ROLE[m.role] || { label: m.role, color: '#60608a' };
            const isSelf = m.id === user?.id;
            return (
              <div key={m.id} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, padding: '14px 16px',
                display: 'flex', alignItems: 'center', gap: 14
              }}>
                {/* 아바타 */}
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: '#fff'
                }}>{m.name[0]}</div>

                {/* 정보 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f8' }}>{m.name}</span>
                    {isSelf && <span style={{ fontSize: 10, color: '#818cf8' }}>(나)</span>}
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 8, fontWeight: 700,
                      background: role.color + '20', color: role.color
                    }}>{role.label}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#40406a', marginTop: 3 }}>
                    가입일: {new Date(m.created_at * 1000).toLocaleDateString('ko-KR')}
                    {' · '}ID: {m.id.slice(0, 8)}...
                  </div>
                </div>

                {/* 액션 버튼 */}
                {!isSelf && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => changeRole(m.id, m.role)}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'rgba(129,140,248,0.15)', color: '#818cf8',
                        fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans KR', sans-serif"
                      }}
                    >
                      {m.role === 'admin' ? '→ 캠프원' : '→ 관리자'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: m.id, name: m.name })}
                      style={{
                        padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                        background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                        fontSize: 11, fontWeight: 600, fontFamily: "'Noto Sans KR', sans-serif"
                      }}
                    >삭제</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 삭제 확인 팝업 */}
      {confirmDelete && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
        }} onClick={() => setConfirmDelete(null)}>
          <div style={{
            background: '#1a1a35', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16, padding: '24px 28px', width: 280, textAlign: 'center'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f8', marginBottom: 8 }}>
              회원 삭제
            </div>
            <div style={{ fontSize: 13, color: '#8080b0', marginBottom: 20, lineHeight: 1.6 }}>
              <span style={{ color: '#e8e8f8', fontWeight: 600 }}>{confirmDelete.name}</span> 회원을<br/>
              삭제하시겠습니까? 되돌릴 수 없습니다.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.07)', color: '#a0a0c0',
                cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14
              }}>취소</button>
              <button onClick={deleteMember} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: '#ef4444', color: '#fff',
                cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif",
                fontSize: 14, fontWeight: 700
              }}>삭제</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
