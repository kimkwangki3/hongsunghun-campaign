// src/pages/DMListPage.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';

export default function DMListPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const [members, setMembers] = useState([]);
  const [dmRooms, setDmRooms] = useState({}); // { userId: { roomId, unread, lastMessage } }
  const [allDmRooms, setAllDmRooms] = useState([]); // admin 전용: 전체 DM방 목록
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  useEffect(() => {
    const userId = user?.id;
    const userName = user?.name;
    if (!userId) return;

    // 멤버 목록: 본인·admin 제외
    api.get('/chat/members')
      .then(r => {
        const all = r.data.data || [];
        setMembers(all.filter(m => m.id !== userId && m.role !== 'admin'));
      })
      .catch(() => setMembers([]));

    // 내 DM방 → 이름 기반으로 상대 매핑
    api.get('/chat/rooms')
      .then(r => {
        const rooms = (r.data.data || []).filter(rm => rm.type === 'direct');
        const map = {};
        rooms.forEach(rm => {
          const parts = (rm.name || '').split(' · ');
          const otherName = parts.map(p => p.trim()).find(p => p !== userName);
          if (otherName) {
            map[otherName] = {
              roomId: rm.id,
              unread: parseInt(rm.unread_count) || 0,
              lastMessage: rm.lastMessage || '',
            };
          }
        });
        setDmRooms(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (isAdmin) {
      api.get('/chat/admin/dms')
        .then(r => setAllDmRooms(r.data.data || []))
        .catch(() => {});
    }
  }, [user?.id, user?.name, isAdmin]);

  async function openDM(targetUserId) {
    setStarting(targetUserId);
    try {
      const res = await api.post('/chat/dm', { targetUserId });
      navigate(`/chat/${res.data.data.roomId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setStarting(null);
    }
  }

  const ROLE_LABEL = { admin: '관리자', member: '캠프원' };

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: '#0d0d1a' }}>
      {/* 헤더 */}
      <div style={{
        padding: '16px 20px 12px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#111127', flexShrink: 0
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8' }}>1:1 대화</div>
        <div style={{ fontSize: 12, color: '#50507a', marginTop: 2 }}>대화할 캠프원을 선택하세요</div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#404060', fontSize: 14 }}>불러오는 중...</div>
      ) : (
        <>
        {/* 내 1:1 대화 목록 */}
        <div style={{ padding: '12px 20px 4px', fontSize: 11, fontWeight: 700, color: '#50507a', letterSpacing: '0.05em' }}>
          내 대화
        </div>
        <div style={{ padding: '0 0 8px' }}>
          {members.length === 0
            ? <div style={{ padding: '20px', textAlign: 'center', color: '#404060', fontSize: 14 }}>다른 캠프원이 없습니다</div>
            : members.map(member => {
            const dm = dmRooms[member.name];
            const isLoading = starting === member.id;
            return (
              <button
                key={member.id}
                onClick={() => openDM(member.id)}
                disabled={isLoading}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 20px', background: 'none', border: 'none',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  fontFamily: "'Noto Sans KR', sans-serif",
                  opacity: isLoading ? 0.6 : 1,
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {/* 아바타 */}
                <div style={{
                  width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 700, color: '#fff', position: 'relative'
                }}>
                  {member.name[0]}
                  {dm?.unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -2, right: -2,
                      background: '#ef4444', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      minWidth: 18, height: 18, borderRadius: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px', border: '2px solid #0d0d1a'
                    }}>1</span>
                  )}
                </div>

                {/* 정보 */}
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: '#e8e8f8' }}>{member.name}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 6,
                      background: member.role === 'admin' ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.07)',
                      color: member.role === 'admin' ? '#818cf8' : '#60608a',
                      fontWeight: 600
                    }}>
                      {ROLE_LABEL[member.role] || member.role}
                    </span>
                  </div>
                  {dm?.lastMessage ? (
                    <div style={{
                      fontSize: 12, color: '#6060a0', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {dm.lastMessage}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#3a3a5a', marginTop: 2 }}>대화 시작하기</div>
                  )}
                </div>

                {/* 화살표 */}
                <span style={{ fontSize: 18, color: '#303050', flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </div>

        {/* 관리자 전용: 모든 1:1 대화 감시 */}
        {isAdmin && (
          <>
            <div style={{
              padding: '16px 20px 4px',
              fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: '0.05em',
              borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 8
            }}>
              🔒 관리자 — 전체 1:1 대화 열람
            </div>
            <div style={{ padding: '0 0 24px' }}>
              {allDmRooms.length === 0
                ? <div style={{ padding: '20px', textAlign: 'center', color: '#404060', fontSize: 14 }}>진행 중인 1:1 대화 없음</div>
                : allDmRooms.map(room => (
                  <button
                    key={room.id}
                    onClick={() => navigate(`/chat/${room.id}?readonly=1`)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                      padding: '13px 20px', background: 'none', border: 'none',
                      cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      fontFamily: "'Noto Sans KR', sans-serif",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                      background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 18
                    }}>💬</div>
                    <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#e8e8f8' }}>{room.members}</div>
                      <div style={{
                        fontSize: 12, color: '#6060a0', marginTop: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {room.lastMessage || `메시지 ${room.msg_count || 0}개`}
                      </div>
                    </div>
                    <span style={{ fontSize: 18, color: '#303050', flexShrink: 0 }}>›</span>
                  </button>
                ))
              }
            </div>
          </>
        )}
        </>
      )}
    </div>
  );
}
