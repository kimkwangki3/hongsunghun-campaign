import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ChatRoomPage from './pages/ChatRoomPage';
import ChatPage from './pages/ChatPage';
import SchedulePage from './pages/SchedulePage';
import ScheduleAddPage from './pages/ScheduleAddPage';
import DMListPage from './pages/DMListPage';
import AdminPage from './pages/AdminPage';
import MembersAdminPage from './pages/MembersAdminPage';
import HomePage from './pages/HomePage';
import { initPushNotifications } from './utils/pushManager';

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
    initPushNotifications();
  }, [token]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<HomePage />} />
          <Route path="chat" element={<Navigate to="/chat/room_general" replace />} />
          <Route path="chat/:roomId" element={<ChatPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="schedule/add" element={<ScheduleAddPage />} />
          <Route path="dm" element={<DMListPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="admin/members" element={<MembersAdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
