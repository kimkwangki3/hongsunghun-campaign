import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  rooms: [],
  messages: {},
  unreadCounts: {},
  roomTypes: {}, // { roomId: 'group' | 'direct' | 'announce' }

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
    set({ unreadCounts: counts });
  },

  addMessage: (roomId, msg) => set(s => ({
    messages: { ...s.messages, [roomId]: [...(s.messages[roomId] || []), msg] }
  })),
  setMessages: (roomId, msgs) => set(s => ({
    messages: { ...s.messages, [roomId]: msgs }
  })),

  setUnread: (roomId, count) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: count }
  })),
  incrementUnread: (roomId, roomType) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: (s.unreadCounts[roomId] || 0) + 1 },
    roomTypes: roomType ? { ...s.roomTypes, [roomId]: roomType } : s.roomTypes,
  })),
  clearUnread: (roomId) => set(s => ({
    unreadCounts: { ...s.unreadCounts, [roomId]: 0 }
  })),

  totalUnread: () => Object.values(get().unreadCounts).reduce((a, b) => a + b, 0),

  // 그룹/공지 채팅 미읽음 합계 (채팅 탭 배지용)
  // roomTypes에 등록된 것만 카운트 (undefined는 제외해서 DM이 채팅 탭에 섞이지 않도록)
  groupUnread: () => {
    const { unreadCounts, roomTypes } = get();
    return Object.entries(unreadCounts)
      .filter(([id]) => roomTypes[id] !== undefined && roomTypes[id] !== 'direct')
      .reduce((sum, [, c]) => sum + c, 0);
  },

  // 1:1 DM 미읽음 합계 (DM 탭 배지용)
  dmUnread: () => {
    const { unreadCounts, roomTypes } = get();
    return Object.entries(unreadCounts)
      .filter(([id]) => roomTypes[id] === 'direct')
      .reduce((sum, [, c]) => sum + c, 0);
  },
}));
