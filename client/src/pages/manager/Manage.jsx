import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import { Card, Button } from '../../components/ui';
import ShiftCard from '../../components/ShiftCard';
import { useNow, timeLeft } from '../../ui';

function Pill({ tone = 'neutral', children }) {
  const toneMap = { green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', neutral: 'bg-paper-2 text-ink-soft', accent: 'bg-secondary text-accent-dark' };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${toneMap[tone] || toneMap.neutral}`}>{children}</span>;
}

function Seg({ options, value, onChange }) {
  return (
    <div className="flex bg-paper-2 p-1 rounded-[14px]">
      {options.map((o) => (
        <button key={o.value} className={`flex-1 py-2.5 px-2 rounded-[11px] font-bold text-[14.5px] transition-all ${value === o.value ? 'bg-card text-ink shadow-[0_2px_6px_rgba(36,31,28,0.08)]' : 'text-muted-foreground'}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ title, sub, children }) {
  return (
    <div className="text-center py-11 px-6">
      <h3 className="text-lg font-extrabold">{title}</h3>
      {sub && <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">{sub}</p>}
      {children && <div className="mt-4.5 flex justify-center">{children}</div>}
    </div>
  );
}

export default function Manage() {
  const { user } = useAuth();
  const nav = useNavigate();
  if (user.role !== 'manager') return <Navigate to="/app" replace />;
  const [tab, setTab] = useState('open');
  const [mine, setMine] = useState(null);
  useNow(45000);

  const load = useCallback(async () => {
    try { const data = await api('/api/shifts/my'); setMine(data); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!mine) return <div className="mt-4 flex flex-col gap-3"><div className="skeleton h-[120px]" /><div className="skeleton h-[120px]" /></div>;

  const open = mine.shifts.filter((s) => s.status === 'open');
  const rest = mine.shifts.filter((s) => s.status !== 'open');
  const list = tab === 'open' ? open : rest;

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">Manager</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">My Shifts</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">Review responses and lock in the right person.</p>
      </div>
      <div className="mt-4">
        <Seg options={[{ value: 'open', label: `Open (${open.length})` }, { value: 'closed', label: `Closed (${rest.length})` }]} value={tab} onChange={setTab} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <Card>
            <EmptyState
              title={tab === 'open' ? 'No open shifts right now' : 'Nothing closed yet'}
              sub={tab === 'open' ? 'Post a shift and nearby workers will get a ping.' : 'Your closed shifts will show up here.'}
            >
              {tab === 'open' && <Button onClick={() => nav('/app/post')}>Post a Shift</Button>}
            </EmptyState>
          </Card>
        ) : (
          list.map((s) => (
            <ShiftCard
              key={s.id}
              shift={s}
              onOpen={() => nav(`/app/shifts/${s.id}`)}
              right={
                s.status === 'open' ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-secondary text-accent-dark">
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
