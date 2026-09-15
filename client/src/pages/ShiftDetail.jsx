import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Card, Button, Textarea } from '../components/ui';
import { ChefIcon, WaiterIcon } from '../icons';
import { fmtMoney, fmtDate, clockFromMin, timeLeft, useNow, toast } from '../ui';
import { Clock, Check, Ban, Hand, Info, Star } from 'lucide-react';
import ConfirmedShiftCard from '../components/ConfirmedShiftCard';
import { useI18n } from '../i18n';

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

function Avatar({ name, size = 44, role }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-paper-2 text-ink-soft font-extrabold shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      <span>{initials}</span>
    </span>
  );
}

function RatingInput({ value, onChange, size = 34 }) {
  return (
    <div className="flex gap-1 justify-center">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)} aria-label={`${s} stars`}>
          <Star size={size} className={s <= value ? 'text-amber fill-amber' : 'text-line'} />
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min = 0, max = 100000, step = 10, unit, onChange, disabled }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-3 bg-card border-[1.5px] border-border rounded-2xl p-2">
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed" disabled={disabled || Number(value) <= min} onClick={() => onChange(clamp(Number(value) - step))}>−</button>
      <div className="text-center flex-1 min-w-0">
        <div className="inline-flex items-center justify-center gap-1">
          <span className="text-2xl font-extrabold text-ink-soft">₹</span>
          <input type="text" inputMode="numeric" pattern="[0-9]*" className="w-[120px] max-w-[160px] text-center text-[28px] font-extrabold tracking-tight text-ink bg-transparent border-none border-b-2 border-transparent px-1 py-0.5 rounded-md outline-none font-[inherit] transition-all duration-150 focus:border-b-primary focus:bg-card" value={value === '' ? '' : value} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); onChange(raw === '' ? '' : Number(raw)); }} disabled={disabled} placeholder={String(min)} />
          {unit && <span className="text-[15px] text-muted-foreground font-semibold ml-1">{unit}</span>}
        </div>
        {label && <span className="block text-xs text-muted-foreground mt-0.5">{label}</span>}
      </div>
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line disabled:opacity-40 disabled:cursor-not-allowed" disabled={disabled || Number(value) >= max} onClick={() => onChange(clamp(Number(value) + step))}>+</button>
    </div>
  );
}

