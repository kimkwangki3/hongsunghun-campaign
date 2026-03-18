// src/pages/SchedulePage.jsx — Agent: FRONTEND
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/stores';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

const CATEGORY_META = {
  election_law: { icon: '⚖️', color: '#f59e0b', label: '선거법' },
  campaign:     { icon: '🗣️', color: '#818cf8', label: '캠프' },
  meeting:      { icon: '🤝', color: '#34d399', label: '회의' },
  etc:          { icon: '📌', color: '#a78bfa', label: '기타' },
};

const ELECTION_DAY = new Date('2026-06-03');

export default function SchedulePage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [viewDate, setViewDate] = useState(new Date());
  const [schedules, setSchedules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('calendar'); // calendar | list

  useEffect(() => {
    const y = viewDate.getFullYear();
    const m = viewDate.getMonth() + 1;
    api.get(`/schedule?year=${y}&month=${m}`).then(r => setSchedules(r.data.data));
  }, [viewDate]);

  const today = new Date();
  const dDayCount = Math.ceil((ELECTION_DAY - today) / (1000 * 60 * 60 * 24));

  const days = eachDayOfInterval({ start: startOfMonth(viewDate), end: endOfMonth(viewDate) });
  const firstDow = startOfMonth(viewDate).getDay();

  const selectedDaySchedules = selected
    ? schedules.filter(s => isSameDay(new Date(s.start_at * 1000), selected))
    : [];

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 0 80px' }}>
      {/* D-Day 배너 */}
      {dDayCount >= 0 && dDayCount <= 100 && (
        <div style={{
          margin: '0 16px 16px',
          background: 'linear-gradient(135deg, rgba(79,70,229,0.2), rgba(124,58,237,0.2))',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 14, padding: '12px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#818cf8', marginBottom: 2 }}>제9회 전국동시지방선거</div>
            <div style={{ fontSize: 13, color: '#c4c4e8' }}>2026년 6월 3일 (수)</div>
          </div>
          <div style={{
            fontSize: 28, fontWeight: 900, color: '#818cf8',
            fontVariantNumeric: 'tabular-nums'
          }}>
            {dDayCount === 0 ? '🗳️ D-Day' : `D-${dDayCount}`}
          </div>
        </div>
      )}

      {/* 뷰 토글 + 월 네비 */}
      <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['calendar', 'list'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: view === v ? 'rgba(129,140,248,0.2)' : 'none',
              color: view === v ? '#818cf8' : '#50507a',
              fontSize: 13, fontWeight: view === v ? 700 : 400,
              fontFamily: "'Noto Sans KR', sans-serif"
            }}>
              {v === 'calendar' ? '📅 달력' : '📋 목록'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setViewDate(subMonths(viewDate, 1))} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 18 }}>‹</button>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f8', minWidth: 70, textAlign: 'center' }}>
            {format(viewDate, 'yyyy년 M월')}
          </span>
          <button onClick={() => setViewDate(addMonths(viewDate, 1))} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontSize: 18 }}>›</button>
        </div>
      </div>

      {view === 'calendar' ? (
        <>
          {/* 캘린더 */}
          <div style={{ padding: '0 12px' }}>
            {/* 요일 헤더 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
              {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, color: i === 0 ? '#ef4444' : i === 6 ? '#818cf8' : '#40406a', padding: '4px 0' }}>{d}</div>
              ))}
            </div>

            {/* 날짜 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
              {days.map(day => {
                const daySchedules = schedules.filter(s => isSameDay(new Date(s.start_at * 1000), day));
                const isSelected = selected && isSameDay(day, selected);
                const isTodayDate = isToday(day);
                const dow = day.getDay();

                return (
                  <button key={day} onClick={() => setSelected(isSameDay(selected, day) ? null : day)}
                    style={{
                      padding: '6px 2px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: isSelected ? 'rgba(129,140,248,0.2)' : 'none',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                      outline: isSelected ? '1px solid rgba(129,140,248,0.4)' : 'none',
                      fontFamily: "'Noto Sans KR', sans-serif"
                    }}>
                    <span style={{
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: isTodayDate ? 700 : 400,
                      background: isTodayDate ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'none',
                      color: isTodayDate ? '#fff' : dow === 0 ? '#ef4444' : dow === 6 ? '#818cf8' : '#c0c0e0'
                    }}>
                      {day.getDate()}
                    </span>
                    <div style={{ display: 'flex', gap: 2, minHeight: 8 }}>
                      {daySchedules.slice(0, 3).map(s => (
                        <span key={s.id} style={{
                          width: 5, height: 5, borderRadius: '50%',
                          background: CATEGORY_META[s.category]?.color || '#818cf8'
                        }} />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 선택된 날 일정 */}
          {selected && (
            <div style={{ padding: '16px 16px 0' }}>
              <div style={{ fontSize: 13, color: '#60608a', marginBottom: 8 }}>
                {format(selected, 'M월 d일 (E)', { locale: ko })} 일정
              </div>
              {selectedDaySchedules.length === 0 ? (
                <div style={{ color: '#404060', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>일정 없음</div>
              ) : (
                selectedDaySchedules.map(s => <ScheduleCard key={s.id} schedule={s} />)
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ padding: '0 16px' }}>
          {schedules.length === 0 ? (
            <div style={{ color: '#404060', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>이달 일정 없음</div>
          ) : (
            schedules.map(s => <ScheduleCard key={s.id} schedule={s} showDate />)
          )}
        </div>
      )}

      {/* 일정 추가 버튼 */}
      <button
        onClick={() => navigate('/schedule/add')}
        style={{
          position: 'fixed', bottom: 76, right: 20,
          width: 52, height: 52, borderRadius: '50%', border: 'none',
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          color: '#fff', fontSize: 24, cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(79,70,229,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50
        }}
      >+</button>
    </div>
  );
}

function ScheduleCard({ schedule, showDate }) {
  const meta = CATEGORY_META[schedule.category] || CATEGORY_META.etc;
  const startDate = new Date(schedule.start_at * 1000);

  return (
    <div style={{
      display: 'flex', gap: 12, padding: '12px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)'
    }}>
      <div style={{
        width: 4, borderRadius: 2, flexShrink: 0,
        background: schedule.is_important ? '#f59e0b' : meta.color,
        alignSelf: 'stretch', minHeight: 40
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#e0e0f8', lineHeight: 1.4 }}>
            {schedule.is_important && <span style={{ marginRight: 4 }}>⚡</span>}
            {schedule.title}
          </div>
          <span style={{
            fontSize: 10, padding: '2px 7px', borderRadius: 10, flexShrink: 0,
            background: `${meta.color}20`, color: meta.color, fontWeight: 600
          }}>
            {meta.icon} {meta.label}
          </span>
        </div>
        {showDate && (
          <div style={{ fontSize: 12, color: '#818cf8', marginTop: 3 }}>
            {format(startDate, 'M월 d일 (E) HH:mm', { locale: ko })}
          </div>
        )}
        {schedule.description && (
          <div style={{ fontSize: 12, color: '#50507a', marginTop: 4, lineHeight: 1.5 }}>{schedule.description}</div>
        )}
        {schedule.location && (
          <div style={{ fontSize: 12, color: '#606080', marginTop: 3 }}>📍 {schedule.location}</div>
        )}
      </div>
    </div>
  );
}
