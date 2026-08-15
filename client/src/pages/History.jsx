import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Card, Button, EmptyState, Seg, Pill, Icon, fmtMoney, fmtDate, clockFromMin, timeLeft } from '../ui';

export default function History() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [mine, setMine] = useState(null);
  const [tab, setTab] = useState('done');

  const load = useCallback(async () => {
    try {
      const data = await api('/api/shifts/my');
      setMine(data);
    } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!mine) return <div className="mt16"><div className="skeleton" style={{ height: 300 }} /></div>;

  const matched = mine.shifts.filter((s) => s.status === 'matched');
  const closed = mine.shifts.filter((s) => s.status === 'expired');
  const isManager = user.role === 'manager';
  const list = tab === 'done' ? matched : closed;

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">{isManager ? 'Hiring history' : 'Shift history'}</p>
        <h1>{isManager ? 'Hiring history' : 'Work history'}</h1>
        <p className="hero-sub">
          {matched.length} confirmed shift{matched.length === 1 ? '' : 's'}
          {!isManager ? ` · total ₹${Intl.NumberFormat('en-IN').format(matched.reduce((a, s) => a + (s.agreedPay || 0), 0))}` : ''}
        </p>
      </div>

      <div className="mt16">
        <Seg options={[{ value: 'done', label: `Confirmed (${matched.length})` }, { value: 'expired', label: `Closed (${closed.length})` }]} value={tab} onChange={setTab} />
      </div>

      <div className="mt16 stack">
        {list.length === 0 ? (
          <EmptyState
            title={tab === 'done' ? 'No confirmed shifts yet' : 'Nothing closed yet'}
            sub={tab === 'done' ? 'Confirmed shifts and their payouts appear here.' : 'Shifts that closed without a match appear here.'}
          />
        ) : (
          list.slice(0, 40).map((s) => (
            <Card key={s.id} className="card-tap" onClick={() => nav(`/app/shifts/${s.id}`)}>
              <div className="flex">
                <div className="row-title" style={{ flex: 1 }}>
                  {s.specialty || (s.role === 'chef' ? 'Chef' : 'Waiter')} · {fmtDate(s.date)}
                </div>
                {s.status === 'matched' ? <Pill tone="green">₹{fmtMoney(s.agreedPay)}</Pill> : <Pill tone="neutral">Closed</Pill>}
              </div>
              <div className="small muted mt8">
                {s.locationName} · {clockFromMin(s.startMin)}–{clockFromMin(s.endMin)}
                {s.status === 'matched' && s.myResponse ? ' · ' + (s.myResponse.kind === 'counter' ? `counter ₹${fmtMoney(s.myResponse.amount)}` : 'accepted') : ''}
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
}