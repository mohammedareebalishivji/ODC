import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { inr } from '../../apiEndpoints';
import { Avatar, toast, useNow, timeLeft, fmtDate, clockFromMin } from '../../ui';

/**
 * Manager Shift Dispatcher & Offer Desk.
 *
 * Two panes, as designed: the live requisition list on the left, and the
 * applicant desk on the right. Every offer shows the escrow split — what the
 * worker actually receives and what O.D.C takes — because that is the number
 * both sides argue about.
 */
export default function DispatchDesk() {
  const { user } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  const [mine, setMine] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  useNow(30000);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/shifts/my');
      setMine(data);
      setActiveId((cur) => cur || (data.shifts.find((s) => s.status === 'open') || {}).id || null);
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    }
  }, [t]);

  const loadDetail = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      setDetail(await api(`/api/shifts/${id}`));
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);

  const open = useMemo(
    () => (mine?.shifts || []).filter((s) => s.status === 'open'),
    [mine]
  );
  const closed = useMemo(
    () => (mine?.shifts || []).filter((s) => s.status !== 'open'),
    [mine]
  );

  async function accept(responseId) {
    if (!window.confirm(t('confirm.lockCrew'))) return;
    setBusy(true);
    try {
      await api(`/api/shifts/${activeId}/accept`, {
        method: 'POST',
        body: JSON.stringify({ responseId }),
      });
      toast(t('toast.crewLockedIn'), 'green');
      await load();
      await loadDetail(activeId);
    } catch (err) {
      toast(err.message || t('common.error'), 'red');
    } finally {
      setBusy(false);
    }
  }

  if (user.role !== 'manager') return <Navigate to="/app" replace />;
  if (!mine) {
    return (
      <div className="flex flex-col gap-3">
        <div className="skeleton h-[120px]" />
        <div className="skeleton h-[120px]" />
      </div>
    );
  }

  const feeRate = detail?.feerate ?? 0.1;
  const pending = (detail?.responses || []).filter((r) => r.status === 'pending');

  return (
    <div className="dispatch">
      <header className="dispatch-head">
        <div>
          <h1 className="dispatch-title">{t('nav.manage')}</h1>
          <p className="dispatch-sub">
            {open.length} live · {closed.length} closed
          </p>
        </div>
        <span className="dispatch-live">
          <span className="dispatch-live-dot live-dot" aria-hidden="true" />
          Live broadcast active
        </span>
      </header>

      <div className="dispatch-grid">
        {/* ---- Requisition list ---- */}
        <aside className="dispatch-list" aria-label={t('dd.yourShifts')}>
          {open.length === 0 && closed.length === 0 ? (
            <div className="dispatch-empty">
              <p>{t('dd.noneYet')}</p>
              <button className="btn btn-primary btn-md mt-3" onClick={() => nav('/app/post')}>
                {t('nav.post')}
              </button>
            </div>
          ) : (
            [...open, ...closed].map((s) => (
              <button
                key={s.id}
                className={`dispatch-item ${activeId === s.id ? 'on' : ''}`}
                onClick={() => setActiveId(s.id)}
                aria-current={activeId === s.id}
              >
                <span className="dispatch-item-top">
                  <span className="dispatch-item-title">{s.locationName}</span>
                  <span className={`pill ${s.status === 'open' ? 'pill-accent' : s.status === 'matched' ? 'pill-green' : 'pill-neutral'}`}>
                    {t(`shift.status.${s.status}`) || s.status}
                  </span>
                </span>
                <span className="dispatch-item-meta">
                  {fmtDate(s.date)} · {clockFromMin(s.startMin)}–{clockFromMin(s.endMin)}
                </span>
                <span className="dispatch-item-meta">
                  {s.respCount
                    ? `${s.respCount} response${s.respCount > 1 ? 's' : ''}`
                    : t('dd.noResponsesShort')}
                  {s.status === 'open' && s.remainingMs > 0
                    ? ` · ${timeLeft(s.remainingMs)} left`
                    : ''}
                </span>
              </button>
            ))
          )}
        </aside>

        {/* ---- Applicant desk ---- */}
        <section className="dispatch-panel" aria-live="polite">
          {!detail ? (
            <div className="dispatch-empty">{t('dd.selectShift')}</div>
          ) : (
            <>
              <div className="dispatch-panel-head">
                <div>
                  <h2 className="dispatch-panel-title">{t('dd.applicantDesk')}</h2>
                  <p className="dispatch-sub">
                    {detail.shift.locationName} · {inr(detail.shift.payMin)}–{inr(detail.shift.payMax)}
                  </p>
                </div>
                <span className="dispatch-count">
                  {pending.length} {pending.length === 1 ? 'response' : 'responses'}
                </span>
              </div>

              {detail.shift.status !== 'open' ? (
                <div className="dispatch-empty">
                  This shift is {t(`shift.status.${detail.shift.status}`) || detail.shift.status}.
                </div>
              ) : pending.length === 0 ? (
                <div className="dispatch-empty">
                  {t('dd.noResponses')}
                </div>
              ) : (
                <ul className="dispatch-applicants">
                  {pending.map((r) => {
                    const fee = Math.round(r.amount * feeRate * 100) / 100;
                    const net = Math.round((r.amount - fee) * 100) / 100;
                    const counter = r.kind === 'counter';
                    return (
                      <li key={r.id}>
                        <article className={`applicant ${counter ? 'is-counter' : ''}`}>
                          <div className="applicant-head">
                            <Avatar
                              photo={r.worker?.photo}
                              name={r.worker?.name}
                              role={r.worker?.role}
                              size={44}
                            />
                            <div className="applicant-id">
                              <p className="applicant-name">
                                {r.worker?.name}
                                {r.worker?.verified && (
                                  <span className="pill pill-green applicant-badge">
                                    {t('kyc.aadhaar')}
                                  </span>
                                )}
                              </p>
                              <p className="applicant-meta">
                                ★ {(r.worker?.rating?.avg || 0).toFixed(1)} ·{' '}
                                {r.worker?.rating?.count || 0} ratings · {r.worker?.role}
                              </p>
                            </div>
                            <span className={`pill ${counter ? 'pill-amber' : 'pill-accent'}`}>
                              {counter ? t('shift.counterReceived') : t('dd.directAccept')}
                            </span>
                          </div>

                          <dl className="applicant-money">
                            <div>
                              <dt>{counter ? t('shift.requested') : t('shift.original')}</dt>
                              <dd className="applicant-amount">{inr(r.amount)}</dd>
                            </div>
                            <div>
                              <dt>{t('shift.workerReceives')}</dt>
                              <dd>{inr(net)}</dd>
                            </div>
                            <div>
                              <dt>{t('shift.platformEscrow')}</dt>
                              <dd>{inr(fee)}</dd>
                            </div>
                          </dl>

                          <div className="applicant-actions">
                            <button
                              className="btn btn-green btn-md"
                              disabled={busy}
                              onClick={() => accept(r.id)}
                            >
                              {t('shift.accept')} · {inr(r.amount)}
                            </button>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
