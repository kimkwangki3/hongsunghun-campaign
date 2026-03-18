// utils/scheduler.js — Agent: NOTIFICATION (pg version)
const cron = require('node-cron');
const { db } = require('../database');
const { sendPush } = require('./fcm');

function startScheduler(io) {
  // 매일 오전 7시 — 당일 일정 알림
  cron.schedule('0 7 * * *', () => sendScheduleNotifications(io, 'today'), { timezone: 'Asia/Seoul' });

  // 매일 오전 8시 — D-1 일정 알림
  cron.schedule('0 8 * * *', () => sendScheduleNotifications(io, 'tomorrow'), { timezone: 'Asia/Seoul' });

  // 매일 오전 7시 — 선거 D-Day 카운트
  cron.schedule('0 7 * * *', () => sendElectionCountdown(io), { timezone: 'Asia/Seoul' });

  console.log('✅ 알림 스케줄러 시작');
}

async function sendScheduleNotifications(io, when) {
  try {
    const now = new Date();
    let start, end, prefix;

    if (when === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
      end = start + 86399;
      prefix = '🗓️ 오늘 일정';
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      start = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate()).getTime() / 1000;
      end = start + 86399;
      prefix = '📅 내일 일정';
    }

    const notifyCol = when === 'today' ? 'notify_on_day' : 'notify_day_before';
    const schedules = await db.all(
      `SELECT * FROM schedules WHERE start_at >= $1 AND start_at <= $2 AND ${notifyCol} = 1`,
      [start, end]
    );

    if (schedules.length === 0) return;

    const tokenRows = await db.all('SELECT DISTINCT token FROM device_tokens');
    const tokens = tokenRows.map(r => r.token);
    if (tokens.length === 0) return;

    for (const schedule of schedules) {
      await sendPush(tokens, {
        title: prefix,
        body: `${schedule.title}${schedule.location ? ` — ${schedule.location}` : ''}`,
        data: { type: 'schedule', scheduleId: schedule.id }
      });

      // 온라인 유저에게도 소켓 알림
      io.emit('schedule_reminder', {
        schedule,
        when,
        message: `${prefix}: ${schedule.title}`
      });
    }
  } catch (err) {
    console.error('일정 알림 스케줄러 오류:', err);
  }
}

async function sendElectionCountdown(io) {
  try {
    const electionDay = new Date('2026-06-03');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((electionDay - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0 || diffDays > 100) return;

    const tokenRows = await db.all('SELECT DISTINCT token FROM device_tokens');
    const tokens = tokenRows.map(r => r.token);
    if (tokens.length === 0) return;

    let body;
    if (diffDays === 0) body = '🗳️ 오늘이 선거일입니다! 투표소로 가주세요!';
    else if (diffDays === 1) body = '🗳️ 내일이 선거일! 최선을 다하겠습니다!';
    else body = `🗳️ 선거까지 D-${diffDays}일 — 홍성훈 후보와 함께!`;

    await sendPush(tokens, {
      title: '제9회 전국동시지방선거',
      body,
      data: { type: 'countdown', days: String(diffDays) }
    });

    io.emit('election_countdown', { days: diffDays, body });
  } catch (err) {
    console.error('선거 카운트다운 스케줄러 오류:', err);
  }
}

module.exports = { startScheduler };
