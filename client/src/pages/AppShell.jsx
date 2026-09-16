import { useCallback, useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Icon } from '../icons';
import { Button, Switch } from '../components/ui';
import { toast, usePushRegister, useNow, timeLeft } from '../ui';
import { useI18n } from '../i18n';
import { useLiveEvents } from '../useLiveEvents';
import { LanguageToggle, ThemeToggle } from '../components/LanguageToggle';
import { Bell } from 'lucide-react';

function CountdownBanner({ expiresAt, prefix, suffix }) {
  const now = useNow(30000);
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const tone = ms > 2 * 3600000 ? 'green' : ms > 0 ? 'amber' : 'red';
  if (!ms) return null;
  return (
    <div className={`flex items-center justify-center gap-2 py-2 px-3.5 text-[13.5px] font-bold ${tone === 'green' ? 'bg-green-soft text-green' : tone === 'amber' ? 'bg-amber-soft text-amber' : 'bg-red-soft text-red'}`}>
      <Icon name="Clock" size={16} />
      <span>{prefix || ''} {timeLeft(ms)} {suffix}</span>
    </div>
  );
}

// Desktop-console screens from the Stitch designs need more room than the
// default mobile column.
const WIDE_ROUTES = ['/app/chat', '/app/manage', '/app/payments', '/app/shifts', '/app/verification'];

export default function AppShell() {
  const { user, setUser, logout } = useAuth();
  const { t } = useI18n();
  const nav = useNavigate();
  const loc = useLocation();
  const isWorker = user.role === 'chef' || user.role === 'waiter';
  const isManager = user.role === 'manager';

  const [unread, setUnread] = useState(0);
  const [mine, setMine] = useState(null);
  const [expiringShift, setExpiringShift] = useState(null);
  const [suspended, setSuspended] = useState(false);

  usePushRegister();

  const loadMine = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api('/api/shifts/my');
      setMine(data);
      if (isManager) {
        const open = (data.shifts || []).filter((s) => s.status === 'open');
        const soon = open.filter((s) => s.remainingMs > 0);
        const next = soon.sort((a, b) => a.remainingMs - b.remainingMs)[0];
        setExpiringShift(next || null);
      } else {
        const pending = (data.shifts || []).find((s) => s.status === 'open' && s.myResponse);
        setExpiringShift(pending || null);
      }
    } catch {}
  }, [isManager, user]);

  const loadNotifs = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api('/api/me/notifications');
      setUnread(data.notifications.filter((n) => !n.read).length);
    } catch {}
  }, [user]);

  useEffect(() => { loadMine(); loadNotifs(); }, [loadMine, loadNotifs]);
  useEffect(() => {
    const t = setInterval(() => { loadMine(); loadNotifs(); }, 45000);
    return () => clearInterval(t);
  }, [loadMine, loadNotifs]);

  // The bell and the shift list update the moment the server knows.
  useLiveEvents({
    notification: () => loadNotifs(),
    'shift.response': () => loadMine(),
    'shift.updated': () => loadMine(),
  });

  const toggleFree = async () => {
    const next = !user.available;
    try {
      await api('/api/me/availability', { method: 'POST', body: JSON.stringify({ available: next }) });
      setUser({ ...user, available: next });
      toast(next ? t('toast.nowFree') : t('toast.nowUnavailable'), next ? 'green' : 'dark');
    } catch (ex) {
      toast(ex.message, 'red');
    }
  };

  const navItems = isManager
    ? [
        { to: '/app/manage', label: t('nav.manage'), icon: 'Home' },
        { to: '/app/post', label: t('nav.post'), icon: 'Plus' },
        { to: '/app/chat', label: t('nav.chat'), icon: 'Bell' },
        { to: '/app/payments', label: t('nav.payments'), icon: 'Wallet' },
        { to: '/app/profile', label: t('nav.profile'), icon: 'User' },
      ]
    : [
        { to: '/app/browse', label: t('nav.browse'), icon: 'Plasma' },
        { to: '/app/my', label: t('nav.my'), icon: 'Home' },
        { to: '/app/chat', label: t('nav.chat'), icon: 'Bell' },
        { to: '/app/payments', label: t('nav.payments'), icon: 'Wallet' },
        { to: '/app/profile', label: t('nav.profile'), icon: 'User' },
      ];

  if (suspended) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgb(26_28_26_/_0.07)]">
          <h1 className="text-2xl font-black text-center tracking-tight">{t('shell.suspended')}</h1>
          <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] leading-relaxed">
            {t('shell.suspendedBody')}
          </p>
          <Button className="w-full" variant="ghost" onClick={logout}>{t('nav.logout')}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background py-2.5 px-4 border-b border-border">
        <div className="max-w-[560px] mx-auto w-full flex items-center gap-2.5">
          <button className="font-black text-lg tracking-tight inline-flex items-center gap-2 text-ink" onClick={() => nav('/app')}>
            <span className="text-[10px] font-extrabold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-md tracking-widest">ODC</span>
            <span>{t('landing.tagline')}</span>
          </button>
          <span className="flex-1" />
          <LanguageToggle />
          <ThemeToggle />
          {isWorker && (
            <label className="inline-flex items-center gap-1.5 text-[13px] font-bold cursor-pointer">
              <span style={{ color: user.available ? 'var(--color-green)' : 'var(--color-muted-foreground)' }}>
                {user.available ? t('avail.free') : t('avail.off')}
              </span>
              <Switch
                checked={user.available}
                onCheckedChange={toggleFree}
                aria-label={t('avail.toggle')}
              />
            </label>
          )}
          <button className="relative inline-flex" onClick={() => nav('/app/notifications')} aria-label={t('lbl.notifications')}>
            <Bell size={26} className="text-ink-soft" />
            {unread > 0 && (
              <span className="absolute -top-0.5 -right-[3px] min-w-[17px] h-[17px] px-1 rounded-full bg-red text-card text-[10.5px] font-extrabold flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Expiring shift banner */}
      {expiringShift && (
        <CountdownBanner
          expiresAt={expiringShift.expiresAt}
          prefix={user.role === 'manager' ? t('shell.expiryManager') : t('shell.expiryWorker')}
          suffix={isWorker ? t('shell.expirySuffix') : ''}
        />
      )}

      {/* Verification banners */}
      {!user.active && (
        <div className="flex items-start gap-2.5 rounded-none p-3 px-3.5 text-[14.5px] bg-amber-soft text-amber">
          <span className="flex-1">{t('shell.unverifiedPhone')}</span>
        </div>
      )}
      {user.active && user.role !== 'manager' && !user.verifiedBadge && (
        <div className="flex items-start gap-2.5 rounded-none p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue">
          <span className="flex-1">{t('shell.unverifiedProfile')}</span>
        </div>
      )}

      {/* Main content */}
      <main
        className={`flex-1 w-full mx-auto p-4 pb-24 ${
          WIDE_ROUTES.some((r) => loc.pathname.startsWith(r))
            ? 'max-w-[1040px]'
            : 'max-w-[560px]'
        }`}
      >
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-45 bg-card/95 backdrop-blur-xl border-t border-border">
        <div className="max-w-[560px] mx-auto flex">
          {navItems.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex-1 py-2.5 px-1 flex flex-col items-center gap-0.5 text-[11.5px] font-bold transition-colors ${
                  isActive ? 'text-accent-dark' : 'text-muted-foreground'
                }`
              }
            >
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
