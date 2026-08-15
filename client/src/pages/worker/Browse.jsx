import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import ShiftCard from '../../components/ShiftCard';
import { Button, Banner, EmptyState, useGeolocation, toast } from '../../ui';
import { Icon } from '../../icons';

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
      const q = usePos
        ? `?lat=${usePos.lat}&lng=${usePos.lng}`
        : '';
      const data = await api(`/api/shifts/open${q}`);
      setShifts(data.shifts);
      setErr(null);
    } catch (ex) {
      setErr(ex.message);
    }
  }, []);

  useEffect(() => {
    if (pos) load(pos);
    else load();
  }, [pos, load]);

  const toggleFree = async () => {
    const next = !user.available;
    try {
      await api('/api/me/availability', { method: 'POST', body: JSON.stringify({ available: next }) });
      setUser({ ...user, available: next });
      toast(next ? 'Free now — we will ping you about matching shifts.' : 'Marked as not available.');
    } catch (ex) {
      toast(ex.message, 'red');
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load(pos);
    setRefreshing(false);
  };

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">Available shifts</p>
        <h1>Work near you</h1>
        <p className="hero-sub">
          {pos ? 'Showing shifts close to you.' : geoErr ? 'Location off — showing all open shifts for your role.' : 'Finding shifts close to you…'}
        </p>
      </div>

      {!user.available ? (
        <Banner tone="warn" className="mt16">
          It looks like you are marked as not available. Flip it on to see starts and get notified.
          <button className="banner-x" onClick={toggleFree} style={{ opacity: 1 }}>Turn on</button>
        </Banner>
      ) : null}

      <div className="flex mt16 mb16">
        <span className="muted small grow">{shifts ? `${shifts.length} open shift${shifts.length === 1 ? '' : 's'} for you` : 'Loading…'}</span>
        <button className="ghost-btn" onClick={refresh} disabled={refreshing}>
          <Icon name="Plasma" size={14} style={{ verticalAlign: '-2px' }} /> {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {err ? <Banner tone="danger" className="mb16">{err}</Banner> : null}

      {shifts && shifts.length === 0 ? (
        <EmptyState
          title="No shifts right now"
          sub={user.available ? 'Nothing matching you at the moment. Shifts last 12 hours — check back or keep your phone open for pings.' : 'You are not marked as available. Turn on Free to see open shifts.'}
        >
          {!user.available ? <Button variant="soft" icon={<Icon name="Bolt" size={18} />} onClick={toggleFree}>I am free today</Button> : null}
        </EmptyState>
      ) : (
        <div className="stack">
          {shifts.map((s) => <ShiftCard key={s.id} shift={s} onOpen={() => nav(`/app/shifts/${s.id}`)} />)}
        </div>
      )}
    </>
  );
}