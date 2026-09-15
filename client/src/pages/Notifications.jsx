import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui';
import { EmptyBell } from '../icons';
import { timeAgo } from '../ui';
import { useI18n } from '../i18n';
import { Bell, Clock, Zap } from 'lucide-react';

export default function Notifications() {
  const nav = useNavigate();
  const { t } = useI18n();
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

  if (!items) return (
    <div className="mt-4">
      <div className="skeleton h-[200px]" />
    </div>
  );

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{t('notifs.eyebrow')}</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{t('nav.notifications')}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">{t('notifs.sub')}</p>
      </div>

      <div className="mt-4">
        {items.length === 0 ? (
          <div className="text-center py-11 px-6">
            <div className="text-muted-2 flex justify-center mb-3.5">
              <EmptyBell />
            </div>
            <h3 className="text-lg font-extrabold">{t('notifs.emptyTitle')}</h3>
            <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
              {t('notifs.emptyBody')}
            </p>
            <div className="mt-4.5 flex justify-center">
              <Button variant="ghost" onClick={() => nav('/app')}>{t('notifs.back')}</Button>
            </div>
          </div>
        ) : (
          items.map((n) => (
            <div
              key={n.id}
              className={`flex gap-3 py-3.5 px-0.5 border-b border-line items-start ${!n.read ? 'bg-secondary rounded-[14px] p-3.5 border-b-0 mb-2' : ''}`}
              onClick={() => n.data?.shiftId && nav(`/app/shifts/${n.data.shiftId}`)}
            >
              <span className="font-bold text-[14.5px] flex gap-1.5 items-center">
                {n.type === 'announcement' ? <Zap size={16} /> : n.type === 'shift_expired' || n.type === 'expiring_soon' ? <Clock size={16} /> : <Bell size={16} />}
                {t(n.title, n.data)}
              </span>
              <div className="text-muted-foreground text-[13.5px] mt-0.5 leading-relaxed">{t(n.body, n.data)}</div>
              <div className="text-[11.5px] text-muted-foreground mt-1">{timeAgo(n.createdAt)}</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
