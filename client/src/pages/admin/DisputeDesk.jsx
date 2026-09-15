import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Check, RotateCcw } from 'lucide-react';
import { toast } from '../../ui';

/**
 * Super Admin — Dispute Resolution & Escrow Mediation Desk.
 *
 * Settling a dispute moves real money, so each decision asks for an explicit
 * confirmation and records the mediator's note against the audit log.
 */
const REASON_LABEL = {
  no_show: 'No show',
  late: 'Late arrival',
  quality: 'Work quality',
  underpaid: 'Underpayment',
  unsafe: 'Unsafe conditions',
  other: 'Other',
};

export default function DisputeDesk({ token }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/disputes/admin/queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error('Could not load the dispute queue.');
      const d = await r.json();
      setRows(d.disputes || []);
    } catch (err) {
      setError(err.message);
      setRows([]);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function resolve(id, resolution) {
    const label =
      resolution === 'release_worker' ? 'release the money to the worker' : 'refund the venue';
    if (!window.confirm(`Settle this dispute and ${label}? This moves funds and cannot be undone.`)) {
      return;
    }
    setBusyId(id);
    try {
      const r = await fetch(`/api/disputes/admin/${id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resolution, note: notes[id] || '' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not settle this dispute.');
      toast('Dispute settled.', 'green');
      await load();
    } catch (err) {
      toast(err.message, 'red');
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) {
    return <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5"><div className="skeleton h-[60px]" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Dispute resolution &amp; escrow mediation</h1>
      <p className="text-muted-foreground text-[14.5px] mb-5">
        Escrow on a disputed shift is frozen until it is settled here.
      </p>

      {error && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-8 text-center text-muted-foreground">
          No disputes open. Escrow is flowing normally.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((d) => (
            <article key={d.id} className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-bold text-[16px]">{d.locationName || 'Shift'}</h2>
                  <p className="text-muted-foreground text-[13.5px] mt-0.5">
                    {REASON_LABEL[d.reason] || d.reason} · raised {new Date(d.createdAt).toLocaleString()}
                  </p>
                </div>
                <span className="pill pill-amber">{d.status.replace('_', ' ')}</span>
              </div>

              {d.detail && (
                <p className="mt-3 text-[14.5px] leading-relaxed bg-paper-2 rounded-[12px] p-3">
                  {d.detail}
                </p>
              )}

              <label className="block mt-4">
                <span className="block font-bold text-[13.5px] mb-1.5">Mediation note</span>
                <input
                  className="input"
                  value={notes[d.id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="Why this outcome — shown to both parties"
                />
              </label>

              <div className="flex gap-2.5 mt-4 flex-wrap">
                <button
                  className="btn btn-green btn-md"
                  disabled={busyId === d.id}
                  onClick={() => resolve(d.id, 'release_worker')}
                >
                  <Check size={16} /> Release to worker
                </button>
                <button
                  className="btn btn-ghost btn-md"
                  disabled={busyId === d.id}
                  onClick={() => resolve(d.id, 'refund_manager')}
                >
                  <RotateCcw size={16} /> Refund the venue
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** Super Admin — Account Verification & Compliance Queue. */
export function VerificationQueue({ token }) {
  const [rows, setRows] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notes, setNotes] = useState({});

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/kyc/admin/queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      setRows(d.documents || []);
    } catch {
      setRows([]);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function review(id, decision) {
    setBusyId(id);
    try {
      const r = await fetch(`/api/kyc/admin/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision, note: notes[id] || '' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not record that decision.');
      toast(decision === 'verified' ? 'Document approved.' : 'Document rejected.', 'green');
      await load();
    } catch (err) {
      toast(err.message, 'red');
    } finally {
      setBusyId(null);
    }
  }

  if (rows === null) {
    return <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5"><div className="skeleton h-[60px]" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Account verification &amp; compliance</h1>
      <p className="text-muted-foreground text-[14.5px] mb-5">
        Approving an Aadhaar document grants the verified badge shown to venues.
      </p>

      {rows.length === 0 ? (
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-8 text-center text-muted-foreground">
          Nothing awaiting verification.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((d) => (
            <article key={d.id} className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-bold text-[16px]">{d.userName}</h2>
                  <p className="text-muted-foreground text-[13.5px] mt-0.5">
                    {d.userRole} · {d.docType.toUpperCase()}
                    {d.numberLast4 ? ` •••• ${d.numberLast4}` : ''}
                  </p>
                </div>
                <span className="pill pill-amber">{d.status}</span>
              </div>

              <label className="block mt-4">
                <span className="block font-bold text-[13.5px] mb-1.5">Reviewer note</span>
                <input
                  className="input"
                  value={notes[d.id] || ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                  placeholder="Optional — shown to the applicant"
                />
              </label>

              <div className="flex gap-2.5 mt-4">
                <button
                  className="btn btn-green btn-md"
                  disabled={busyId === d.id}
                  onClick={() => review(d.id, 'verified')}
                >
                  <Check size={16} /> Approve
                </button>
                <button
                  className="btn btn-danger btn-md"
                  disabled={busyId === d.id}
                  onClick={() => review(d.id, 'rejected')}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
