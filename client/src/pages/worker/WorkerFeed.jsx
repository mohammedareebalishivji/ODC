import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { AlertCircle, Zap } from 'lucide-react';
import { useAuth } from '../../state';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { inr } from '../../apiEndpoints';
import { toast, useGeolocation, useNow, timeLeft, fmtDate, clockFromMin } from '../../ui';

/**
 * Worker Shift Feed & Counter-Offer.
 *
 * Every card leads with take-home pay rather than the advertised rate: the
 * platform fee comes off the worker's side, so the advertised number is not
 * what lands in their account, and the designs are explicit about that.
 */
export default function WorkerFeed() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  const { pos, err: geoErr } = useGeolocation();

  const [shifts, setShifts] = useState(null);
  const [feeRate, setFeeRate] = useState(0.1);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [counterFor, setCounterFor] = useState(null);
  useNow(30000);

  const load = useCallback(async (usePos) => {
    try {
      const q = usePos ? `?lat=${usePos.lat}&lng=${usePos.lng}` : '';
      const data = await api(`/api/shifts/open${q}`);
      setShifts(data.shifts);
      setErr(null);
    } catch (ex) {
      setErr(ex.message);
    }
  }, []);

  useEffect(() => { if (pos) load(pos); else load(); }, [pos, load]);

  // The fee rate is configurable by O.D.C, so read it rather than hardcoding.
  useEffect(() => {
    fetch('/health')
      .then((r) => r.json())
      .then((d) => { if (typeof d.feeRate === 'number') setFeeRate(d.feeRate); })
      .catch(() => { /* keep the 10% default */ });
  }, []);

  const net = (gross) => Math.round(gross * (1 - feeRate) * 100) / 100;

  async function respond(shiftId, kind, amount) {
    try {
      await api(`/api/shifts/${shiftId}/respond`, {
        method: 'POST',
        body: JSON.stringify(kind === 'counter' ? { kind, amount } : { kind }),
      });
      toast(kind === 'counter' ? t('toast.counterOfferSent') : t('toast.responseSent'), 'green');
      setCounterFor(null);
      await load(pos);
    } catch (ex) {
      toast(ex.message || t('common.error'), 'red');
    }
  }

  async function toggleFree() {
    const next = !user.available;
    try {
      await api('/api/me/availability', {
        method: 'POST',
        body: JSON.stringify({ available: next }),
      });
      setUser({ ...user, available: next });
    } catch (ex) {
      toast(ex.message, 'red');
    }
  }

  if (user.role === 'manager') return <Navigate to="/app" replace />;

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">
          {t('shift.liveOpen')}
        </p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{t('nav.browse')}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {pos
            ? t('feed.showingNear')
            : geoErr
              ? t('feed.locationOff')
              : t('feed.finding')}
        </p>
      </div>

      {!user.available && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-amber-soft text-amber mt-4">
          <span className="flex-1">
            {t('feed.notAvailBanner')}
          </span>
          <button className="shrink-0 font-bold underline" onClick={toggleFree}>{t('feed.turnOn')}</button>
        </div>
      )}

      <div className="flex items-center mt-4 mb-4 gap-2">
        <span className="text-muted-foreground text-xs flex-1">
          {shifts ? `${shifts.length} open shift${shifts.length === 1 ? '' : 's'} for you` : t('common.loading')}
        </span>
        <button
          className="py-1.5 px-3 rounded-[10px] border-[1.5px] border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2"
          onClick={async () => { setRefreshing(true); await load(pos); setRefreshing(false); }}
          disabled={refreshing}
        >
          {refreshing ? t('btn.refreshing') : t('btn.refresh')}
        </button>
      </div>

      {err && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{err}</span>
        </div>
      )}

      {!shifts ? (
        <div className="flex flex-col gap-3">
          <div className="skeleton h-[150px]" />
          <div className="skeleton h-[150px]" />
        </div>
      ) : shifts.length === 0 ? (
        <div className="text-center py-11 px-6">
          <h3 className="text-lg font-extrabold">{t('shift.empty')}</h3>
          <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
            {user.available
              ? t('feed.nothingMatching')
              : t('feed.notAvailable')}
          </p>
          {!user.available && (
            <button className="btn btn-soft btn-md mt-4" onClick={toggleFree}>
              <Zap size={18} /> {t('btn.freeToday')}
            </button>
          )}
        </div>
      ) : (
        <ul className="feed-list">
          {shifts.map((s) => (
            <li key={s.id}>
              <article className="feed-card">
                <div className="feed-card-head">
                  <div className="min-w-0">
                    <h2 className="feed-title">{s.locationName}</h2>
                    <p className="feed-meta">
                      {fmtDate(s.date)} · {clockFromMin(s.startMin)}–{clockFromMin(s.endMin)}
                      {s.specialty ? ` · ${s.specialty}` : ''}
                    </p>
                  </div>
                  {s.remainingMs > 0 && (
                    <span className={`pill ${s.remainingMs > 2 * 3600000 ? 'pill-green' : 'pill-amber'}`}>
                      {t('shift.expiresIn', { time: timeLeft(s.remainingMs) })}
                    </span>
                  )}
                </div>

                <div className="feed-pay">
                  <div>
                    <p className="feed-pay-label">{t('shift.workerReceives')}</p>
                    <p className="feed-pay-amount">{inr(net(s.payMax))}</p>
                  </div>
                  <div className="feed-pay-side">
                    <p className="feed-meta">Offer {inr(s.payMax)}</p>
                    <p className="feed-meta">
                      {t('shift.platformEscrow')} {inr(Math.round(s.payMax * feeRate * 100) / 100)}
                    </p>
                  </div>
                </div>

                {s.myResponse ? (
                  <p className="feed-responded">
                    You {s.myResponse.kind === 'counter' ? 'countered' : 'accepted'} at{' '}
                    {inr(s.myResponse.amount)} — waiting on the venue.
                  </p>
                ) : counterFor === s.id ? (
                  <CounterForm
                    shift={s}
                    feeRate={feeRate}
                    onCancel={() => setCounterFor(null)}
                    onSubmit={(amt) => respond(s.id, 'counter', amt)}
                  />
                ) : (
                  <div className="feed-actions">
                    <button className="btn btn-primary btn-md" onClick={() => respond(s.id, 'accept')}>
                      {t('shift.accept')}
                    </button>
                    <button className="btn btn-ghost btn-md" onClick={() => setCounterFor(s.id)}>
                      {t('shift.counterOffer')}
                    </button>
                    <button className="btn btn-ghost btn-md" onClick={() => nav(`/app/shifts/${s.id}`)}>
                      Details
                    </button>
                  </div>
                )}
              </article>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Inline counter-offer, bounded by the range the server will accept. */
function CounterForm({ shift, feeRate, onCancel, onSubmit }) {
  const { t } = useI18n();
  const min = Math.ceil(shift.payMin * 0.7);
  const max = Math.floor(shift.payMax * 1.3);
  const [amount, setAmount] = useState(Math.round(shift.payMax * 1.05));

  const net = Math.round(amount * (1 - feeRate) * 100) / 100;
  const outOfRange = amount < min || amount > max;

  return (
    <form
      className="feed-counter"
      onSubmit={(e) => { e.preventDefault(); if (!outOfRange) onSubmit(amount); }}
    >
      <label className="feed-counter-label" htmlFor={`counter-${shift.id}`}>
        {t('shift.counterOffer')} — {inr(min)} to {inr(max)}
      </label>
      <input
        id={`counter-${shift.id}`}
        type="range"
        min={min}
        max={max}
        step={10}
        value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
      />
      <div className="feed-counter-row">
        <span className="feed-pay-amount">{inr(amount)}</span>
        <span className="feed-meta">{t('shift.workerReceives')} {inr(net)}</span>
      </div>
      <div className="feed-actions">
        <button type="submit" className="btn btn-primary btn-md" disabled={outOfRange}>
          Send counter-offer
        </button>
        <button type="button" className="btn btn-ghost btn-md" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
