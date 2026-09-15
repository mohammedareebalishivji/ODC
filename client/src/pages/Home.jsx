import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import ShiftCard from '../components/ShiftCard';

import { Card } from '../components/ui';
import { timeLeft, useNow } from '../ui';
import { Plus, Clock, Compass } from 'lucide-react';
import { useI18n } from '../i18n';

export default function Home() {
  const { t } = useI18n();
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
        <div className="py-1.5 px-0.5 mt-2">
          <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{t('home.managerView')}</p>
          <h1 className="text-[30px] font-black tracking-tight mt-1.5">Hi {user.name.split(' ')[0]}</h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            {openShifts.length
              ? `You have ${openShifts.length} open shift${openShifts.length > 1 ? 's' : ''}. ${openShifts.reduce((a, s) => a + (s.respCount ?? 0), 0)} response${openShifts.reduce((a, s) => a + (s.respCount ?? 0), 0) === 1 ? '' : 's'} waiting on them.`
              : matchedShifts.length ? t('home.nextLocked') : 'A shift is open for 12 hours, then it closes if nobody accepts.'}
          </p>
        </div>

        <div className="mt-4">
          <button
            className="w-full rounded-[22px] p-5.5 text-hero-on flex items-center gap-4 shadow-[0_10px_26px_rgb(0 97 98 / 0.28)] cursor-pointer bg-gradient-to-br from-hero-from to-hero-to border-0 text-left"
            onClick={() => nav('/app/post')}
          >
            <span className="flex items-center justify-center w-[58px] h-[58px] rounded-[16px] bg-white/18 shrink-0">
              <Plus size={30} />
            </span>
            <span>
              <span className="text-lg font-extrabold block">{t('home.postShift')}</span>
              <span className="text-[13.5px] opacity-85 mt-0.5 block">{t('home.postShiftSub')}</span>
            </span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5 mt-4">
          <StatCard num={openShifts.length} label={t('home.openShifts')} tone="accent" />
          <StatCard num={matchedShifts.length} label={t('lbl.lockedIn')} tone="green" />
        </div>

        <ShiftList
          title={t('home.yourShifts')}
          items={mine.shifts.slice(0, 5)}
          empty={
            <div className="text-center text-muted-foreground mt-3">
              No shifts yet.{' '}
              <button className="text-xs font-bold text-accent-dark" onClick={() => nav('/app/post')}>
                Post your first one.
              </button>
            </div>
          }
        />
        {mine.shifts.length > 5 && (
          <p className="text-center text-xs text-muted-foreground mt-3">
            <button onClick={() => nav('/app/manage')} className="font-bold text-accent-dark">
              See all shifts
            </button>
          </p>
        )}
      </>
    );
  }

  /* Worker */
  const earned = mine.shifts.filter((s) => s.status === 'matched' && s.agreedPay).reduce((a, s) => a + s.agreedPay, 0);
  return (
    <>
      <div className="py-1.5 px-0.5 mt-2">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">
          {user.role === 'chef' ? t('home.chefView') : t('home.waiterView')}
        </p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">Hi {user.name.split(' ')[0]}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {user.available
            ? t('home.freeNowBody')
            : t('home.notAvailBody')}
        </p>
      </div>

      <div className="mt-4">
        <button
          className="w-full rounded-[22px] p-5.5 text-hero-on flex items-center gap-4 shadow-[0_10px_26px_rgb(0 97 98 / 0.28)] cursor-pointer bg-gradient-to-br from-hero-from to-hero-to border-0 text-left"
          onClick={() => nav('/app/browse')}
        >
          <span className="flex items-center justify-center w-[58px] h-[58px] rounded-[16px] bg-white/18 shrink-0">
            <Compass size={30} />
          </span>
          <span>
            <span className="text-lg font-extrabold block">{t('home.findWork')}</span>
            <span className="text-[13.5px] opacity-85 mt-0.5 block">{t('home.findWorkSub')}</span>
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <StatCard num={matchedShifts.length} label={t('home.confirmedShifts')} tone="green" />
        <StatCard num={'₹' + Intl.NumberFormat('en-IN').format(earned)} label={t('home.earnedSoFar')} tone="accent" />
      </div>

      {pendingOffers.length > 0 && (
        <>
          <p className="text-base font-extrabold mt-5.5 mx-0.5 mb-3 flex items-center gap-2 text-ink-soft">{t('home.waitingManager')}</p>
          <div className="flex flex-col gap-3">
            {pendingOffers.slice(0, 3).map((s) => (
              <ShiftCard key={s.id} shift={s} right={
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-amber-soft text-amber">
                  <Clock size={13} /> pending · {timeLeft(s.remainingMs)} left
                </span>
              } />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function ShiftList({ title, items, empty }) {
  const nav = useNavigate();
  return (
    <>
      <p className="text-base font-extrabold mt-5.5 mx-0.5 mb-3 flex items-center gap-2 text-ink-soft">{title}</p>
      {items.length === 0 ? (
        <Card>{empty}</Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((s) => <ShiftCard key={s.id} shift={s} onOpen={() => nav(`/app/shifts/${s.id}`)} />)}
        </div>
      )}
    </>
  );
}

function StatCard({ num, label, tone }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-3.5">
      <div className={`text-[26px] font-black tracking-tight ${tone === 'green' ? 'text-green' : tone === 'accent' ? 'text-accent-dark' : ''}`}>
        {num}
      </div>
      <div className="text-xs text-muted-foreground font-bold mt-0.5">{label}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="skeleton h-[120px]" />
      <div className="skeleton h-[120px]" />
    </div>
  );
}
