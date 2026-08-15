import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import ShiftCard from '../components/ShiftCard';
import { Icon, ChefIcon, WaiterIcon } from '../icons';
import { Card, fmtMoney, timeLeft, useNow } from '../ui';

export default function Home() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mine, setMine] = useState(null);
  const [notifs, setNotifs] = useState(null);
  const now = useNow(45000);

  const load = useCallback(async () => {
    try {
      const [sh, nt] = await Promise.all([api('/api/shifts/my'), api('/api/me/notifications')]);
      setMine(sh);
      setNotifs(nt);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const isManager = user.role === 'manager';
  const isWorker = !isManager;

  if (!mine) {
    return <LoadingRows />;
  }

  const openShifts = mine.shifts.filter((s) => s.status === 'open');
  const matchedShifts = mine.shifts.filter((s) => s.status === 'matched');
  const pendingOffers = mine.shifts.flatMap((s) => s.myResponse && s.myResponse.status === 'pending' ? [s] : []);

  if (isManager) {
    return (
      <>
        <div className="hero mt8">
          <p className="hero-eyebrow">Manager view</p>
          <h1>Hi {user.name.split(' ')[0]}</h1>
          <p className="hero-sub">
            {openShifts.length
              ? `You have ${openShifts.length} open shift${openShifts.length > 1 ? 's' : ''}. ${openShifts.reduce((a, s) => a + (s.respCount ?? 0), 0)} response${openShifts.reduce((a, s) => a + (s.respCount ?? 0), 0) === 1 ? '' : 's'} waiting on them.`
              : matchedShifts.length ? 'Your next shift is locked in. Nice work.' : 'A shift is open for 12 hours, then it closes if nobody accepts.'}
          </p>
        </div>

        <div className="mt16">
          <button className="cta-card cta-accent" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => nav('/app/post')}>
            <span className="cta-icon"><Icon name="Plus" size={30} /></span>
            <span>
              <span className="cta-title">Post a Shift</span>
              <span className="cta-sub">Find a chef or waiter for your next rush</span>
            </span>
          </button>
        </div>

        <div className="stat-grid mt16">
          <StatCard num={openShifts.length} label="Open shifts" tone="accent" />
          <StatCard num={matchedShifts.length} label="Locked in" tone="green" />
        </div>

        <ShiftList
          title="Your shifts"
          items={mine.shifts.slice(0, 5)}
          empty={
            <div className="text-center muted mt12">
              No shifts yet. <button className="small" style={{ color: 'var(--accent-dark)', fontWeight: 700 }} onClick={() => nav('/app/post')}>Post your first one.</button>
            </div>
          }
        />
        {mine.shifts.length > 5 ? <p className="text-center small muted mt12"><button onClick={() => nav('/app/manage')} style={{ fontWeight: 700, color: 'var(--accent-dark)' }}>See all shifts</button></p> : null}
      </>
    );
  }

  /* Worker */
  const earned = mine.shifts.filter((s) => s.status === 'matched' && s.agreedPay).reduce((a, s) => a + s.agreedPay, 0);
  return (
    <>
      <div className="hero mt8">
        <p className="hero-eyebrow">{user.role === 'chef' ? 'Chef view' : 'Waiter view'}</p>
        <h1>Hi {user.name.split(' ')[0]}</h1>
        <p className="hero-sub">
          {user.available
            ? 'You are Free now. We are watching for nearby shifts that fit you.'
            : 'You are marked not available — flip the switch to start getting shift alerts.'}
        </p>
      </div>

      <div className="mt16">
        <button className="cta-card cta-dark" style={{ width: '100%', textAlign: 'left', border: 0 }} onClick={() => nav('/app/browse')}>
          <span className="cta-icon"><Icon name="Plasma" size={30} /></span>
          <span>
            <span className="cta-title">Find work near you</span>
            <span className="cta-sub">See open shifts you can respond to right now</span>
          </span>
        </button>
      </div>

      <div className="stat-grid mt16">
        <StatCard num={matchedShifts.length} label="Confirmed shifts" tone="green" />
        <StatCard num={'₹' + Intl.NumberFormat('en-IN').format(earned)} label="Earned so far" tone="accent" />
      </div>

      {pendingOffers.length ? (
        <>
          <p className="section-title">Waiting on the manager</p>
          <div className="stack">
            {pendingOffers.slice(0, 3).map((s) => (
              <ShiftCard key={s.id} shift={s} right={
                <PillLabel tone="amber"><Icon name="Clock" size={13} /> pending · {timeLeft(s.remainingMs)} left</PillLabel>
              } />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function PillLabel({ tone, children }) {
  return (
    <span className={`pill pill-${tone}`}>{children}</span>
  );
}

function ShiftList({ title, items, empty }) {
  const nav = useNavigate();
  return (
    <>
      <p className="section-title">{title}</p>
      {items.length === 0 ? (
        <Card>{empty}</Card>
      ) : (
        <div className="stack">
          {items.map((s) => <ShiftCard key={s.id} shift={s} onOpen={() => nav(`/app/shifts/${s.id}`)} />)}
        </div>
      )}
    </>
  );
}

function StatCard({ num, label, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-num" style={{ color: tone === 'green' ? 'var(--green)' : tone === 'accent' ? 'var(--accent-dark)' : 'inherit' }}>{num}</div>
      <div className="stat-lbl">{label}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="mt16 stack">
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}