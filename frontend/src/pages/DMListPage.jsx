// src/pages/DMListPage.jsx
import { useEffect, useState, useCallback } from 'react'; // useCallback: loadRooms
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';

export default function DMListPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const isAdmin = user?.role === 'admin';
  const { setRooms } = useChatStore();
  const unreadCounts = useChatStore(s => s.unreadCounts);
  // chatStore.rooms에서 직접 DM방 조회 → setRooms 호출 시 자동 리렌더
  const directRooms = useChatStore(s => s.rooms.filter(r => r.type === 'direct'));
  const [members, setMembers] = useState([]);
  const [allDmRooms, setAllDmRooms] = useState([]);
  const [adminDmError, setAdminDmError] = useState('');
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  const loadRooms = useCallback(() => {
    api.get('/chat/rooms')
      .then(r => setRooms(r.data.data || []))
      .catch(() => {});
  }, [setRooms]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    // 멤버 목록: 본인·admin 제외
    api.get('/chat/members')
      .then(r => {
        const all = r.data.data || [];
        setMembers(all.filter(m => m.id !== userId && m.role !== 'admin'));
      })
      .catch(() => setMembers([]));

    loadRooms();

    if (isAdmin) {
      api.get('/chat/admin/dms')
        .then(r => setAllDmRooms(r.data.data || []))
        .catch(err => {
          const msg = err.response?.data?.message || err.message || '알 수 없는 오류';
          setAdminDmError(`API 오류: ${msg} (${err.response?.status || '네트워크 오류'})`);
        });
    }

    setLoading(false);
  }, [user?.id, user?.name, isAdmin]);

  // 새 DM 메시지 수신 시 방 목록 새로고침 (새 DM방이 생겼을 수 있음)
  useSocket({
    onNewMessage: (msg) => {
      if (msg.roomType === 'direct') {
        loadRooms();
        if (isAdmin) {
          api.get('/chat/admin/dms')
            .then(r => setAllDmRooms(r.data.data || []))
            .catch(() => {});
        }
      }
    }
  });

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
            const dmRoom = directRooms.find(r =>
              r.name?.split(' · ').map(p => p.trim()).includes(member.name)
            );
            const unread = dmRoom ? (unreadCounts[dmRoom.id] || 0) : 0;
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
                  {unread > 0 && (
                    <span style={{
                      position: 'absolute', top: -2, right: -2,
                      background: '#ef4444', color: '#fff',
                      fontSize: 10, fontWeight: 700,
                      minWidth: 18, height: 18, borderRadius: 9,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 3px', border: '2px solid #0d0d1a'
                    }}>{unread > 99 ? '99+' : unread}</span>
                  )}
                </div>

                {/* 정보 */}
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, fontWeight: unread > 0 ? 700 : 600, color: '#e8e8f8' }}>{member.name}</span>
                      <span style={{
                        fontSize: 10, padding: '2px 6px', borderRadius: 6,
                        background: member.role === 'admin' ? 'rgba(129,140,248,0.2)' : 'rgba(255,255,255,0.07)',
                        color: member.role === 'admin' ? '#818cf8' : '#60608a',
                        fontWeight: 600
                      }}>
                        {ROLE_LABEL[member.role] || member.role}
                      </span>
                    </div>
                    {unread > 0 && (
                      <span style={{
                        background: '#ef4444', color: '#fff',
                        fontSize: 11, fontWeight: 700,
                        minWidth: 20, height: 20, borderRadius: 10,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', flexShrink: 0
                      }}>{unread > 99 ? '99+' : unread}</span>
                    )}
                  </div>
                  {dmRoom?.lastMessage ? (
                    <div style={{
                      fontSize: 12, color: unread > 0 ? '#a0a0d8' : '#6060a0', marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: unread > 0 ? 600 : 400
                    }}>
                      {dmRoom.lastMessage}
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
              {adminDmError
                ? <div style={{ padding: '16px 20px', color: '#ef4444', fontSize: 13, background: 'rgba(239,68,68,0.08)', margin: '8px 16px', borderRadius: 8 }}>{adminDmError}</div>
                : allDmRooms.length === 0
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
