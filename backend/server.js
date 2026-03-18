// server.js — Agent: BACKEND (pg version)
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB, db } = require('./database');
const { verifyToken, verifyToken_raw } = require('./middleware/auth');
const { sendPush } = require('./utils/fcm');
const { encrypt, decrypt } = require('./utils/encryption');
const { startScheduler } = require('./utils/scheduler');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '5mb' }));

// Rate Limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/v1/auth/', authLimiter);

// Socket.io
const io = new Server(server, {
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  maxHttpBufferSize: 8e6  // 8MB (base64 이미지 전송)
});

// 소켓 인증 미들웨어
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('인증 토큰 없음'));
  try {
    const user = verifyToken_raw(token);
    socket.user = user;
    next();
  } catch {
    next(new Error('유효하지 않은 토큰'));
  }
});

// 온라인 유저 추적
const onlineUsers = new Map(); // userId → socketId

io.on('connection', async (socket) => {
  const { id: userId, name } = socket.user;
  onlineUsers.set(userId, socket.id);

  // 사용자가 속한 채팅방에 자동 join
  try {
    const rooms = await db.all('SELECT room_id FROM room_members WHERE user_id = $1', [userId]);
    rooms.forEach(r => socket.join(r.room_id));

    socket.broadcast.emit('user_online', { userId, name });

    // 접속 시 각 채팅방에 온라인 수 알림
    rooms.forEach(r => emitRoomOnline(r.room_id));
  } catch (err) {
    console.error('소켓 연결 초기화 오류:', err);
    socket.emit('error', { message: '연결 초기화 실패' });
  }

  // 메시지 전송
  socket.on('send_message', async (data) => {
    try {
      const { roomId, content, type = 'text' } = data;

      // 권한 확인
      const member = await db.get(
        'SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2',
        [roomId, userId]
      );
      if (!member) return socket.emit('error', { message: '채팅방 접근 권한 없음' });

      const msgId = uuidv4();
      const encryptedContent = encrypt(content);
      const now = Math.floor(Date.now() / 1000);

      await db.run(
        'INSERT INTO messages (id, room_id, sender_id, content, type, created_at) VALUES ($1, $2, $3, $4, $5, $6)',
        [msgId, roomId, userId, encryptedContent, type, now]
      );

      const sender = await db.get('SELECT name FROM users WHERE id = $1', [userId]);
      const message = {
        id: msgId,
        roomId,
        senderId: userId,
        senderName: sender.name,
        content,
        type,
        createdAt: now
      };

      // 같은 방 모두에게 전송
      io.to(roomId).emit('new_message', message);

      // DM(direct) 방이면 admin에게도 소켓 알림 전송 (admin은 방 멤버가 아님)
      const roomInfo = await db.get('SELECT name, type FROM rooms WHERE id = $1', [roomId]);
      if (roomInfo?.type === 'direct') {
        const admins = await db.all(
          "SELECT id FROM users WHERE role = 'admin' AND id != $1",
          [userId]
        );
        admins.forEach(a => {
          const adminSid = onlineUsers.get(a.id);
          if (adminSid) io.to(adminSid).emit('new_message', message);
        });
      }

      // 오프라인 멤버에게 FCM 푸시
      const offlineMembers = await db.all(`
        SELECT u.id, dt.token FROM room_members rm
        JOIN users u ON rm.user_id = u.id
        JOIN device_tokens dt ON dt.user_id = u.id
        WHERE rm.room_id = $1 AND u.id != $2
      `, [roomId, userId]);

      // DM이면 오프라인 admin도 FCM 대상에 포함
      let extraTokens = [];
      if (roomInfo?.type === 'direct') {
        const adminTokens = await db.all(`
          SELECT dt.token FROM users u
          JOIN device_tokens dt ON dt.user_id = u.id
          WHERE u.role = 'admin' AND u.id != $1
        `, [userId]);
        extraTokens = adminTokens.map(t => t.token).filter(Boolean)
          .filter(t => !offlineMembers.some(m => m.token === t));
      }

      const offlineTokens = [
        ...offlineMembers.filter(m => !onlineUsers.has(m.id)).map(m => m.token).filter(Boolean),
        ...extraTokens
      ];

      if (offlineTokens.length > 0) {
        sendPush(offlineTokens, {
          title: `💬 ${roomInfo?.name || '새 메시지'}`,
          body: `${sender.name}: ${content.substring(0, 50)}`,
          data: { type: 'chat', roomId }
        });
      }
    } catch (err) {
      console.error('메시지 전송 오류:', err);
      socket.emit('error', { message: '메시지 전송 실패' });
    }
  });

  // 타이핑 인디케이터
  socket.on('typing', ({ roomId }) => {
    socket.to(roomId).emit('user_typing', { userId, name });
  });

  // 메시지 읽음 처리
  socket.on('read_messages', async ({ roomId }) => {
    try {
      // admin이 DM방을 열람할 때는 읽음 처리 하지 않음
      const { role } = socket.user;
      if (role === 'admin') {
        const room = await db.get('SELECT type FROM rooms WHERE id = $1', [roomId]);
        if (room?.type === 'direct') return;
      }

      const unread = await db.all(`
        SELECT id FROM messages
        WHERE room_id = $1 AND sender_id != $2
        AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $3)
      `, [roomId, userId, userId]);

      if (unread.length === 0) return;

      for (const m of unread) {
        await db.run(
          'INSERT INTO message_reads (message_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [m.id, userId]
        );
      }

      io.to(roomId).emit('messages_read', {
        userId,
        userName: name,
        roomId,
        messageIds: unread.map(m => m.id)
      });
    } catch (err) {
      console.error('읽음 처리 오류:', err);
      socket.emit('error', { message: '읽음 처리 실패' });
    }
  });

  // 방 온라인 인원 수 업데이트 헬퍼
  function emitRoomOnline(roomId) {
    const sockets = io.sockets.adapter.rooms.get(roomId);
    io.to(roomId).emit('room_online_update', {
      roomId,
      count: sockets ? sockets.size : 0
    });
  }

  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    socket.broadcast.emit('user_offline', { userId });
    try {
      const userRooms = await db.all('SELECT room_id FROM room_members WHERE user_id = $1', [userId]);
      userRooms.forEach(r => emitRoomOnline(r.room_id));
    } catch (err) {
      console.error('disconnect 처리 오류:', err);
    }
  });
});

// 전역에서 io 사용 가능하도록
app.set('io', io);
app.set('onlineUsers', onlineUsers);

// 라우터 등록
app.use('/api/v1/auth', require('./routes/auth'));
app.use('/api/v1/chat', verifyToken, require('./routes/chat'));
app.use('/api/v1/schedule', verifyToken, require('./routes/schedule'));
app.use('/api/v1/notification', verifyToken, require('./routes/notification'));

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// 빌드된 프론트엔드 정적 서빙
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 전역 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ success: false, message: err.message || '서버 오류' });
});

const PORT = process.env.PORT || 3001;

async function main() {
  await initDB();
  startScheduler(io);
  server.listen(PORT, () => {
    console.log(`🚀 홍성훈 캠프 서버 실행 중: http://localhost:${PORT}`);
  });
}

main().catch(console.error);
