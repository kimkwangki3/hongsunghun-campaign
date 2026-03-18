import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  rooms: [],
  messages: {},
  unreadCounts: {},
  setRooms: (rooms) => set({ rooms }),
  addMessage: (roomId, msg) => set(s => ({
    messages: { ...s.messages, [roomId]: [...(s.messages[roomId] || []), msg] }
  })),
  setMessages: (roomId, msgs) => set(s => ({
    messages: { ...s.messages, [roomId]: msgs }
  })),
  setUnread: (roomId, count) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: count }
  })),
  clearUnread: (roomId) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: 0 }
  })),
  totalUnread: () => Object.values(get().unreadCounts).reduce((a, b) => a + b, 0),
}));
