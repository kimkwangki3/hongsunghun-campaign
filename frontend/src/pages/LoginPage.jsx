// src/pages/LoginPage.jsx — Agent: FRONTEND
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/stores';
import { api } from '../utils/api';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore(s => s.setAuth);
  const [mode, setMode] = useState('login'); // login | register
  const [form, setForm] = useState({ name: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = { name: form.name, password: form.password };
      const res = await api.post(endpoint, payload);
      const { token, user } = res.data.data;
      setAuth(token, user);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#0d0d1a',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 20px',
      fontFamily: "'Noto Sans KR', sans-serif"
    }}>
      {/* 배경 글로우 */}
      <div style={{
        position: 'fixed', top: '20%', left: '50%', transform: 'translateX(-50%)',
        width: 300, height: 300, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(79,70,229,0.15) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* 로고 */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: 20,
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 900, color: '#fff',
          margin: '0 auto 16px',
          boxShadow: '0 0 40px rgba(79,70,229,0.4)'
        }}>홍</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: '-0.5px' }}>홍성훈 캠프</div>
        <div style={{ fontSize: 13, color: '#6060a0', marginTop: 4 }}>조국혁신당 · 신대지구 전라남도의원</div>
      </div>

      {/* 폼 카드 */}
      <div style={{
        width: '100%', maxWidth: 400,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 20, padding: '28px 24px'
      }}>
        {/* 탭 */}
        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.05)',
          borderRadius: 10, padding: 4, marginBottom: 24
        }}>
          {['login', 'register'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 7, border: 'none',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
                transition: 'all 0.2s',
                background: mode === m ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'none',
                color: mode === m ? '#fff' : '#6060a0',
                fontFamily: "'Noto Sans KR', sans-serif"
              }}>
              {m === 'login' ? '로그인' : '가입'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input label="이름" value={form.name} onChange={update('name')} placeholder="홍길동" />
          <Input label="비밀번호 (6자리 이하)" value={form.password} onChange={update('password')} placeholder="••••••" type="password" maxLength={6} />

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5'
            }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            marginTop: 8, padding: '14px', borderRadius: 12, border: 'none',
            background: loading ? '#2a2a4a' : 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: "'Noto Sans KR', sans-serif",
            boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.4)',
            transition: 'all 0.2s'
          }}>
            {loading ? '처리 중...' : (mode === 'login' ? '입장하기' : '캠프 합류')}
          </button>
        </form>
      </div>

      <div style={{ marginTop: 20, fontSize: 12, color: '#3a3a5a', textAlign: 'center' }}>
        🔒 캠프원 전용 채팅 시스템
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#8080b0', marginBottom: 6, display: 'block' }}>{label}</label>
      <input {...props} style={{
        width: '100%', padding: '12px 14px', borderRadius: 10,
        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
        color: '#e0e0ff', fontSize: 14, outline: 'none',
        fontFamily: "'Noto Sans KR', sans-serif",
        transition: 'border-color 0.2s',
        boxSizing: 'border-box'
      }}
        onFocus={e => e.target.style.borderColor = 'rgba(129,140,248,0.5)'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      />
    </div>
  );
}
