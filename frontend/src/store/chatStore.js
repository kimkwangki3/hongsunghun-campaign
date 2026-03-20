import { create } from 'zustand';

const STORAGE_KEY = 'hc_unread_v1';

function loadUnread() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}
function saveUnread(counts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(counts)); } catch {}
}

export const useChatStore = create((set, get) => ({
  rooms: [],
  messages: {},
  unreadCounts: loadUnread(), // 페이지 리로드/WebView 재시작 시에도 복원
  roomTypes: {},

  // setRooms: rooms/roomTypes만 갱신, unreadCounts는 절대 건드리지 않음
  setRooms: (rooms) => {
    const types = { ...get().roomTypes };
    rooms.forEach(r => { types[r.id] = r.type; });
    set({ rooms, roomTypes: types });
  },

  // 로그인 직후 한 번만 호출 — 서버 미읽음 수로 초기화 (이미 세팅된 건 보존)
  initUnread: (rooms) => {
    const counts = { ...get().unreadCounts };
    rooms.forEach(r => {
      if (counts[r.id] === undefined) {
        counts[r.id] = parseInt(r.unread_count) || 0;
      }
    });
    saveUnread(counts);
    set({ unreadCounts: counts });
  },

  addMessage: (roomId, msg) => set(s => ({
    messages: { ...s.messages, [roomId]: [...(s.messages[roomId] || []), msg] }
  })),
  setMessages: (roomId, msgs) => set(s => ({
    messages: { ...s.messages, [roomId]: msgs }
  })),

  setUnread: (roomId, count) => {
    const counts = { ...get().unreadCounts, [roomId]: count };
    saveUnread(counts);
    set({ unreadCounts: counts });
  },
  incrementUnread: (roomId, roomType) => {
    const s = get();
    const counts = { ...s.unreadCounts, [roomId]: (s.unreadCounts[roomId] || 0) + 1 };
    saveUnread(counts);
    set({
      unreadCounts: counts,
      roomTypes: roomType ? { ...s.roomTypes, [roomId]: roomType } : s.roomTypes,
    });
  },
  clearUnread: (roomId) => {
    const counts = { ...get().unreadCounts, [roomId]: 0 };
    saveUnread(counts);
    set({ unreadCounts: counts });
  },

  totalUnread: () => Object.values(get().unreadCounts).reduce((a, b) => a + b, 0),

  groupUnread: () => {
    const { unreadCounts, roomTypes } = get();
    return Object.entries(unreadCounts)
      .filter(([id]) => roomTypes[id] !== undefined && roomTypes[id] !== 'direct')
      .reduce((sum, [, c]) => sum + c, 0);
  },

  dmUnread: () => {
    const { unreadCounts, roomTypes } = get();
    return Object.entries(unreadCounts)
      .filter(([id]) => roomTypes[id] === 'direct')
      .reduce((sum, [, c]) => sum + c, 0);
  },
}));
