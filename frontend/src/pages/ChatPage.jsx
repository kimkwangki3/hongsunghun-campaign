// src/pages/ChatPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuthStore, useChatStore } from '../store/stores';
import { useSocket } from '../hooks/useSocket';

export default function ChatPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const readOnly = searchParams.get('readonly') === '1';
  const user = useAuthStore(s => s.user);
  const { messages, setMessages, addMessage, clearUnread } = useChatStore();
  const roomMessages = messages[roomId] || [];

  const [input, setInput] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [typingUsers, setTypingUsers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [readCounts, setReadCounts] = useState({}); // { msgId: number }
  const [readerPopup, setReaderPopup] = useState(null); // { msgId, readers, anchor }
  const [uploading, setUploading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [imageViewer, setImageViewer] = useState(null); // base64 or url
  const [firstUnreadId, setFirstUnreadId] = useState(null); // 첫 미읽은 메시지 ID
  const unreadDividerRef = useRef(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const typingTimer = useRef(null);

  // 모바일 키보드 대응: visualViewport로 컨테이너 높이 동적 조정
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${vv.height}px`;
        containerRef.current.style.top = `${vv.offsetTop}px`;
      }
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const { socket } = useSocket({
    onNewMessage: (msg) => {
      if (msg.roomId === roomId) {
        addMessage(roomId, msg);
        setFirstUnreadId(null);
        if (!readOnly) socket?.emit('read_messages', { roomId });
      }
    },
    onMessagesCleared: ({ roomId: rId }) => {
      if (rId === roomId) setMessages(roomId, []);
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
    // 방 이름을 메시지와 독립적으로 즉시 표시
    api.get(`/chat/rooms/${roomId}`)
      .then(r => setRoomInfo(r.data.data));

    api.get(`/chat/rooms/${roomId}/messages?limit=50`)
      .then(msgsRes => {
        const msgs = msgsRes.data.data;
        setMessages(roomId, msgs);
        clearUnread(roomId);
        const counts = {};
        msgs.forEach(m => { counts[m.id] = m.readCount || 0; });
        setReadCounts(counts);

        // 내가 보내지 않은 메시지 중 처음 안 읽은 것 찾기
        const firstUnread = msgs.find(m => m.senderId !== user?.id && !m.readByMe);
        setFirstUnreadId(firstUnread?.id || null);

        if (!readOnly) socket?.emit('read_messages', { roomId });
      });
  }, [roomId]);

  useEffect(() => {
    // 미읽은 메시지가 있으면 구분선으로, 없으면 맨 아래로 스크롤
    if (firstUnreadId && unreadDividerRef.current) {
      unreadDividerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
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

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file || !socket) return;

    const imageExts = /\.(jpg|jpeg|png|gif|webp)$/i;
    const isImage = imageExts.test(file.name);

    if (file.size > 8 * 1024 * 1024) {
      alert('파일 크기는 8MB 이하만 가능합니다');
      e.target.value = '';
      return;
    }

    setUploading(true);
    try {
      if (isImage) {
        // 이미지: canvas로 압축 후 base64로 DB 저장 (재배포 후에도 유지)
        const base64 = await compressImage(file);
        const content = JSON.stringify({ base64, name: file.name, type: 'image' });
        socket.emit('send_message', { roomId, content, type: 'image' });
      } else {
        // 파일: 서버 업로드 (재배포 시 소실될 수 있음)
        const formData = new FormData();
        formData.append('file', file);
        const res = await api.post('/chat/upload', formData);
        const { url, name, type } = res.data.data;
        const content = JSON.stringify({ url, name, type });
        socket.emit('send_message', { roomId, content, type });
      }
    } catch (err) {
      console.error('파일 업로드 실패:', err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleClearMessages() {
    try {
      await api.delete(`/chat/rooms/${roomId}/messages`);
      setShowClearConfirm(false);
    } catch (err) {
      console.error('전체 삭제 실패:', err);
    }
  }

  async function openReaderPopup(e, msgId) {
    e.stopPropagation();
    const res = await api.get(`/chat/messages/${msgId}/readers`);
    setReaderPopup({ msgId, readers: res.data.data });
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex', flexDirection: 'column',
        position: 'fixed', left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 600,
        top: 0, height: '100dvh',
        background: '#0d0d1a', zIndex: 10
      }}
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
        <button onClick={() => {
          if (readOnly) navigate(-1);
          else if (roomInfo?.type === 'direct') navigate('/dm');
          else navigate('/');
        }} style={{
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
        {user && (
          <button onClick={() => setShowClearConfirm(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#ef4444', fontSize: 11, padding: '4px 8px',
            fontFamily: "'Noto Sans KR', sans-serif", opacity: 0.7
          }}>전체삭제</button>
        )}
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
          const memberCount = parseInt(roomInfo?.member_count) || 1;
          const readCount = parseInt(readCounts[msg.id]) || 0;
          // 안 읽은 사람 수 = (방 전체 - 발신자) - 읽은 수 (모든 메시지에 표시, admin 제외)
          const unread = Math.max(0, (memberCount - 1) - readCount);

          return (
            <React.Fragment key={msg.id}>
              {/* 읽지 않은 메시지 구분선 */}
              {msg.id === firstUnreadId && (
                <div ref={unreadDividerRef} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  margin: '12px 0 4px'
                }}>
                  <div style={{ flex: 1, height: 1, background: 'rgba(250,204,21,0.3)' }} />
                  <span style={{ fontSize: 11, color: '#facc15', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    여기부터 읽지 않은 메시지
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(250,204,21,0.3)' }} />
                </div>
              )}
            <div style={{
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
                  <MessageContent
                    msg={msg}
                    isMine={isMine}
                    onViewImage={setImageViewer}
                    onImageLoad={() => bottomRef.current?.scrollIntoView({ behavior: 'instant' })}
                  />

                  {/* 시간 + 안 읽은 수 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', gap: 2, marginBottom: 2 }}>
                    {unread > 0 && (
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
            </React.Fragment>
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

      {/* 이미지 전체화면 뷰어 */}
      {imageViewer && (
        <div
          onClick={() => setImageViewer(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 300
          }}
        >
          <button
            onClick={() => setImageViewer(null)}
            style={{
              position: 'absolute', top: 16, right: 16,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: 22, width: 40, height: 40,
              borderRadius: '50%', cursor: 'pointer', lineHeight: 1
            }}
          >✕</button>
          <img
            src={imageViewer}
            alt="이미지 보기"
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth: '95vw', maxHeight: '90vh',
              borderRadius: 10, objectFit: 'contain',
              boxShadow: '0 8px 40px rgba(0,0,0,0.6)'
            }}
          />
        </div>
      )}

      {/* 전체삭제 확인 팝업 */}
      {showClearConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200
        }} onClick={() => setShowClearConfirm(false)}>
          <div style={{
            background: '#1a1a35', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 16, padding: '24px 28px', width: 280, textAlign: 'center'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e8e8f8', marginBottom: 8 }}>
              대화 내용 전체 삭제
            </div>
            <div style={{ fontSize: 13, color: '#8080b0', marginBottom: 20, lineHeight: 1.5 }}>
              이 채팅방의 모든 메시지가 삭제됩니다.<br />되돌릴 수 없습니다.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowClearConfirm(false)} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: 'rgba(255,255,255,0.07)', color: '#a0a0c0',
                cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif", fontSize: 14
              }}>취소</button>
              <button onClick={handleClearMessages} style={{
                flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                background: '#ef4444', color: '#fff',
                cursor: 'pointer', fontFamily: "'Noto Sans KR', sans-serif",
                fontSize: 14, fontWeight: 700
              }}>삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 입력창 — 읽기 전용(admin 감시 모드)이면 숨김 */}
      {readOnly && (
        <div style={{
          padding: '10px 16px', background: '#111127',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          textAlign: 'center', fontSize: 12, color: '#50507a', flexShrink: 0
        }}>
          🔒 관리자 열람 전용 — 메시지를 보낼 수 없습니다
        </div>
      )}
      {!readOnly && <div style={{
        padding: '10px 12px',
        paddingBottom: 'calc(10px + env(safe-area-inset-bottom))',
        background: '#111127',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'flex-end', gap: 8,
        flexShrink: 0
      }}>
        {/* 파일 첨부 hidden input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* 첨부 버튼 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            width: 42, height: 42, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,0.07)', cursor: uploading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, opacity: uploading ? 0.5 : 1
          }}
        >
          {uploading
            ? <span style={{ fontSize: 18 }}>⏳</span>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8080b0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
          }
        </button>

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
          onFocus={e => {
            e.target.style.borderColor = 'rgba(129,140,248,0.4)';
            setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 350);
          }}
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
      </div>}
    </div>
  );
}

function MessageContent({ msg, isMine, onViewImage, onImageLoad }) {
  const bubbleStyle = {
    borderRadius: isMine ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
    background: isMine ? 'linear-gradient(135deg, #4f46e5, #6d28d9)' : 'rgba(255,255,255,0.08)',
    color: '#e8e8f8', fontSize: 14, lineHeight: 1.5,
    boxShadow: isMine ? '0 2px 12px rgba(79,70,229,0.3)' : 'none',
    overflow: 'hidden'
  };

  // 파일/이미지 메시지 파싱
  if (msg.type === 'image' || msg.type === 'file') {
    let parsed = null;
    try { parsed = JSON.parse(msg.content); } catch {}

    if (parsed?.base64 || parsed?.url) {
      const imgSrc = parsed.base64 || parsed.url;
      if (msg.type === 'image') {
        return (
          <div style={{ ...bubbleStyle, padding: 4 }}>
            <img
              src={imgSrc}
              alt={parsed.name || '이미지'}
              onClick={() => onViewImage?.(imgSrc)}
              onLoad={onImageLoad}
              style={{
                maxWidth: 220, maxHeight: 280, borderRadius: isMine ? '13px 2px 13px 13px' : '2px 13px 13px 13px',
                display: 'block', cursor: 'zoom-in', objectFit: 'cover'
              }}
            />
          </div>
        );
      } else {
        return (
          <a
            href={parsed.url}
            target="_blank"
            rel="noreferrer"
            style={{
              ...bubbleStyle, padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: 10,
              textDecoration: 'none'
            }}
          >
            <span style={{ fontSize: 24, flexShrink: 0 }}>📎</span>
            <span style={{ fontSize: 13, color: '#c8c8f8', wordBreak: 'break-all' }}>
              {parsed.name || '파일 다운로드'}
            </span>
          </a>
        );
      }
    }
  }

  // 일반 텍스트 메시지
  return (
    <div style={{ ...bubbleStyle, padding: '9px 13px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
      {msg.content}
    </div>
  );
}

// 이미지 canvas 압축 → base64 (DB 저장용, 재배포 후에도 유지)
function compressImage(file, maxWidth = 1200, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
