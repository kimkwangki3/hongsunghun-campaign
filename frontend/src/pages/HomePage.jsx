// src/pages/HomePage.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useSocket } from '../hooks/useSocket';
import { format, differenceInDays } from 'date-fns';
import { ko } from 'date-fns/locale';

const ELECTION_DAY = new Date('2026-06-03');

const ELECTION_MILESTONES = [
  { id: 'sch_0220', date: '2026-02-20', label: '예비후보자 등록 개시' },
  { id: 'sch_0305a', date: '2026-03-05', label: '공직자 사직 기한' },
  { id: 'sch_0305b', date: '2026-03-05', label: '딥페이크 선거운동 금지' },
  { id: 'sch_0404', date: '2026-04-04', label: '지자체장 행위 금지' },
  { id: 'sch_0514', date: '2026-05-14', label: '후보자 등록 신청' },
  { id: 'sch_0521', date: '2026-05-21', label: '선거운동 공식 시작' },
  { id: 'sch_0529', date: '2026-05-29', label: '사전투표 시작' },
  { id: 'sch_0603', date: '2026-06-03', label: '🗳️ 선거일' },
];

export default function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const [rooms, setRooms] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const isAccountant = ['admin', 'accountant'].includes(user?.role);
  const [pendingReceiptCount, setPendingReceiptCount] = useState(0);

  const fetchRooms = useCallback(() => {
    api.get('/chat/rooms')
      .then(r => setRooms(r.data.data || []))
      .catch(() => {});
  }, []);

  // 초기 로드
  useEffect(() => {
    let done = 0;
    const finish = () => { if (++done === 2) setLoading(false); };

    api.get('/chat/rooms')
      .then(r => setRooms(r.data.data || []))
      .catch(() => setRooms([]))
      .finally(finish);

    api.get('/schedule/upcoming')
      .then(r => setSchedules(r.data.data || []))
      .catch(() => {
        const now = Math.floor(Date.now() / 1000);
        api.get('/schedule')
          .then(r => setSchedules((r.data.data || []).filter(s => s.start_at >= now).slice(0, 5)))
          .catch(() => setSchedules([]));
      })
      .finally(finish);

    if (['admin', 'accountant'].includes(user?.role)) {
      api.get('/accounting/receipts/pending-count')
        .then(r => setPendingReceiptCount(r.data.data?.count || 0))
        .catch(() => {});
    }
  }, []);

  // 탭 전환으로 돌아올 때 재조회 (채팅방 읽고 홈 돌아오면 0으로 갱신)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchRooms(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchRooms]);

  // 소켓: 새 메시지 수신 시 해당 방 unread_count 실시간 증가
  useSocket({
    onNewMessage: (msg) => {
      if (msg.senderId === user?.id) return; // 내가 보낸 건 무시
      setRooms(prev => prev.map(r =>
        r.id === msg.roomId
          ? { ...r, unread_count: (parseInt(r.unread_count) || 0) + 1, lastMessage: msg.content }
          : r
      ));
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dDay = differenceInDays(ELECTION_DAY, today);

  const unreadRooms = rooms.filter(r => parseInt(r.unread_count) > 0);
  const chatRooms = rooms.filter(r => r.type !== 'announce');
  const upcomingSchedules = schedules.slice(0, 3);

  const nextMilestone = ELECTION_MILESTONES.find(m => new Date(m.date) >= today);

  return (
    <div style={{ height: '100%', overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 16px 20px' }}>

      {/* D-Day 카드 */}
      <div style={{
        background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
        borderRadius: 18, padding: '20px 24px', marginBottom: 16,
        boxShadow: '0 4px 32px rgba(79,70,229,0.35)', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', right: -20, top: -20,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)'
        }} />
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 4 }}>
          제9회 전국동시지방선거
        </div>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
          {dDay === 0 ? '오늘이 선거일!' : dDay > 0 ? `D-${dDay}` : `D+${Math.abs(dDay)}`}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 6 }}>
          2026년 6월 3일 · 홍성훈 후보
        </div>
        {nextMilestone && dDay > 0 && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: '1px solid rgba(255,255,255,0.15)',
            fontSize: 12, color: 'rgba(255,255,255,0.75)'
          }}>
            다음 일정: <span style={{ fontWeight: 700, color: '#fff' }}>{nextMilestone.label}</span>
            {' · '}
            {format(new Date(nextMilestone.date), 'M월 d일', { locale: ko })}
          </div>
        )}
      </div>

      {/* 읽지 않은 채팅 */}
      <Section title="읽지 않은 채팅" badge={unreadRooms.length}>
        {unreadRooms.length === 0 ? (
          <EmptyItem text="모두 읽었습니다" />
        ) : (
          unreadRooms.map(room => (
            <button key={room.id} onClick={() => navigate(`/chat/${room.id}`)} style={itemStyle}>
              <div style={{ ...avatarStyle, background: 'rgba(129,140,248,0.15)', border: '1.5px solid rgba(129,140,248,0.3)', fontSize: 20 }}>
                💬
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
                  minWidth: 18, height: 18, borderRadius: 9,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px', border: '2px solid #0d0d1a'
                }}>
                  {room.unread_count > 99 ? '99+' : room.unread_count}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>{room.name}</div>
                <div style={{ fontSize: 12, color: '#b0b0d8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {room.lastMessage || '메시지 없음'}
                </div>
              </div>
              <span style={{ fontSize: 13, color: '#404068' }}>›</span>
            </button>
          ))
        )}
        {chatRooms.length > 0 && (
          <button onClick={() => navigate(`/chat/${chatRooms[0].id}`)} style={{
            ...itemStyle, marginTop: 4,
            borderTop: '1px solid rgba(255,255,255,0.04)'
          }}>
            <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 600 }}>채팅방 열기 →</span>
          </button>
        )}
      </Section>

      {/* 미처리 영수증 (회계담당/관리자) */}
      {isAccountant && pendingReceiptCount > 0 && (
        <Section title="미처리 영수증" badge={pendingReceiptCount}>
          <button onClick={() => navigate('/accounting')} style={itemStyle}>
            <div style={{ ...avatarStyle, background: 'rgba(255,165,0,0.12)', border: '1.5px solid rgba(255,165,0,0.35)', fontSize: 20 }}>
              🧾
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#ffa502' }}>
                처리 대기 {pendingReceiptCount}건
              </div>
              <div style={{ fontSize: 12, color: '#8080b0' }}>탭하여 회계 페이지에서 처리하기</div>
            </div>
            <span style={{ fontSize: 13, color: '#404068' }}>›</span>
          </button>
        </Section>
      )}

      {/* 다가오는 일정 */}
      <Section title="다가오는 일정">
        {upcomingSchedules.length === 0 ? (
          <EmptyItem text="예정된 일정이 없습니다" />
        ) : (
          upcomingSchedules.map(s => {
            const dt = s.start_at ? new Date(s.start_at * 1000) : null;
            const dateStr = dt ? format(dt, 'M월 d일 (EEE)', { locale: ko }) : '';
            const diffD = dt ? differenceInDays(dt, today) : null;
            return (
              <button key={s.id} onClick={() => navigate('/schedule')} style={itemStyle}>
                <div style={{ ...avatarStyle, background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.3)', fontSize: 18 }}>
                  📅
                </div>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e8e8f8' }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#8080b0' }}>
                    {dateStr}
                    {diffD !== null && diffD >= 0 && (
                      <span style={{ marginLeft: 6, color: diffD === 0 ? '#4ade80' : '#facc15', fontWeight: 700 }}>
                        {diffD === 0 ? '오늘' : `D-${diffD}`}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </Section>

      {/* 선거 주요 일정 */}
      <Section title="선거 주요 일정">
        {ELECTION_MILESTONES.map(m => {
          const mDate = new Date(m.date);
          const diff = differenceInDays(mDate, today);
          const isPast = diff < 0;
          const isToday = diff === 0;
          return (
            <div key={m.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              opacity: isPast ? 0.4 : 1
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: isPast ? '#404060' : isToday ? '#4ade80' : '#818cf8',
                boxShadow: isToday ? '0 0 8px #4ade80' : 'none'
              }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: isPast ? 400 : 600, color: isPast ? '#6060a0' : '#e0e0f8' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 11, color: '#50507a', marginTop: 1 }}>
                  {format(mDate, 'yyyy년 M월 d일', { locale: ko })}
                </div>
              </div>
              {!isPast && (
                <span style={{
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                  color: isToday ? '#4ade80' : diff <= 7 ? '#facc15' : '#818cf8'
                }}>
                  {isToday ? '오늘' : `D-${diff}`}
                </span>
              )}
              {isPast && <span style={{ fontSize: 11, color: '#404060' }}>완료</span>}
            </div>
          );
        })}
      </Section>

    </div>
  );
}

function Section({ title, badge, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#6060a0', letterSpacing: '0.05em' }}>{title}</span>
        {badge > 0 && (
          <span style={{
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
            minWidth: 18, height: 18, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px'
          }}>{badge}</span>
        )}
      </div>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 14, overflow: 'hidden', padding: '0 4px'
      }}>
        {children}
      </div>
    </div>
  );
}

function EmptyItem({ text }) {
  return (
    <div style={{ padding: '14px 12px', fontSize: 13, color: '#404060', textAlign: 'center' }}>
      {text}
    </div>
  );
}

const itemStyle = {
  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 12px', background: 'none', border: 'none', cursor: 'pointer',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
  transition: 'background 0.15s', fontFamily: "'Noto Sans KR', sans-serif"
};

const avatarStyle = {
  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  position: 'relative'
};
