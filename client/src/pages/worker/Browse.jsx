import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import ShiftCard from '../../components/ShiftCard';
import { Button } from '../../components/ui';
import { toast, useGeolocation } from '../../ui';
import { AlertCircle, Zap } from 'lucide-react';

function EmptyState({ title, sub, children }) {
  return (
    <div className="text-center py-11 px-6">
      <h3 className="text-lg font-extrabold">{title}</h3>
      {sub && <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">{sub}</p>}
      {children && <div className="mt-4.5 flex justify-center">{children}</div>}
    </div>
  );
}

export default function Browse() {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  if (user.role === 'manager') return <Navigate to="/app" replace />;
  const { pos, err: geoErr } = useGeolocation();
  const [shifts, setShifts] = useState(null);
  const [err, setErr] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (usePos) => {
    try {
      const q = usePos ? `?lat=${usePos.lat}&lng=${usePos.lng}` : '';
      const data = await api(`/api/shifts/open${q}`);
      setShifts(data.shifts);
      setErr(null);
    } catch (ex) { setErr(ex.message); }
  }, []);

  useEffect(() => { if (pos) load(pos); else load(); }, [pos, load]);

  const toggleFree = async () => {
    const next = !user.available;
    try {
      await api('/api/me/availability', { method: 'POST', body: JSON.stringify({ available: next }) });
      setUser({ ...user, available: next });
      toast(next ? 'Free now — we will ping you about matching shifts.' : 'Marked as not available.');
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const refresh = async () => { setRefreshing(true); await load(pos); setRefreshing(false); };

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">Available shifts</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">Work near you</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">
          {pos ? 'Showing shifts close to you.' : geoErr ? 'Location off — showing all open shifts for your role.' : 'Finding shifts close to you…'}
        </p>
      </div>

      {!user.available && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-amber-soft text-[#8f5a08] mt-4">
          <span className="flex-1">It looks like you are marked as not available. Flip it on to see starts and get notified.</span>
          <button className="shrink-0 p-0.5 text-inherit opacity-70 hover:opacity-100" onClick={toggleFree}>Turn on</button>
        </div>
      )}

      <div className="flex items-center mt-4 mb-4">
        <span className="text-muted-foreground text-xs flex-1">{shifts ? `${shifts.length} open shift${shifts.length === 1 ? '' : 's'} for you` : 'Loading…'}</span>
        <button className="py-1.5 px-3 rounded-[10px] border-[1.5px] border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{err}</span>
        </div>
      )}

      {shifts && shifts.length === 0 ? (
        <div className="text-center py-11 px-6">
          <h3 className="text-lg font-extrabold">No shifts right now</h3>
          <p className="text-muted-foreground mt-2 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
            {user.available ? 'Nothing matching you at the moment. Shifts last 12 hours — check back or keep your phone open for pings.' : 'You are not marked as available. Turn on Free to see open shifts.'}
          </p>
          {!user.available && (
            <div className="mt-4.5 flex justify-center">
              <Button variant="soft" icon={<Zap size={18} />} onClick={toggleFree}>I am free today</Button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {shifts && shifts.map((s) => <ShiftCard key={s.id} shift={s} onOpen={() => nav(`/app/shifts/${s.id}`)} />)}
        </div>
      )}
    </>
  );
}
