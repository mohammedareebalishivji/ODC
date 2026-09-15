import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../state';
import { useI18n } from '../i18n';
import { payments, inr } from '../apiEndpoints';
import { Button, Card, Pill, toast } from '../ui';

/**
 * Payment Hub — the canonical multi-language payment console from Stitch.
 *
 * Layout follows the design: a hero "net take-home" card with the payout
 * destination and a single dominant transfer CTA, then the escrow passbook,
 * then the live ledger.
 */
export default function Payments() {
  const { user } = useAuth();
  const { t } = useI18n();

  const [summary, setSummary] = useState(null);
  const [holds, setHolds] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showAddMethod, setShowAddMethod] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, e, tx] = await Promise.all([
        payments.summary(),
        payments.escrow(),
        payments.transactions(),
      ]);
      setSummary(s);
      setHolds(e.holds || []);
      setLedger(tx.transactions || []);
    } catch (err) {
      toast(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const defaultMethod = useMemo(
    () => (summary?.methods || []).find((m) => m.isDefault) || (summary?.methods || [])[0],
    [summary]
  );

  const heldHolds = holds.filter((h) => h.status === 'held' || h.status === 'disputed');

  async function withdrawAll() {
    if (!defaultMethod) {
      setShowAddMethod(true);
      return;
    }
    if (!summary?.available) return;
    setBusy(true);
    try {
      await payments.withdraw({ amount: summary.available, methodId: defaultMethod.id });
      toast(t('pay.withdraw'));
      await load();
    } catch (err) {
      toast(err.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="pay-wrap">
        <div className="skeleton" style={{ height: 180 }} />
        <div className="skeleton" style={{ height: 120, marginTop: 14 }} />
      </div>
    );
  }

  return (
    <div className="pay-wrap">
      <header className="pay-head">
        <h1 className="pay-title">{t('pay.title')}</h1>
        <Pill tone="green">{t('brand.network')}</Pill>
      </header>

      {/* ---- Hero: net take-home + payout destination + primary CTA ---- */}
      <section className="pay-hero" aria-labelledby="pay-hero-amount">
        <p className="pay-hero-label">{t('pay.balance')}</p>
        <p className="pay-hero-amount" id="pay-hero-amount">
          {inr(summary?.available ?? 0, { decimals: 2 })}
        </p>

        {defaultMethod ? (
          <div className="pay-dest">
            <span className="pay-dest-kind">{defaultMethod.kind.toUpperCase()}</span>
            <span className="pay-dest-value">
              {defaultMethod.kind === 'upi'
                ? defaultMethod.upiId
                : `•••• ${defaultMethod.accountLast4}`}
            </span>
          </div>
        ) : (
          <p className="pay-dest-empty">{t('pay.method')} —</p>
        )}

        <button
          type="button"
          className="pay-cta"
          onClick={withdrawAll}
          disabled={busy || !(summary?.available > 0)}
        >
          {defaultMethod
            ? `${t('pay.withdraw')} · ${inr(summary?.available ?? 0)}`
            : t('pay.method')}
        </button>

        <p className="pay-hero-note">{t('pay.settlementNote')}</p>
      </section>

      {/* ---- Escrow passbook ---- */}
      <section className="pay-section" aria-labelledby="pay-escrow-h">
        <div className="pay-section-head">
          <h2 id="pay-escrow-h" className="pay-section-title">{t('pay.inEscrow')}</h2>
          <span className="pay-section-total">{inr(summary?.inEscrow ?? 0)}</span>
        </div>

        {heldHolds.length === 0 ? (
          <Card className="pay-empty">{t('pay.empty')}</Card>
        ) : (
          <ul className="pay-list">
            {heldHolds.map((h) => (
              <li key={h.id}>
                <Card className="pay-row">
                  <div className="pay-row-main">
                    <p className="pay-row-title">
                      {t('shift.workerReceives')} · {inr(h.workerAmount)}
                    </p>
                    <p className="pay-row-sub">
                      {t('shift.platformEscrow')} {inr(h.feeAmount)}
                    </p>
                  </div>
                  <Pill tone={h.status === 'disputed' ? 'red' : 'amber'}>
                    {h.status === 'disputed' ? t('pay.disputed') : t('pay.pending')}
                  </Pill>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Ledger ---- */}
      <section className="pay-section" aria-labelledby="pay-tx-h">
        <h2 id="pay-tx-h" className="pay-section-title">{t('pay.history')}</h2>
        {ledger.length === 0 ? (
          <Card className="pay-empty">{t('pay.empty')}</Card>
        ) : (
          <ul className="pay-list">
            {ledger.map((e) => (
              <li key={e.id}>
                <Card className="pay-row">
                  <div className="pay-row-main">
                    <p className="pay-row-title">{t(e.note || e.kind)}</p>
                    <p className="pay-row-sub">
                      {new Date(e.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span className={`pay-amount ${e.amount < 0 ? 'out' : 'in'}`}>
                    {e.amount < 0 ? '−' : '+'}
                    {inr(Math.abs(e.amount), { decimals: 2 })}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {showAddMethod && (
        <AddMethod
          onClose={() => setShowAddMethod(false)}
          onSaved={async () => {
            setShowAddMethod(false);
            await load();
          }}
        />
      )}
    </div>
  );
}

/** UPI / bank payout destination form. */
function AddMethod({ onClose, onSaved }) {
  const { t } = useI18n();
  const [kind, setKind] = useState('upi');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(ev) {
    ev.preventDefault();
    setBusy(true);
    setError('');
    try {
      await payments.addMethod(
        kind === 'upi' ? { kind, upiId } : { kind, accountNumber, ifsc }
      );
      onSaved();
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pay-modal-backdrop" role="dialog" aria-modal="true" aria-label={t('pay.method')}>
      <form className="pay-modal" onSubmit={save}>
        <h2 className="pay-section-title">{t('pay.method')}</h2>

        <div className="seg" role="tablist">
          {['upi', 'bank'].map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              className={`seg-item ${kind === k ? 'seg-on' : ''}`}
              onClick={() => setKind(k)}
            >
              {k.toUpperCase()}
            </button>
          ))}
        </div>

        {kind === 'upi' ? (
          <label className="field">
            <span className="field-label">{t('pay.upiId')}</span>
            <input
              className="input"
              value={upiId}
              onChange={(e) => setUpiId(e.target.value)}
              placeholder="name@bank"
              autoComplete="off"
            />
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field-label">{t('pay.accountNumber')}</span>
              <input
                className="input"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                inputMode="numeric"
              />
            </label>
            <label className="field">
              <span className="field-label">IFSC</span>
              <input
                className="input"
                value={ifsc}
                onChange={(e) => setIfsc(e.target.value.toUpperCase())}
              />
            </label>
          </>
        )}

        {error && <p className="field-error">{error}</p>}

        <div className="pay-modal-actions">
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="md" disabled={busy}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