export default function ShiftDetail() {
  const { t } = useI18n();
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [counter, setCounter] = useState(false);
  const [amount, setAmount] = useState(0);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useNow(30000);

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/shifts/${id}`);
      setData(d);
      if (!counter) setAmount(d.shift.payMax);
    } catch (ex) {
      setErr(ex.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load, counter]);

  if (err) {
    return <Card className="mt-2"><div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red"><span className="flex-1">{err}</span></div></Card>;
  }
  if (!data) {
    return <div className="mt-2"><div className="skeleton h-[220px]" /></div>;
  }

  const { shift, responses, myResponse, feeRecord, ratings, ratedByMe } = data;
  const isManager = user.role === 'manager';
  const isMatched = shift.status === 'matched';

  const respond = async (kind) => {
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/respond`, {
        method: 'POST',
        body: JSON.stringify(kind === 'counter' ? { kind, amount } : { kind }),
      });
      toast(kind === 'accept' ? t('toast.youAccepted') : t('toast.counterSent'), 'green');
      setCounter(false);
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const acceptWorker = async (responseId) => {
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/accept`, { method: 'POST', body: JSON.stringify({ responseId }) });
      toast(t('toast.lockedInBoth'), 'green');
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const rate = async () => {
    if (!stars) { toast(t('toast.pickStars'), 'red'); return; }
    setBusy(true);
    try {
      const toUserId = isManager ? shift.worker.id : shift.manager.id;
      await api(`/api/shifts/${shift.id}/rate`, { method: 'POST', body: JSON.stringify({ stars, comment, toUserId }) });
      toast(t('toast.ratingSaved'), 'green');
      load();
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  // A confirmed shift renders the coordination card instead of the open-state
  // hero and response lists.
  if (isMatched) {
    return (
      <>
        <ConfirmedShiftCard shift={shift} feeRecord={feeRecord} onChange={load} />
        <div className="card mt-4">
          {ratedByMe ? (
            <p className="text-xs text-muted-foreground">{t('sd.rated')}</p>
          ) : (
            <>
              <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">
                {t('sd.rate')} {isManager ? shift.worker?.name : shift.manager?.name}
              </p>
              <RatingInput value={stars} onChange={setStars} />
              <div className="h-3" />
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t('sd.ratePlaceholder')} rows={2} />
              <div className="h-2" />
              <Button className="w-full" onClick={rate} disabled={busy || !stars} icon={<Star size={18} />}>{t('sd.submitRating')}</Button>
            </>
          )}
        </div>
      </>
    );
  }

  const RoleIcon = shift.role === 'chef' ? ChefIcon : WaiterIcon;
  const urgencyTone = shift.remainingMs > 2 * 3600000 ? 'green' : shift.remainingMs > 0 ? 'amber' : 'red';

  return (
    <>
      {/* Hero card */}
      <div className={`rounded-[22px] p-5.5 text-hero-on ${isMatched ? 'bg-gradient-to-br from-hero-from to-hero-to' : 'bg-gradient-to-br from-hero-from to-hero-to'}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5 font-extrabold text-xl">
            <RoleIcon size={26} />
            <span>{shift.specialty || (shift.role === 'chef' ? 'Chef' : 'Waiter')}</span>
          </div>
          {shift.status === 'open' && <Pill tone={urgencyTone} />}
        </div>
        <div className="text-[34px] font-black tracking-tight mt-2.5">
          ₹{fmtMoney(shift.payMin)}–{fmtMoney(shift.payMax)} <small className="text-sm font-semibold opacity-80">{shift.status === 'matched' && shift.agreedPay != null ? `· agreed ₹${fmtMoney(shift.agreedPay)}` : 'per shift'}</small>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2.5 mt-4.5">
          <div className="bg-card/15 rounded-[13px] py-2.5 px-3"><b className="block text-sm">{fmtDate(shift.date)}</b><span className="text-xs opacity-85">Date</span></div>
          <div className="bg-card/15 rounded-[13px] py-2.5 px-3"><b className="block text-sm">{clockFromMin(shift.startMin)}–{clockFromMin(shift.endMin)}</b><span className="text-xs opacity-85">{t('sd.shiftTime')}</span></div>
          <div className="bg-card/15 rounded-[13px] py-2.5 px-3"><b className="block text-sm">{shift.locationName}</b><span className="text-xs opacity-85">{t('sd.where')}</span></div>
          {shift.dressCode && <div className="bg-card/15 rounded-[13px] py-2.5 px-3"><b className="block text-sm">{shift.dressCode}</b><span className="text-xs opacity-85">{t('sd.dressCode')}</span></div>}
        </div>
      </div>

      {shift.notes && <Card className="mt-4"><p className="text-xs leading-relaxed">{shift.notes}</p></Card>}

      {/* Manager view — responses */}
      {isManager && shift.status === 'open' && (
        <div className="mt-4">
          <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">Responses ({responses.length})</p>
          {responses.length === 0 ? (
            <Card className="text-center text-muted-foreground text-xs py-6">{t('sd.noResponses')}</Card>
          ) : (
            <div className="flex flex-col gap-3">
              {responses.map((r) => (
                <Card key={r.id} className={`border-l-4 ${r.kind === 'accept' ? 'border-l-green' : 'border-l-amber'}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={r.worker?.name} />
                    <div className="flex-1 min-w-0">
                      <div className="font-extrabold">{r.worker?.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.worker?.rating?.count ? `★ ${r.worker.rating.avg.toFixed(1)} (${r.worker.rating.count} ratings)` : t('sd.newNoRatings')}
                      </div>
                    </div>
                    <div className="text-[17px] font-extrabold">₹{fmtMoney(r.amount)}</div>
                  </div>
                  <div className="h-0.5" />
                  <div className="mt-3">
                    <span className={`text-xs font-bold uppercase tracking-widest ${r.kind === 'accept' ? 'text-green' : 'text-amber'}`}>
                      {r.kind === 'accept' ? 'Accepted at range' : 'Counter-offer'}
                    </span>
                    <div className="h-2" />
                    <Button className={`w-full ${r.kind === 'accept' ? 'bg-green text-success-foreground shadow-[0_6px_16px_rgb(27 107 74 / 0.26)]' : ''}`} onClick={() => acceptWorker(r.id)} disabled={busy} icon={<Check size={18} />}>
                      Lock this in
                    </Button>
                  </div>
                </Card>
              ))}
              <FeeNote agreed={shift.payMax} feeRate={data.feerate} label={t('lbl.whenLockIn')} />
            </div>
          )}
        </div>
      )}

      {/* Worker respond view */}
      {!isManager && shift.status === 'open' && !myResponse && (
        <div className="mt-4">
          <div className="flex flex-col gap-3">
            <Card>
              <div className="flex items-center gap-3">
                <Avatar name={shift.manager?.name} />
                <div>
                  <div className="font-extrabold">{shift.manager?.business || shift.manager?.name}</div>
                  <div className="text-xs text-muted-foreground">{shift.locationName}</div>
                </div>
              </div>
            </Card>
            <Button variant="green" className="w-full" size="lg" onClick={() => respond('accept')} disabled={busy} icon={<Check size={20} />}>
              Accept at ₹{fmtMoney(shift.payMax)}
            </Button>
            {!counter ? (
              <Button variant="ghost" className="w-full" size="lg" onClick={() => setCounter(true)} icon={<Hand size={20} />}>
                I'd like a different price
              </Button>
            ) : (
              <Card>
                <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('sd.yourCounter')}</p>
                <Stepper label={t('lbl.myPrice')} value={amount} min={Math.round(shift.payMin * 0.7)} max={Math.round(shift.payMax * 1.3)} step={10} unit="/shift" onChange={setAmount} />
                <div className="h-2" />
                <p className="text-xs text-muted-foreground">{t('sd.counterHint')}</p>
                <div className="h-3" />
                <div className="flex gap-2">
                  <Button variant="green" className="flex-1" onClick={() => respond('counter')} disabled={busy} icon={<Hand size={18} />}>Send ₹{fmtMoney(amount)}</Button>
                  <Button variant="ghost" onClick={() => setCounter(false)}>{t('common.cancel')}</Button>
                </div>
              </Card>
            )}
            <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue">
              <Info size={16} className="mt-0.5 shrink-0" />
              <span className="flex-1">This request closes {timeLeft(shift.remainingMs)} from now if no one is picked.</span>
            </div>
          </div>
        </div>
      )}

      {/* Worker pending response */}
      {!isManager && shift.status === 'open' && myResponse && (
        <Card className="mt-4">
          <Pill tone="amber"><Clock size={13} /> Your {myResponse.kind === 'counter' ? 'counter-offer of ₹' + fmtMoney(myResponse.amount) : 'accept'} is with the manager</Pill>
          <p className="text-xs text-muted-foreground mt-2">If the manager picks you, you'll both see each other's contact right away. This closes {timeLeft(shift.remainingMs)} from now.</p>
        </Card>
      )}

      {/* Expired */}
      {shift.status === 'expired' && (
        <Card className="mt-4">
          <Pill tone="neutral"><Ban size={13} /> This shift closed without a match</Pill>
          <p className="text-xs text-muted-foreground mt-2">It was open for 12 hours. {isManager ? 'You can post it again.' : 'New ones show up in Open Shifts.'}</p>
          <div className="h-3" />
          <Button variant="ghost" onClick={() => nav(isManager ? '/app/post' : '/app/browse')}>
            {isManager ? t('btn.postAnother') : t('btn.seeOpenShifts')}
          </Button>
        </Card>
      )}
    </>
  );
}

function FeeNote({ agreed, feeRate, label }) {
  const fee = Math.round(agreed * feeRate * 100) / 100;
  return (
    <div className="bg-paper-2 rounded-[13px] p-3.5 text-[13.5px] text-ink-soft leading-[1.55]">
      <b>{label}.</b> Shift at ₹{fmtMoney(agreed)} → worker receives <b>₹{fmtMoney(agreed - fee)}</b> · O.D.C service fee <b>₹{fmtMoney(fee)}</b> ({Math.round(feeRate * 100)}%).
    </div>
  );
}
