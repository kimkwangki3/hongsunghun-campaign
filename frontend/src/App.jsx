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
import HomePage from './pages/HomePage';
import { initPushNotifications } from './utils/pushManager';

function ProtectedRoute({ children }) {
  const token = useAuthStore(s => s.token);
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const token = useAuthStore(s => s.token);

  useEffect(() => {
    if (token) initPushNotifications();
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
