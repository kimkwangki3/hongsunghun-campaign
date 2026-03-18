// src/hooks/useSocket.js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

let globalSocket = null;
const subscribers = new Set(); // 여러 컴포넌트가 동시에 구독 가능

function initSocket(token) {
  if (globalSocket) return; // 이미 있으면 재생성 금지 (StrictMode 중복 방지)

  const socket = io(import.meta.env.VITE_SOCKET_URL || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 2000
  });
  globalSocket = socket;

  socket.on('connect', () =>
    subscribers.forEach(s => s.setConnected(true)));
  socket.on('disconnect', () =>
    subscribers.forEach(s => s.setConnected(false)));

  // 새 메시지 — 모든 구독자에게 전달 (중복 없음)
  socket.on('new_message', (msg) =>
    subscribers.forEach(s => s.cb.current.onNewMessage?.(msg)));

  socket.on('user_typing', (data) =>
    subscribers.forEach(s => s.cb.current.onUserTyping?.(data)));

  socket.on('messages_read', (data) =>
    subscribers.forEach(s => s.cb.current.onMessagesRead?.(data)));

  socket.on('room_online_update', (data) =>
    subscribers.forEach(s => s.cb.current.onRoomOnlineUpdate?.(data)));

  // 서버 발송 알림 (일정·선거·긴급) — onToast 가진 구독자에게
  socket.on('schedule_reminder', ({ message }) =>
    subscribers.forEach(s => s.cb.current.onToast?.(message, '/schedule')));
  socket.on('election_countdown', ({ body }) =>
    subscribers.forEach(s => s.cb.current.onToast?.(body, '/schedule')));
  socket.on('broadcast_notification', ({ title, body }) =>
    subscribers.forEach(s => s.cb.current.onToast?.(`🚨 ${title}: ${body}`, '/')));

  socket.on('messages_cleared', (data) =>
    subscribers.forEach(s => s.cb.current.onMessagesCleared?.(data)));
}

export function useSocket({ onNewMessage, onUserTyping, onMessagesRead, onRoomOnlineUpdate, onToast, onMessagesCleared } = {}) {
  const token = useAuthStore(s => s.token);
  const [connected, setConnected] = useState(globalSocket?.connected ?? false);
  const cb = useRef({});

  // 매 렌더마다 최신 콜백으로 갱신 (stale closure 방지)
  useEffect(() => {
    cb.current = { onNewMessage, onUserTyping, onMessagesRead, onRoomOnlineUpdate, onToast, onMessagesCleared };
  });

  // 구독자 등록 / 해제
  useEffect(() => {
    const sub = { cb, setConnected };
    subscribers.add(sub);
    if (globalSocket?.connected) setConnected(true);
    return () => subscribers.delete(sub);
  }, []);

  // 소켓 생성 (최초 1회)
  useEffect(() => {
    if (!token) return;
    initSocket(token);
  }, [token]);

  return { socket: globalSocket, connected };
}

export function getSocket() {
  return globalSocket;
}
