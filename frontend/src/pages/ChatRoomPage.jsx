// src/pages/ChatRoomPage.jsx — Agent: FRONTEND
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useChatStore } from '../store/stores';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

const ROOM_TYPE_ICON = { announce: '📢', group: '💬', direct: '👤' };
const ROOM_TYPE_COLOR = { announce: '#f59e0b', group: '#818cf8', direct: '#34d399' };

export default function ChatRoomPage() {
  const navigate = useNavigate();
  const { rooms, setRooms, clearUnread } = useChatStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/chat/rooms').then(r => {
      const all = r.data.data;
      setRooms(all);
      // 공지방 제외한 목록
      const chatRooms = all.filter(r => r.type !== 'announce');
      // 채팅방이 1개면 바로 입장
      if (chatRooms.length === 1) {
        navigate(`/chat/${chatRooms[0].id}`, { replace: true });
        return;
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingScreen />;

  const chatRooms = rooms.filter(r => r.type !== 'announce');

  return (
    <div style={{
      height: '100%', overflowY: 'auto', overscrollBehavior: 'contain',
      padding: '0 0 8px'
    }}>
      {chatRooms.length === 0 ? (
        <EmptyState />
      ) : (
        <div>
          {chatRooms.map(room => (
            <RoomItem key={room.id} room={room} onClick={() => { clearUnread(room.id); navigate(`/chat/${room.id}`); }} />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomItem({ room, onClick }) {
  const icon = ROOM_TYPE_ICON[room.type] || '💬';
  const accentColor = ROOM_TYPE_COLOR[room.type] || '#818cf8';
  const timeStr = room.last_msg_at
    ? formatDistanceToNow(new Date(room.last_msg_at * 1000), { addSuffix: true, locale: ko })
    : '';
  // room.unread_count 대신 chatStore의 unreadCounts 사용 (실시간 소켓 추적값)
  const unread = useChatStore(s => s.unreadCounts[room.id] || 0);

  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '14px 20px',
      display: 'flex', alignItems: 'center', gap: 14,
      background: 'none', border: 'none', cursor: 'pointer',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
      transition: 'background 0.15s', textAlign: 'left'
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}
    >
      {/* 아이콘 */}
      <div style={{
        width: 48, height: 48, borderRadius: 14, flexShrink: 0,
        background: `${accentColor}18`, border: `1.5px solid ${accentColor}40`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22, position: 'relative'
      }}>
        {icon}
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
            minWidth: 18, height: 18, borderRadius: 9,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid #0d0d1a'
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </div>

      {/* 텍스트 */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f8' }}>{room.name}</span>
          <span style={{ fontSize: 11, color: '#50507a', flexShrink: 0 }}>{timeStr}</span>
        </div>
        <div style={{
          fontSize: 13, color: unread > 0 ? '#b0b0d8' : '#50507a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontWeight: unread > 0 ? 500 : 400
        }}>
          {room.lastMessage || '아직 메시지가 없습니다'}
        </div>
      </div>
    </button>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: 12, color: '#50507a'
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '2px solid rgba(129,140,248,0.3)',
        borderTopColor: '#818cf8',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', flexDirection: 'column', gap: 8,
      color: '#404060', padding: 40, textAlign: 'center'
    }}>
      <div style={{ fontSize: 40 }}>💬</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#606080' }}>채팅방이 없습니다</div>
      <div style={{ fontSize: 13, color: '#404060' }}>관리자가 채팅방을 만들면 알려드릴게요</div>
    </div>
  );
}
