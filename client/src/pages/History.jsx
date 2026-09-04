import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Card, Button } from '../components/ui';
import { Icon } from '../icons';
import { fmtMoney, fmtDate, clockFromMin, timeLeft } from '../ui';

function Pill({ tone = 'neutral', children }) {
  const toneMap = {
    green: 'bg-green-soft text-green',
    amber: 'bg-amber-soft text-amber',
    red: 'bg-red-soft text-red',
    blue: 'bg-blue-soft text-blue',
    neutral: 'bg-paper-2 text-ink-soft',
    accent: 'bg-secondary text-accent-dark',
  };
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

function EmptyState({ title, sub }) {
  return (
    <div className="text-center py-11 px-6">
      <h3 className="text-lg font-extrabold">{title}</h3>
      {sub && <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">{sub}</p>}
    </div>
  );
}

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

  if (!mine) return <div className="mt-4"><div className="skeleton h-[300px]" /></div>;

  const matched = mine.shifts.filter((s) => s.status === 'matched');
  const closed = mine.shifts.filter((s) => s.status === 'expired');
  const isManager = user.role === 'manager';
  const list = tab === 'done' ? matched : closed;

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{isManager ? 'Hiring history' : 'Shift history'}</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{isManager ? 'Hiring history' : 'Work history'}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {matched.length} confirmed shift{matched.length === 1 ? '' : 's'}
          {!isManager && ` · total ₹${Intl.NumberFormat('en-IN').format(matched.reduce((a, s) => a + (s.agreedPay || 0), 0))}`}
        </p>
      </div>

      <div className="mt-4">
        <Seg options={[{ value: 'done', label: `Confirmed (${matched.length})` }, { value: 'expired', label: `Closed (${closed.length})` }]} value={tab} onChange={setTab} />
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {list.length === 0 ? (
          <Card>
            <EmptyState
              title={tab === 'done' ? 'No confirmed shifts yet' : 'Nothing closed yet'}
              sub={tab === 'done' ? 'Confirmed shifts and their payouts appear here.' : 'Shifts that closed without a match appear here.'}
            />
          </Card>
        ) : (
          list.slice(0, 40).map((s) => (
            <Card key={s.id} className="cursor-pointer transition-shadow hover:shadow-[0_8px_24px_rgba(46,53,51,0.07)] active:scale-[0.99]" onClick={() => nav(`/app/shifts/${s.id}`)}>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0 font-bold text-[15.5px]">
                  {s.specialty || (s.role === 'chef' ? 'Chef' : 'Waiter')} · {fmtDate(s.date)}
                </div>
                {s.status === 'matched' ? <Pill tone="green">₹{fmtMoney(s.agreedPay)}</Pill> : <Pill tone="neutral">Closed</Pill>}
              </div>
              <div className="text-xs text-muted-foreground mt-2">
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
