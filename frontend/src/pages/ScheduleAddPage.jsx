// src/pages/ScheduleAddPage.jsx — Agent: FRONTEND
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { format } from 'date-fns';

const CATEGORIES = [
  { value: 'campaign',     label: '🗣️ 캠프 활동' },
  { value: 'meeting',      label: '🤝 회의' },
  { value: 'election_law', label: '⚖️ 선거법 관련' },
  { value: 'etc',          label: '📌 기타' },
];

export default function ScheduleAddPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const editSchedule = location.state?.schedule || null;
  const isEdit = !!editSchedule;

  const [form, setForm] = useState(() => {
    if (editSchedule) {
      const d = new Date(editSchedule.start_at * 1000);
      return {
        title: editSchedule.title || '',
        description: editSchedule.description || '',
        location: editSchedule.location || '',
        category: editSchedule.category || 'campaign',
        startDate: format(d, 'yyyy-MM-dd'),
        startTime: format(d, 'HH:mm'),
        isImportant: !!editSchedule.is_important,
        notifyDayBefore: !!editSchedule.notify_day_before,
        notifyOnDay: !!editSchedule.notify_on_day,
      };
    }
    return {
      title: '', description: '', location: '',
      category: 'campaign',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      startTime: '10:00',
      isImportant: false,
      notifyDayBefore: true,
      notifyOnDay: true,
    };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const upd = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim()) return setError('제목을 입력하세요');
    setLoading(true); setError('');

    const startAt = Math.floor(new Date(`${form.startDate}T${form.startTime}`).getTime() / 1000);

    try {
      if (isEdit) {
        await api.put(`/schedule/${editSchedule.id}`, {
          title: form.title, description: form.description,
          location: form.location, category: form.category,
          startAt, isImportant: form.isImportant,
          notifyDayBefore: form.notifyDayBefore, notifyOnDay: form.notifyOnDay
        });
      } else {
        await api.post('/schedule', {
          title: form.title, description: form.description,
          location: form.location, category: form.category,
          startAt, isImportant: form.isImportant,
          notifyDayBefore: form.notifyDayBefore, notifyOnDay: form.notifyOnDay
        });
      }
      navigate('/schedule');
    } catch (err) {
      setError(err.response?.data?.message || (isEdit ? '수정 실패' : '등록 실패'));
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      background: '#0d0d1a', fontFamily: "'Noto Sans KR', sans-serif"
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 12,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#111127', flexShrink: 0
      }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 20 }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8' }}>{isEdit ? '일정 수정' : '일정 등록'}</span>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 제목 */}
        <Field label="제목 *">
          <input value={form.title} onChange={upd('title')} placeholder="일정 제목을 입력하세요"
            style={inputStyle} />
        </Field>

        {/* 카테고리 */}
        <Field label="분류">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setForm(f => ({ ...f, category: c.value }))}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: form.category === c.value ? 'rgba(129,140,248,0.25)' : 'rgba(255,255,255,0.05)',
                  color: form.category === c.value ? '#818cf8' : '#60608a',
                  fontSize: 13, fontWeight: form.category === c.value ? 700 : 400,
                  outline: form.category === c.value ? '1px solid rgba(129,140,248,0.4)' : 'none',
                  fontFamily: "'Noto Sans KR', sans-serif"
                }}>
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        {/* 날짜/시간 */}
        <div style={{ display: 'flex', gap: 10 }}>
          <Field label="날짜" style={{ flex: 2 }}>
            <input type="date" value={form.startDate} onChange={upd('startDate')} style={inputStyle} />
          </Field>
          <Field label="시간" style={{ flex: 1 }}>
            <input type="time" value={form.startTime} onChange={upd('startTime')} style={inputStyle} />
          </Field>
        </div>

        {/* 장소 */}
        <Field label="장소">
          <input value={form.location} onChange={upd('location')} placeholder="장소 (선택)"
            style={inputStyle} />
        </Field>

        {/* 내용 */}
        <Field label="내용">
          <textarea value={form.description} onChange={upd('description')} placeholder="상세 내용 (선택)"
            rows={3} style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }} />
        </Field>

        {/* 토글 옵션 */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: '4px 0'
        }}>
          <Toggle label="⚡ 중요 일정" desc="등록 즉시 전체 알림 발송"
            checked={form.isImportant} onChange={upd('isImportant')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 14px' }} />
          <Toggle label="📅 D-1 알림" desc="전날 오전 8시 알림"
            checked={form.notifyDayBefore} onChange={upd('notifyDayBefore')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '0 14px' }} />
          <Toggle label="🔔 당일 알림" desc="당일 오전 7시 알림"
            checked={form.notifyOnDay} onChange={upd('notifyOnDay')} />
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fca5a5'
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} style={{
          padding: '14px', borderRadius: 12, border: 'none',
          background: loading ? '#2a2a4a' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          color: '#fff', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          fontFamily: "'Noto Sans KR', sans-serif",
          boxShadow: loading ? 'none' : '0 4px 20px rgba(79,70,229,0.4)'
        }}>
          {loading ? (isEdit ? '수정 중...' : '등록 중...') : (isEdit ? '일정 수정' : '일정 등록')}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#e0e0ff', fontSize: 14, outline: 'none',
  fontFamily: "'Noto Sans KR', sans-serif", boxSizing: 'border-box'
};

function Field({ label, children, style }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 12, color: '#6060a0', marginBottom: 6, display: 'block' }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 14px', cursor: 'pointer'
    }}>
      <div>
        <div style={{ fontSize: 13, color: '#c0c0e8', fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11, color: '#50507a', marginTop: 1 }}>{desc}</div>
      </div>
      <div style={{
        width: 44, height: 24, borderRadius: 12, position: 'relative',
        background: checked ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.1)',
        transition: 'background 0.2s', flexShrink: 0
      }}>
        <div style={{
          position: 'absolute', top: 2, left: checked ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
        }} />
        <input type="checkbox" checked={checked} onChange={onChange}
          style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', margin: 0 }} />
      </div>
    </label>
  );
}
