import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import ShiftCard from '../../components/ShiftCard';
import { Button } from '../../components/ui';
import { timeLeft } from '../../ui';
import { Check, Clock } from 'lucide-react';
import { useI18n } from '../../i18n';

function Pill({ tone = 'neutral', children }) {
  const toneMap = { green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', neutral: 'bg-paper-2 text-ink-soft' };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${toneMap[tone] || toneMap.neutral}`}>{children}</span>;
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

export default function MyWork() {
  const { t } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
  const [mine, setMine] = useState(null);

  const load = useCallback(async () => {
    try { const data = await api('/api/shifts/my'); setMine(data); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  // Guard must sit below the hooks — see PostShift for why.
  if (user.role === 'manager') return <Navigate to="/app" replace />;

  if (!mine) return <div className="mt-4 flex flex-col gap-3"><div className="skeleton h-[120px]" /></div>;

  const pending = mine.shifts.filter((s) => s.status === 'open' && s.myResponse && s.myResponse.status === 'pending');
  const matched = mine.shifts.filter((s) => s.status === 'matched');
  const closed = mine.shifts.filter((s) => s.status !== 'open' && s.status !== 'matched');
  const earned = matched.reduce((a, s) => a + (s.agreedPay || 0), 0);

  const statusPill = (s) => {
    if (s.status === 'matched') return <Pill tone="green"><Check size={13} /> Confirmed</Pill>;
    if (s.status === 'open') return <Pill tone="amber"><Clock size={13} /> Waiting on manager</Pill>;
    return <Pill tone="neutral">{t('common.closed')}</Pill>;
  };

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{user.role === 'chef' ? 'Chef' : 'Waiter'} · My work</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{t('my.title')}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          <strong className="text-accent-dark">₹{Intl.NumberFormat('en-IN').format(earned)}</strong> in confirmed shifts so far.
        </p>
      </div>

      {pending.length > 0 && (
        <>
          <p className="text-base font-extrabold mt-5.5 mx-0.5 mb-3 flex items-center gap-2 text-ink-soft">{t('home.waitingManager')}</p>
          <div className="flex flex-col gap-3">
            {pending.map((s) => (
              <ShiftCard key={s.id} shift={s} onOpen={() => nav(`/app/shifts/${s.id}`)} right={
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-amber-soft text-amber">
                  <Clock size={13} /> {s.myResponse.kind === 'counter' ? t('my.yourCounter') : t('my.accepted')} · {timeLeft(s.remainingMs)} left
                </span>
              } />
            ))}
          </div>
        </>
      )}

      {matched.length > 0 && (
        <>
          <p className="text-base font-extrabold mt-5.5 mx-0.5 mb-3 flex items-center gap-2 text-ink-soft">{t('my.confirmed')}</p>
          <div className="flex flex-col gap-3">
            {matched.slice(0, 6).map((s) => (
              <ShiftCard key={s.id} shift={s} right={statusPill(s)} onOpen={() => nav(`/app/shifts/${s.id}`)} />
            ))}
          </div>
        </>
      )}

      {closed.length > 0 && (
        <>
          <p className="text-base font-extrabold mt-5.5 mx-0.5 mb-3 flex items-center gap-2 text-ink-soft">{t('my.closed')}</p>
          <div className="flex flex-col gap-3">
            {closed.slice(0, 4).map((s) => (
              <ShiftCard key={s.id} shift={s} right={statusPill(s)} onOpen={() => nav(`/app/shifts/${s.id}`)} />
            ))}
          </div>
        </>
      )}

      {pending.length + matched.length + closed.length === 0 && (
        <div className="text-center py-11 px-6">
          <h3 className="text-lg font-extrabold">{t('my.emptyTitle')}</h3>
          <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">{t('my.emptyBody')}</p>
          <div className="mt-4.5 flex justify-center"><Button onClick={() => nav('/app/browse')}>{t('home.findWork')}</Button></div>
        </div>
      )}
    </>
  );
}
