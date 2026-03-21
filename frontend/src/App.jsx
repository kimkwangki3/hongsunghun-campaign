import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import { initPushNotifications } from './utils/pushManager';

const HomePage        = lazy(() => import('./pages/HomePage'));
const ChatPage        = lazy(() => import('./pages/ChatPage'));
const ChatRoomPage    = lazy(() => import('./pages/ChatRoomPage'));
const SchedulePage    = lazy(() => import('./pages/SchedulePage'));
const ScheduleAddPage = lazy(() => import('./pages/ScheduleAddPage'));
const DMListPage      = lazy(() => import('./pages/DMListPage'));
const AdminPage       = lazy(() => import('./pages/AdminPage'));
const MembersAdminPage = lazy(() => import('./pages/MembersAdminPage'));

function PageLoader() {
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#818cf8' }}>로딩 중...</div>;
}

function isTokenValid(token) {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function ProtectedRoute({ children }) {
  const { token, logout } = useAuthStore(s => ({ token: s.token, logout: s.logout }));
  if (!isTokenValid(token)) {
    if (token) logout(); // 만료된 토큰 정리
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  const token = useAuthStore(s => s.token);
  const setAuth = useAuthStore(s => s.setAuth);

  useEffect(() => {
    if (!token) return;
    // 앱 시작 시 최신 사용자 정보(role 등) 서버에서 갱신
    import('./utils/api').then(({ api }) => {
      api.get('/auth/me').then(r => {
        const u = r.data.data;
        if (u) setAuth(token, { id: u.id, name: u.name, role: u.role });
      }).catch(() => {});
    });
    // iOS PWA는 사용자 제스처 없이 Notification.requestPermission() 불가 → Layout.jsx에서 처리
    const isIOSPWA = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      window.matchMedia('(display-mode: standalone)').matches;
    if (!isIOSPWA) {
      initPushNotifications();
    }
    // Render 무료 플랜 슬립 방지 — 8분마다 헬스체크 핑
    const keepAlive = setInterval(() => {
      fetch(`${import.meta.env.VITE_API_URL || ''}/health`).catch(() => {});
    }, 8 * 60 * 1000);
    return () => clearInterval(keepAlive);
  }, [token]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={
          isTokenValid(token) ? <Navigate to="/" replace /> : <LoginPage />
        } />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Suspense fallback={<PageLoader />}><HomePage /></Suspense>} />
          <Route path="chat" element={<Suspense fallback={<PageLoader />}><ChatRoomPage /></Suspense>} />
          <Route path="chat/:roomId" element={<Suspense fallback={<PageLoader />}><ChatPage /></Suspense>} />
          <Route path="schedule" element={<Suspense fallback={<PageLoader />}><SchedulePage /></Suspense>} />
          <Route path="schedule/add" element={<Suspense fallback={<PageLoader />}><ScheduleAddPage /></Suspense>} />
          <Route path="dm" element={<Suspense fallback={<PageLoader />}><DMListPage /></Suspense>} />
          <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
          <Route path="admin/members" element={<Suspense fallback={<PageLoader />}><MembersAdminPage /></Suspense>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
