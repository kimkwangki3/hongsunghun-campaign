import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';

// 브라우저 알림 권한 요청
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// 브라우저 알림 발송
function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icons/icon-192.png' });
  }
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const totalUnread = useChatStore(s => s.totalUnread());
  const [toast, setToast] = useState(null);

  // currentRoomId를 먼저 계산 (onNewMessage 클로저가 참조하기 전에)
  const isChatRoom = /^\/chat\/.+/.test(location.pathname);
  const currentRoomId = location.pathname.match(/^\/chat\/(.+)/)?.[1] ?? null;

  // 로그인 시 알림 권한 요청
  useEffect(() => {
    if (user) requestNotificationPermission();
  }, [user]);

  function showToast(text) {
    setToast(text);
    setTimeout(() => setToast(null), 4000);
  }

  const { connected } = useSocket({
    onNewMessage: (msg) => {
      // 내가 보낸 메시지가 아니면 어디서든 알림
      if (msg.senderId !== user?.id) {
        const text = `💬 ${msg.senderName}: ${msg.content.substring(0, 40)}`;
        showToast(text);
        sendBrowserNotification('💬 새 메시지', `${msg.senderName}: ${msg.content.substring(0, 60)}`);
      }
    },
    onToast: showToast,
  });

  const NAV = [
    { path:'/',              label:'홈',    icon: HomeIcon    },
    { path:'/chat',          label:'채팅',  icon: ChatIcon    },
    { path:'/schedule',      label:'일정',  icon: CalIcon     },
    { path:'/notifications', label:'알림',  icon: BellIcon    },
    ...(user?.role === 'admin' ? [{ path:'/admin', label:'관리', icon: GearIcon }] : []),
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
          {NAV.map(({ path, label, icon: Icon }) => {
            const active = path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
            const badge = label === '채팅' && totalUnread > 0 ? totalUnread : 0;
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
          position:'fixed', top:20, left:'50%', transform:'translateX(-50%)',
          background:'#1e1e3f', border:'1px solid rgba(129,140,248,0.4)',
          borderRadius:12, padding:'12px 20px', zIndex:99999,
          fontSize:13, color:'#e0e0ff',
          boxShadow:'0 4px 32px rgba(0,0,0,0.6)',
          animation:'toastIn 0.25s ease',
          maxWidth:'90vw', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          pointerEvents:'none'
        }}>
          {toast}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity:0; transform:translateX(-50%) translateY(-12px); }
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
function GearIcon({ size=24, color='currentColor' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
}
