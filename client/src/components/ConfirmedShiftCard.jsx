import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, MapPin, Phone, Shield } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../api';
import { inr, payments, chat } from '../apiEndpoints';
import { fmtDate, clockFromMin, toast } from '../ui';

/**
 * Confirmed Shift Coordination Card.
 *
 * The post-match contract view: the escrow breakdown, the venue contact, the
 * arrival code, and the four-step lifecycle tracker. Rendered for both sides
 * of the shift, with the actions each side is allowed to take.
 */
const STEPS = [
  { key: 'matched', labelKey: 'csc.step.matched' },
  { key: 'checkedIn', labelKey: 'csc.step.checkedIn' },
  { key: 'finished', labelKey: 'csc.step.finished' },
  { key: 'payout', labelKey: 'csc.step.payout' },
];

export default function ConfirmedShiftCard({ shift, feeRecord, onChange }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);

  const isManager = shift.viewerIsManager;
  const gross = shift.agreedPay ?? 0;
  const fee = feeRecord?.fee_amount ?? Math.round(gross * 0.1 * 100) / 100;
  const net = feeRecord?.worker_payout ?? Math.round((gross - fee) * 100) / 100;

  const stage = shift.completedAt ? 2 : shift.checkedInAt ? 1 : 0;
  const counterparty = isManager ? shift.worker : shift.manager;

  async function checkIn(ev) {
    ev.preventDefault();
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/checkin`, {
        method: 'POST',
        body: JSON.stringify({ code: code.trim() }),
      });
      toast(t('toast.arrivalConfirmed'), 'green');
      onChange?.();
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    } finally {
      setBusy(false);
    }
  }

  async function markComplete() {
    setBusy(true);
    try {
      await api(`/api/shifts/${shift.id}/complete`, { method: 'POST' });
      toast(t('toast.shiftComplete'), 'green');
      onChange?.();
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    } finally {
      setBusy(false);
    }
  }

  async function releasePayment() {
    setBusy(true);
    try {
      const { holds } = await payments.escrow();
      const hold = holds.find((h) => h.shiftId === shift.id);
      if (!hold) throw new Error(t('toast.noEscrow'));
      await payments.release(hold.id);
      toast(t('toast.paymentReleased'), 'green');
      onChange?.();
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    } finally {
      setBusy(false);
    }
  }

  async function openChat() {
    try {
      const conv = await chat.openForShift(shift.id);
      window.location.hash = `#/app/chat?c=${conv.id}`;
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    }
  }

  const mapsHref = shift.lat && shift.lng
    ? `https://www.google.com/maps/search/?api=1&query=${shift.lat},${shift.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shift.locationName)}`;

  return (
    <section className="csc" aria-label={t('csc.label')}>
      <header className="csc-head">
        <span className="csc-sealed">
          <Check size={14} aria-hidden="true" /> {t('csc.sealed')}
        </span>
        <span className="csc-ref">{shift.referenceCode}</span>
      </header>
      <p className="csc-sub">{t('csc.sub')}</p>

      <div className="csc-grid">
        {/* ---------- Left: the contract ---------- */}
        <div className="csc-main">
          <div className="csc-venue">
            <div>
              <p className="csc-eyebrow">
                {shift.specialty ? `${shift.specialty} · ` : ''}{shift.role}
              </p>
              <h2 className="csc-venue-name">{shift.locationName}</h2>
              {shift.manager?.address && <p className="csc-meta">{shift.manager.address}</p>}
            </div>
            <div className="csc-guaranteed">
              <p className="csc-meta">{t('csc.guaranteed')}</p>
              <p className="csc-guaranteed-amount">{inr(gross)}</p>
            </div>
          </div>

          <a className="csc-map" href={mapsHref} target="_blank" rel="noopener noreferrer">
            <MapPin size={16} aria-hidden="true" />
            <span>{t('csc.entrance')}</span>
          </a>

          <dl className="csc-facts">
            <div>
              <dt>{t('csc.dateHours')}</dt>
              <dd>
                {fmtDate(shift.date)}
                <br />
                {clockFromMin(shift.startMin)} – {clockFromMin(shift.endMin)}
              </dd>
            </div>
            <div>
              <dt>{t('csc.payoutSchedule')}</dt>
              <dd>
                {t('csc.immediate')}
                <br />
                <span className="csc-meta">{t('pay.settlementNote')}</span>
              </dd>
            </div>
          </dl>

          <div className="csc-escrow">
            <h3 className="csc-h3">{t('csc.escrowBreakdown')}</h3>
            <div className="csc-row">
              <span>{t('csc.gross')}</span>
              <span>{inr(gross)}</span>
            </div>
            <div className="csc-row">
              <span>{t('shift.platformEscrow')}</span>
              <span className="csc-neg">−{inr(fee)}</span>
            </div>
            <div className="csc-row csc-row-total">
              <span>{t('shift.workerReceives')}</span>
              <span>{inr(net)}</span>
            </div>
          </div>

          {(shift.notes || shift.dressCode) && (
            <div className="csc-protocol">
              <h3 className="csc-h3">{t('csc.protocol')}</h3>
              {shift.dressCode && <p className="csc-protocol-item">{shift.dressCode}</p>}
              {shift.notes && <p className="csc-protocol-item">{shift.notes}</p>}
            </div>
          )}
        </div>

        {/* ---------- Right: contact, pass, check-in ---------- */}
        <aside className="csc-side">
          <div className="csc-panel">
            <h3 className="csc-h3">{t('csc.contact')}</h3>
            <p className="csc-contact-name">{counterparty?.name}</p>
            <p className="csc-meta">
              {isManager ? counterparty?.role : counterparty?.business || t('misc.venueManager')}
              {counterparty?.verified ? ' · Verified' : ''}
            </p>
            <div className="csc-actions">
              {counterparty?.phone && (
                <a className="btn btn-primary btn-md" href={`tel:${counterparty.phone}`}>
                  <Phone size={16} aria-hidden="true" /> {t('csc.call')}
                </a>
              )}
              <button type="button" className="btn btn-ghost btn-md" onClick={openChat}>
                {t('csc.shiftChat')}
              </button>
            </div>
          </div>

          <div className="csc-panel">
            <h3 className="csc-h3">{t('csc.pass')}</h3>
            <p className="csc-pass">{shift.referenceCode}</p>
            <button
              type="button"
              className="csc-linkbtn"
              onClick={() => setShowCode((v) => !v)}
              aria-expanded={showCode}
            >
              {showCode ? t('csc.hideCode') : t('csc.showCode')}
            </button>
            {showCode && (
              <p className="csc-proximity" aria-live="polite">
                <Shield size={14} aria-hidden="true" /> {t('csc.proximity')} {shift.proximityCode}
              </p>
            )}
          </div>

          {/* Check-in belongs to the worker; completion and release to the venue. */}
          {!isManager && !shift.checkedInAt && (
            <form className="csc-panel" onSubmit={checkIn}>
              <h3 className="csc-h3">{t('csc.checkin')}</h3>
              <p className="csc-meta">{t('csc.checkinHint')}</p>
              <input
                className="input mt-2"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="0000"
                aria-label={t('csc.arrivalCode')}
              />
              <button type="submit" className="btn btn-primary btn-md btn-full mt-3" disabled={busy || code.length !== 4}>
                {t('csc.confirmArrived')}
              </button>
            </form>
          )}

          {isManager && shift.checkedInAt && !shift.completedAt && (
            <div className="csc-panel">
              <h3 className="csc-h3">{t('csc.finished')}</h3>
              <p className="csc-meta">{t('csc.finishedHint')}</p>
              <button className="btn btn-primary btn-md btn-full mt-3" onClick={markComplete} disabled={busy}>
                {t('csc.markComplete')}
              </button>
            </div>
          )}

          {isManager && shift.completedAt && (
            <div className="csc-panel">
              <h3 className="csc-h3">{t('csc.releasePayment')}</h3>
              <p className="csc-meta">{t('csc.releaseHint', { amount: inr(net) })}</p>
              <button className="btn btn-green btn-md btn-full mt-3" onClick={releasePayment} disabled={busy}>
                {t('csc.release', { amount: inr(net) })}
              </button>
            </div>
          )}

          <Link className="csc-linkbtn" to="/app/payments">
            {t('pay.raiseDispute')} →
          </Link>
        </aside>
      </div>

      {/* ---------- Lifecycle tracker ---------- */}
      <div className="csc-tracker">
        <h3 className="csc-h3">{t('csc.progress')}</h3>
        <ol className="csc-steps">
          {STEPS.map((s, i) => (
            <li key={s.key} className={`csc-step ${i <= stage ? 'done' : ''} ${i === stage + 1 ? 'next' : ''}`}>
              <span className="csc-step-num">{i <= stage ? <Check size={13} /> : i + 1}</span>
              <span className="csc-step-label">{t(s.labelKey)}</span>
              <span className="csc-step-time">
                {i === 0 && shift.matchedAt && new Date(shift.matchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {i === 1 && shift.checkedInAt && new Date(shift.checkedInAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {i === 2 && shift.completedAt && new Date(shift.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {i === 1 && !shift.checkedInAt && <Clock size={12} aria-hidden="true" />}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
