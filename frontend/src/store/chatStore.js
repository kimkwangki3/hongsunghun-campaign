import { create } from 'zustand';

export const useChatStore = create((set, get) => ({
  rooms: [],
  messages: {},
  unreadCounts: {},
  roomTypes: {}, // { roomId: 'group' | 'direct' | 'announce' }

  setRooms: (rooms) => {
    const types = { ...get().roomTypes };
    const counts = { ...get().unreadCounts };
    rooms.forEach(r => {
      types[r.id] = r.type;
      const serverCount = parseInt(r.unread_count) || 0;
      if (counts[r.id] === undefined) {
        // 처음 로드: 서버 값으로 초기화
        counts[r.id] = serverCount;
      } else if (counts[r.id] === 0 && serverCount > 0) {
        // 로컬이 0이지만 서버가 더 높으면 서버 값 사용 (오프라인 중 수신된 메시지)
        counts[r.id] = serverCount;
      }
      // 로컬 값 > 0인 경우: 소켓으로 실시간 추적 중이므로 서버값으로 덮어쓰지 않음
    });
    set({ rooms, roomTypes: types, unreadCounts: counts });
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
