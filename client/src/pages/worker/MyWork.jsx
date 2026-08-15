import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import ShiftCard from '../../components/ShiftCard';
import { Button, Card, EmptyState, Pill, timeLeft } from '../../ui';
import { Icon } from '../../icons';

export default function MyWork() {
  const { user } = useAuth();
  const nav = useNavigate();
  if (user.role === 'manager') return <Navigate to="/app" replace />;
  const [mine, setMine] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/shifts/my');
      setMine(data);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!mine) return <div className="mt16 stack"><div className="skeleton" style={{ height: 120 }} /></div>;

  const pending = mine.shifts.filter((s) => s.status === 'open' && s.myResponse && s.myResponse.status === 'pending');
  const matched = mine.shifts.filter((s) => s.status === 'matched');
  const closed = mine.shifts.filter((s) => s.status !== 'open' && s.status !== 'matched');

  const earned = matched.reduce((a, s) => a + (s.agreedPay || 0), 0);

  const statusPill = (s) => {
    if (s.status === 'matched') return <Pill tone="green"><Icon name="Check" size={13} /> Confirmed</Pill>;
    if (s.status === 'open') return <Pill tone="amber"><Icon name="Clock" size={13} /> Waiting on manager</Pill>;
    return <Pill tone="neutral">Closed</Pill>;
  };

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">{user.role === 'chef' ? 'Chef' : 'Waiter'} · My work</p>
        <h1>My Work</h1>
        <p className="hero-sub">
          <strong style={{ color: 'var(--accent-dark)' }}>₹{Intl.NumberFormat('en-IN').format(earned)}</strong> in confirmed shifts so far.
        </p>
      </div>

      {pending.length ? (
        <>
          <p className="section-title">Waiting on the manager</p>
          <div className="stack">
            {pending.map((s) => (
              <ShiftCard
                key={s.id}
                shift={s}
                onOpen={() => nav(`/app/shifts/${s.id}`)}
                right={
                  <span className="pill pill-amber">
                    <Icon name="Clock" size={13} /> {s.myResponse.kind === 'counter' ? 'Your counter' : 'Accepted'} · {timeLeft(s.remainingMs)} left
                  </span>
                }
              />
            ))}
          </div>
        </>
      ) : null}

      {matched.length ? (
        <>
          <p className="section-title">Your confirmed shifts</p>
          <div className="stack">
            {matched.slice(0, 6).map((s) => (
              <ShiftCard key={s.id} shift={s} right={statusPill(s)} onOpen={() => nav(`/app/shifts/${s.id}`)} />
            ))}
          </div>
        </>
      ) : null}

      {closed.length ? (
        <>
          <p className="section-title">Closed shifts</p>
          <div className="stack">
            {closed.slice(0, 4).map((s) => (
              <ShiftCard key={s.id} shift={s} right={statusPill(s)} onOpen={() => nav(`/app/shifts/${s.id}`)} />
            ))}
          </div>
        </>
      ) : null}

      {pending.length + matched.length + closed.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          sub="When you accept or counter a shift, it shows up here so you can track it."
        >
          <Button onClick={() => nav('/app/browse')}>Find work near you</Button>
        </EmptyState>
      ) : null}
    </>
  );
}