import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { inr } from '../../apiEndpoints';

/**
 * Integrated Treasury & Liquidity Terminal.
 *
 * Platform-wide view of the escrow ledger: what is held, what is frozen by a
 * dispute, what has settled, and what O.D.C has earned in fees. Every figure
 * is derived from escrow_holds / ledger_entries rather than a running total,
 * so the terminal and the ledger can never disagree.
 */
export default function Treasury({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/tail/z7k9x2/admin/treasury', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Could not load the treasury terminal.');
      setData(await r.json());
    } catch (err) {
      setError(err.message);
      setData({ totals: {}, holds: [] });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const tiles = useMemo(() => {
    const t = data?.totals || {};
    return [
      { key: 'held', label: 'Held in escrow', value: t.held, tone: 'teal' },
      { key: 'disputed', label: 'Frozen by dispute', value: t.disputed, tone: 'red' },
      { key: 'released', label: 'Settled to crew', value: t.released, tone: 'green' },
      { key: 'fees', label: 'Platform fees earned', value: t.fees, tone: 'amber' },
    ];
  }, [data]);

  if (!data) {
    return <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5"><div className="skeleton h-[60px]" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Integrated treasury &amp; liquidity terminal</h1>
      <p className="text-muted-foreground text-[14.5px] mb-5">
        Live position across every escrow hold on the platform.
      </p>

      {error && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="tre-tiles">
        {tiles.map((t) => (
          <div key={t.key} className={`tre-tile tre-${t.tone}`}>
            <p className="tre-tile-label">{t.label}</p>
            <p className="tre-tile-value">{inr(t.value ?? 0)}</p>
            <p className="tre-tile-count">{data.totals?.[`${t.key}Count`] ?? 0} shifts</p>
          </div>
        ))}
      </div>

      <section className="tre-section">
        <h2 className="tre-h2">Universal settlement matrix</h2>
        {(!data.holds || data.holds.length === 0) ? (
          <div className="bg-card border-[1.5px] border-border rounded-[18px] p-8 text-center text-muted-foreground">
            No escrow activity yet.
          </div>
        ) : (
          <div className="tre-table-wrap">
            <table className="tre-table">
              <thead>
                <tr>
                  <th scope="col">Venue</th>
                  <th scope="col">Crew</th>
                  <th scope="col" className="num">Gross</th>
                  <th scope="col" className="num">Fee</th>
                  <th scope="col" className="num">Net to crew</th>
                  <th scope="col">State</th>
                  <th scope="col">Opened</th>
                </tr>
              </thead>
              <tbody>
                {data.holds.map((h) => (
                  <tr key={h.id}>
                    <td>{h.venue || '—'}</td>
                    <td>{h.worker || '—'}</td>
                    <td className="num">{inr(h.grossAmount)}</td>
                    <td className="num">{inr(h.feeAmount)}</td>
                    <td className="num">{inr(h.workerAmount)}</td>
                    <td>
                      <span className={`pill ${
                        h.status === 'released' ? 'pill-green'
                          : h.status === 'disputed' ? 'pill-red'
                            : h.status === 'refunded' ? 'pill-neutral' : 'pill-amber'
                      }`}>
                        {h.status}
                      </span>
                    </td>
                    <td>{new Date(h.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
