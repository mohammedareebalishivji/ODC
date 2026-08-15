import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Card, EmptyBellState, Button, Icon, timeAgo } from '../ui';

export default function Notifications() {
  const nav = useNavigate();
  const [items, setItems] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/me/notifications');
      setItems(data.notifications);
      const unread = data.notifications.filter((n) => !n.read).map((n) => n.id);
      if (unread.length) {
        api('/api/me/notifications/read', { method: 'POST', body: JSON.stringify({ ids: unread }) });
      }
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!items) return <div className="mt16"><div className="skeleton" style={{ height: 200 }} /></div>;

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">Updates</p>
        <h1>Notifications</h1>
        <p className="hero-sub">New shifts, responses, confirmations and expiry warnings.</p>
      </div>

      <div className="mt16">
        {items.length === 0 ? (
          <EmptyBellState
            title="Nothing yet"
            sub="When something needs your attention, it will show up here and ping your phone."
          >
            <Button variant="ghost" onClick={() => nav('/app')}>Back to home</Button>
          </EmptyBellState>
        ) : (
          items.map((n) => (
            <div key={n.id} className={`notif-row ${!n.read ? 'unread' : ''}`} onClick={() => n.data?.shiftId && nav(`/app/shifts/${n.data.shiftId}`)}>
              <span className="notif-t" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {n.type === 'announcement' ? <Icon name="Bolt" size={16} /> : n.type === 'shift_expired' || n.type === 'expiring_soon' ? <Icon name="Clock" size={16} /> : <Icon name="Bell" size={16} />}
                {n.title}
              </span>
              <div className="notif-b">{n.body}</div>
              <div className="notif-time">{timeAgo(n.createdAt)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}