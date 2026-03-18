// src/pages/NotificationPage.jsx — Agent: FRONTEND + NOTIFICATION
import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

const TYPE_META = {
  general:  { icon: '🔔', color: '#818cf8' },
  schedule: { icon: '📅', color: '#f59e0b' },
  chat:     { icon: '💬', color: '#34d399' },
  urgent:   { icon: '🚨', color: '#ef4444' },
  countdown:{ icon: '🗳️', color: '#a78bfa' },
};

export default function NotificationPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(Notification.permission === 'granted');

  useEffect(() => {
    api.get('/notification').then(r => {
      setNotifications(r.data.data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function requestPush() {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      setPushEnabled(true);
      const { initPushNotifications } = await import('../utils/pushManager');
      await initPushNotifications();
    }
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', fontFamily: "'Noto Sans KR', sans-serif" }}>
      {/* 푸시 알림 허용 유도 */}
      {!pushEnabled && (
        <div style={{
          margin: '12px 16px',
          background: 'linear-gradient(135deg, rgba(79,70,229,0.15), rgba(124,58,237,0.15))',
          border: '1px solid rgba(129,140,248,0.3)',
          borderRadius: 14, padding: '14px 16px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c4c4e8', marginBottom: 2 }}>🔔 알림 허용</div>
            <div style={{ fontSize: 11, color: '#60608a' }}>일정 및 채팅 알림을 받으세요</div>
          </div>
          <button onClick={requestPush} style={{
            padding: '7px 16px', borderRadius: 20, border: 'none',
            background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
            color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'Noto Sans KR', sans-serif", whiteSpace: 'nowrap'
          }}>
            허용하기
          </button>
        </div>
      )}

      {/* 알림 목록 */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid rgba(129,140,248,0.3)', borderTopColor: '#818cf8', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#404060' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔕</div>
          <div style={{ fontSize: 14, color: '#505070' }}>알림이 없습니다</div>
        </div>
      ) : (
        <div>
          {notifications.map(n => {
            const meta = TYPE_META[n.type] || TYPE_META.general;
            return (
              <div key={n.id} style={{
                padding: '14px 20px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', gap: 14, alignItems: 'flex-start',
                background: n.is_read ? 'none' : 'rgba(129,140,248,0.04)'
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                  background: `${meta.color}18`, border: `1px solid ${meta.color}30`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                }}>
                  {meta.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: n.is_read ? 400 : 600, color: '#d0d0f0', lineHeight: 1.4 }}>
                      {n.title}
                    </div>
                    <div style={{ fontSize: 10, color: '#40405a', flexShrink: 0 }}>
                      {formatDistanceToNow(new Date(n.created_at * 1000), { addSuffix: true, locale: ko })}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: '#60608a', marginTop: 3, lineHeight: 1.5 }}>{n.body}</div>
                </div>
                {!n.is_read && (
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#818cf8', flexShrink: 0, marginTop: 5 }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
