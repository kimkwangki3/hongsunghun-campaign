import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';
import { api } from '../utils/api';

// 브라우저 알림 권한 요청
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// 브라우저 알림 발송 (클릭 시 해당 페이지 이동)
function sendBrowserNotification(title, body, url = '/') {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, icon: '/icons/icon-192.png' });
    n.onclick = () => { window.focus(); window.location.href = url; };
  }
}

// 알림 소리 + 진동 (안드로이드 WebView 지원)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) {}
  try { navigator.vibrate?.([100, 50, 100]); } catch (_) {}
}

// 메시지 미리보기 텍스트 (이미지/파일은 사람이 읽을 수 있는 텍스트로)
function getPreview(content) {
  try {
    const p = JSON.parse(content);
    if (p.base64 || (p.type === 'image')) return '📷 사진을 보냈습니다';
    if (p.url && p.name) return `📎 ${p.name}`;
  } catch (_) {}
  return content.substring(0, 50);
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const groupUnread = useChatStore(s => s.groupUnread());
  const dmUnread = useChatStore(s => s.dmUnread());
  const { setRooms, incrementUnread } = useChatStore();
  const [toast, setToast] = useState(null);

  const isChatRoom = /^\/chat\/.+/.test(location.pathname);
  const currentRoomId = location.pathname.match(/^\/chat\/(.+)/)?.[1] ?? null;

  // 로그인 시 알림 권한 요청 + 방 목록 로드 (미읽음 카운트 초기화)
  useEffect(() => {
    if (!user) return;
    requestNotificationPermission();
    api.get('/chat/rooms')
      .then(r => setRooms(r.data.data || []))
      .catch(() => {});
  }, [user?.id]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(null), 6000);
  }

  const { connected } = useSocket({
    onNewMessage: (msg) => {
      // 현재 보고 있는 방이 아닐 때만 미읽음 증가 (roomType도 함께 등록)
      if (msg.roomId !== currentRoomId) {
        incrementUnread(msg.roomId, msg.roomType);
      }
      if (msg.senderId !== user?.id) {
        const preview = getPreview(msg.content);
        const text = `💬 ${msg.senderName}: ${preview}`;
        playNotificationSound();
        showToast(text);
        sendBrowserNotification('💬 홍캠프 새 메시지', `${msg.senderName}: ${preview}`, `/chat/${msg.roomId}`);
      }
    },
    onToast: (text, url) => {
      showToast(text);
      if (url) sendBrowserNotification('📅 홍캠프', text, url);
    },
  });

  const NAV = [
    { path:'/',              label:'홈',    icon: HomeIcon,  badge: 0           },
    { path:'/chat',          label:'채팅',  icon: ChatIcon,  badge: groupUnread },
    { path:'/schedule',      label:'일정',  icon: CalIcon,   badge: 0           },
    { path:'/dm',            label:'1:1',   icon: DMIcon,    badge: dmUnread    },
    ...(user?.role === 'admin' ? [{ path:'/admin', label:'관리', icon: GearIcon, badge: 0 }] : []),
  ];

  return (
    <div style={{
      display:'flex', flexDirection:'column', height:'100dvh',
      background:'#0d0d1a', fontFamily:"'Noto Sans KR', sans-serif",
      color:'#e8e8f0', maxWidth:600, margin:'0 auto', position:'relative', overflow:'hidden'
    }}>
      {/* 헤더 */}
      {!isChatRoom && (
        <header style={{
          padding:'14px 20px 10px',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          borderBottom:'1px solid rgba(255,255,255,0.05)', flexShrink:0,
          background:'#111127'
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              width:36, height:36, borderRadius:10,
              background:'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:17, fontWeight:900, color:'#fff'
            }}>홍</div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', lineHeight:1.2 }}>홍성훈 캠프</div>
              <div style={{ fontSize:11, display:'flex', alignItems:'center', gap:4,
                color: connected ? '#4ade80' : '#ef4444' }}>
                <span style={{ width:5, height:5, borderRadius:'50%',
                  background: connected ? '#4ade80' : '#ef4444', display:'inline-block' }} />
                {connected ? '연결됨' : '연결 중...'}
              </div>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:13, color:'#8080b0' }}>{user?.name}</span>
            <button onClick={() => { logout(); navigate('/login'); }} style={{
              fontSize:12, color:'#50507a', background:'none', border:'none',
              cursor:'pointer', padding:'4px 8px', borderRadius:6,
              fontFamily:"'Noto Sans KR', sans-serif"
            }}>로그아웃</button>
          </div>
        </header>
      )}

      {/* 본문 */}
      <main style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <Outlet />
      </main>

      {/* 하단 탭바 */}
      {!isChatRoom && (
        <nav style={{
          display:'flex', background:'#111127',
          borderTop:'1px solid rgba(255,255,255,0.06)',
          paddingBottom:'env(safe-area-inset-bottom)', flexShrink:0
        }}>
          {NAV.map(({ path, label, icon: Icon, badge }) => {
            const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            return (
              <button key={path} onClick={() => navigate(path)} style={{
                flex:1, padding:'10px 0 8px',
                display:'flex', flexDirection:'column', alignItems:'center', gap:3,
                background:'none', border:'none', cursor:'pointer',
                color: active ? '#818cf8' : '#404068',
                position:'relative', transition:'color 0.2s',
                fontFamily:"'Noto Sans KR', sans-serif"
              }}>
                <div style={{ position:'relative' }}>
                  <Icon size={22} color={active ? '#818cf8' : '#404068'} />
                  {badge > 0 && (
                    <span style={{
                      position:'absolute', top:-6, right:-8,
                      background:'#ef4444', color:'#fff',
                      fontSize:9, fontWeight:700,
                      minWidth:15, height:15, borderRadius:8,
                      display:'flex', alignItems:'center', justifyContent:'center',
                      padding:'0 3px', border:'2px solid #111127'
                    }}>{badge > 99 ? '99+' : badge}</span>
                  )}
                </div>
                <span style={{ fontSize:10, fontWeight: active ? 700 : 400 }}>{label}</span>
                {active && (
                  <span style={{
                    position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)',
                    width:18, height:2, background:'#818cf8', borderRadius:1
                  }} />
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* 토스트 — overflow:hidden 밖으로 portal 렌더링 */}
      {toast && ReactDOM.createPortal(
        <div style={{
          position:'fixed',
          bottom:'calc(72px + env(safe-area-inset-bottom))',
          left:'50%', transform:'translateX(-50%)',
          background:'#1a1a4a', border:'2px solid rgba(129,140,248,0.8)',
          borderRadius:16, padding:'14px 22px', zIndex:99999,
          fontSize:15, fontWeight:600, color:'#fff',
          boxShadow:'0 -4px 40px rgba(0,0,0,0.7)',
          animation:'toastIn 0.25s ease',
          maxWidth:'88vw', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          pointerEvents:'none', letterSpacing:'0.01em',
          display:'flex', alignItems:'center', gap:8
        }}>
          <span style={{ fontSize:18 }}>💬</span>
          <span>{toast}</span>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity:0; transform:translateX(-50%) translateY(20px); }
          to   { opacity:1; transform:translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}

function HomeIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/></svg>;
}
function ChatIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
function CalIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
}
function BellIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>;
}
function DMIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}
function GearIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
