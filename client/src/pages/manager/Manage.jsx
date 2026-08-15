import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import { Card, Button, Seg, Pill, Icon, useNow, timeLeft, fmtDate } from '../../ui';
import ShiftCard from '../../components/ShiftCard';
import { EmptyState } from '../../ui';

export default function Manage() {
  const { user } = useAuth();
  const nav = useNavigate();
  if (user.role !== 'manager') return <Navigate to="/app" replace />;
  const [tab, setTab] = useState('open');
  const [mine, setMine] = useState(null);
  useNow(45000);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/shifts/my');
      setMine(data);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!mine) return <Loading />;

  const open = mine.shifts.filter((s) => s.status === 'open');
  const rest = mine.shifts.filter((s) => s.status !== 'open');
  const list = tab === 'open' ? open : rest;

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">Manager</p>
        <h1>My Shifts</h1>
        <p className="hero-sub">Review responses and lock in the right person.</p>
      </div>
      <div className="mt16">
        <Seg
          options={[{ value: 'open', label: `Open (${open.length})` }, { value: 'closed', label: `Closed (${rest.length})` }]}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt16 stack">
        {list.length === 0 ? (
          <EmptyState
            title={tab === 'open' ? 'No open shifts right now' : 'Nothing closed yet'}
            sub={tab === 'open' ? 'Post a shift and nearby workers will get a ping.' : 'Your closed shifts will show up here.'}
          >
            {tab === 'open' ? <Button onClick={() => nav('/app/post')}>Post a Shift</Button> : null}
          </EmptyState>
        ) : (
          list.map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              onOpen={() => nav(`/app/shifts/${s.id}`)}
              right={
                s.status === 'open' ? (
                  <span className="pill pill-accent">
                    {s.respCount ? `${s.respCount} response${s.respCount > 1 ? 's' : ''}` : 'No responses yet'}
                  </span>
                ) : (
                  <Pill tone={s.status === 'matched' ? 'green' : 'neutral'}>
                    {s.status === 'matched' ? 'Locked in' : 'Closed'}
                  </Pill>
                )
              }
            />
          ))
        )}
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="mt16 stack">
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  );
}