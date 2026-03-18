// src/pages/ChatPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore, useChatStore } from '../store/stores';
import { useSocket } from '../hooks/useSocket';

export default function ChatPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { messages, setMessages, addMessage, clearUnread } = useChatStore();
  const roomMessages = messages[roomId] || [];

  const [input, setInput] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [readCounts, setReadCounts] = useState({}); // { msgId: number }
  const [readerPopup, setReaderPopup] = useState(null); // { msgId, readers, anchor }
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const typingTimer = useRef(null);

  const { socket } = useSocket({
    onNewMessage: (msg) => {
      if (msg.roomId === roomId) {
        addMessage(roomId, msg);
        socket?.emit('read_messages', { roomId });
      }
    },
    onUserTyping: ({ userId, name }) => {
      if (userId !== user.id) {
        setTypingUsers(prev => [...new Set([...prev, name])]);
        setTimeout(() => setTypingUsers(prev => prev.filter(n => n !== name)), 2500);
      }
    },
    onMessagesRead: ({ userId: readerId, messageIds }) => {
      // 내가 읽은 건 내 메시지 unread 수 감소 대상 아님 (이미 내 메시지니까)
      // 다른 사람이 읽었으면 → 해당 메시지 readCount +1
      if (!readerId || readerId === user.id || !messageIds?.length) return;
      setReadCounts(prev => {
        const next = { ...prev };
        messageIds.forEach(id => { next[id] = (next[id] || 0) + 1; });
        return next;
      });
    },
    onRoomOnlineUpdate: ({ roomId: rId, count }) => {
      if (rId === roomId) setOnlineCount(count);
    }
  });

  useEffect(() => {
    Promise.all([
      api.get('/chat/rooms'),
      api.get(`/chat/rooms/${roomId}/messages?limit=50`)
    ]).then(([roomsRes, msgsRes]) => {
      const room = roomsRes.data.data.find(r => r.id === roomId);
      setRoomInfo(room);

      const msgs = msgsRes.data.data;
      setMessages(roomId, msgs);
      clearUnread(roomId);

      // 초기 읽음 수 세팅
      const counts = {};
      msgs.forEach(m => { counts[m.id] = m.readCount || 0; });
      setReadCounts(counts);

      socket?.emit('read_messages', { roomId });
    });
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [roomMessages.length]);

  function handleSend() {
    const text = input.trim();
    if (!text || !socket) return;
    socket.emit('send_message', { roomId, content: text });
    setInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleTyping() {
    socket?.emit('typing', { roomId });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {}, 2000);
  }

  async function openReaderPopup(e, msgId) {
    e.stopPropagation();
    const res = await api.get(`/chat/messages/${msgId}/readers`);
    setReaderPopup({ msgId, readers: res.data.data });
  }

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0d0d1a' }}
      onClick={() => setReaderPopup(null)}
    >
      {/* 헤더 */}
      <div style={{
        padding: '12px 16px',
        background: '#111127',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', gap: 12,
        flexShrink: 0
      }}>
        <button onClick={() => navigate('/')} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#818cf8', padding: '4px 8px 4px 0', fontSize: 20
        }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e8e8f8' }}>
            {roomInfo?.name || '...'}
          </div>
          <div style={{ fontSize: 11, color: '#818cf8', marginTop: 1 }}>
            {onlineCount > 0 ? `${onlineCount}명 대화 중` : ''}
            {typingUsers.length > 0 ? ` · ${typingUsers.join(', ')} 입력 중...` : ''}
          </div>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 4,
        overscrollBehavior: 'contain'
      }}>
        {roomMessages.map((msg, i) => {
          const isMine = msg.senderId === user.id;
          const prevMsg = roomMessages[i - 1];
          const showSender = !isMine && (i === 0 || prevMsg?.senderId !== msg.senderId);
          const ts = msg.createdAt;
          const dt = ts ? new Date(ts * 1000) : null;
          const timeStr = dt && !isNaN(dt)
            ? dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            : '';
          const memberCount = roomInfo?.member_count || 1;
          const readCount = readCounts[msg.id] || 0;
          // 안 읽은 사람 수 = (방 전체 - 나) - 읽은 수
          const unread = isMine ? Math.max(0, (memberCount - 1) - readCount) : 0;

          return (
            <div key={msg.id} style={{
              display: 'flex',
              flexDirection: isMine ? 'row-reverse' : 'row',
              alignItems: 'flex-end', gap: 6,
              marginTop: showSender ? 12 : 2
            }}>
              {/* 상대방 아바타 */}
              {!isMine && (
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  visibility: showSender ? 'visible' : 'hidden'
                }}>
                  {msg.senderName?.[0] || '?'}
                </div>
              )}

              <div style={{ maxWidth: '72%', display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                {showSender && (
                  <span style={{ fontSize: 11, color: '#6060a0', marginBottom: 4, paddingLeft: 4 }}>
                    {msg.senderName}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, flexDirection: isMine ? 'row-reverse' : 'row' }}>
                  <div style={{
                    padding: '9px 13px',
                    borderRadius: isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: isMine
                      ? 'linear-gradient(135deg, #4f46e5, #6d28d9)'
                      : 'rgba(255,255,255,0.08)',
                    color: '#e8e8f8', fontSize: 14, lineHeight: 1.5,
                    wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                    boxShadow: isMine ? '0 2px 12px rgba(79,70,229,0.3)' : 'none'
                  }}>
                    {msg.content}
                  </div>

                  {/* 시간 + 안 읽은 수 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2, marginBottom: 2 }}>
                    {isMine && unread > 0 && (
                      <button
                        onClick={(e) => openReaderPopup(e, msg.id)}
                        style={{
                          background: 'none', border: 'none', padding: 0,
                          fontSize: 11, color: '#facc15',
                          cursor: 'pointer', fontFamily: 'inherit',
                          fontWeight: 700, lineHeight: 1
                        }}
                      >
                        {unread}
                      </button>
                    )}
                    <span style={{ fontSize: 10, color: '#40406a', flexShrink: 0 }}>
                      {timeStr}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* 타이핑 인디케이터 */}
        {typingUsers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 3, padding: '10px 14px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px 16px 16px 16px' }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{
                  width: 6, height: 6, borderRadius: '50%', background: '#818cf8',
                  animation: `bounce 1.2s infinite ${i * 0.2}s`
                }} />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
        <style>{`
          @keyframes bounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-4px); opacity: 1; }
          }
        `}</style>
      </div>

      {/* 읽은 사람 팝업 */}
      {readerPopup && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', bottom: 90, right: 20,
            background: '#1a1a35', border: '1px solid rgba(129,140,248,0.3)',
            borderRadius: 12, padding: '12px 16px', minWidth: 140,
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 100
          }}
        >
          <div style={{ fontSize: 11, color: '#818cf8', marginBottom: 8, fontWeight: 600 }}>읽은 사람</div>
          {readerPopup.readers.length === 0
            ? <div style={{ fontSize: 12, color: '#6060a0' }}>아직 아무도 읽지 않음</div>
            : readerPopup.readers.map(r => (
              <div key={r.id} style={{ fontSize: 13, color: '#e0e0ff', padding: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff'
                }}>{r.name[0]}</div>
                {r.name}
              </div>
            ))
          }
        </div>
      )}

      {/* 입력창 */}
      <div style={{
        padding: '10px 12px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: '#111127',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'flex-end', gap: 8,
        flexShrink: 0
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); handleTyping(); }}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요..."
          rows={1}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 20,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#e0e0ff', fontSize: 14, outline: 'none', resize: 'none',
            fontFamily: "'Noto Sans KR', sans-serif", lineHeight: 1.5,
            maxHeight: 100, overflowY: 'auto', transition: 'border-color 0.2s'
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(129,140,248,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            width: 42, height: 42, borderRadius: '50%', border: 'none',
            background: input.trim() ? 'linear-gradient(135deg, #4f46e5, #7c3aed)' : 'rgba(255,255,255,0.05)',
            cursor: input.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, transition: 'all 0.2s',
            boxShadow: input.trim() ? '0 2px 12px rgba(79,70,229,0.4)' : 'none'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"
              stroke={input.trim() ? '#fff' : '#404060'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
