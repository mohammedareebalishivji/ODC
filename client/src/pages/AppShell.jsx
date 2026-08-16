import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Icon } from '../icons';
import { Banner, CountdownBanner, toast } from '../ui';
import { usePushRegister } from '../ui';

export default function AppShell() {
  const { user, setUser, logout } = useAuth();
  const nav = useNavigate();
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

  const toggleFree = async () => {
    const next = !user.available;
    try {
      await api('/api/me/availability', { method: 'POST', body: JSON.stringify({ available: next }) });
      setUser({ ...user, available: next });
      toast(next ? 'You are now Free — we\u2019ll ping you about shifts.' : 'You are now Not available.', next ? 'green' : 'dark');
    } catch (ex) {
      toast(ex.message, 'red');
    }
  };

  const navItems = isManager
    ? [
        { to: '/app/manage', label: 'My Shifts', icon: 'Home' },
        { to: '/app/post', label: 'Post Shift', icon: 'Plus' },
        { to: '/app/profile', label: 'Profile', icon: 'User' },
      ]
    : [
        { to: '/app/browse', label: 'Open Shifts', icon: 'Plasma' },
        { to: '/app/my', label: 'My Work', icon: 'Wallet' },
        { to: '/app/profile', label: 'Profile', icon: 'User' },
      ];

  if (suspended) {
    return (
      <div className="auth-wrap">
        <div className="auth-panel">
          <h1 className="auth-title">Account suspended</h1>
          <p className="auth-sub">Your account is temporarily suspended. Contact support if you think this is a mistake.</p>
          <ButtonGhost onClick={logout}>Log out</ButtonGhost>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="appbar">
        <div className="appbar-inner">
          <button className="logo" onClick={() => nav('/app')}>
            <span className="logo-badge">ODC</span>
            <span>On-Demand Crew</span>
          </button>
          <span className="appbar-spacer" />
          {isWorker ? (
            <button className="freetoggle" onClick={toggleFree} title="Toggle availability">
              <span style={{ color: user.available ? 'var(--green)' : 'var(--muted)' }}>{user.available ? 'Free now' : 'Not avail.'}</span>
              <span className={`switch ${user.available ? 'on' : ''}`} />
            </button>
          ) : null}
          <button className="bell" onClick={() => nav('/app/notifications')} aria-label="Notifications">
            <Icon name="Bell" size={26} />
            {unread > 0 ? <span className="bell-dot">{unread > 9 ? '9+' : unread}</span> : null}
          </button>
        </div>
      </header>

      {expiringShift ? (
        <CountdownBanner
          expiresAt={expiringShift.expiresAt}
          prefix={user.role === 'manager' ? 'Your shift request expires in' : 'This request expires in'}
          suffix={isWorker ? '— respond before it vanishes.' : ''}
        />
      ) : null}

      {!user.active ? (
        <Banner tone="warn" style={{ borderRadius: 0 }}>Your number is not verified yet.</Banner>
      ) : user.role !== 'manager' && !user.verifiedBadge ? (
        <Banner tone="info" style={{ borderRadius: 0 }}>
          Your profile is not verified yet. Managers feel safer accepting verified workers — upload your ID in Profile.
        </Banner>
      ) : null}

      <main className="shell-main">
        <Outlet />
      </main>

      <nav className="appnav">
        <div className="appnav-inner">
          {navItems.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'on' : ''}`}>
              <Icon name={n.icon} size={22} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

function ButtonGhost({ children, onClick }) {
  return (
    <button className="btn btn-ghost btn-md btn-full" onClick={onClick}>{children}</button>
  );
}