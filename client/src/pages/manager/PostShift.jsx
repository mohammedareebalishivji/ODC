import React, { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import {
  Card, Field, TextInput, TextArea, Button, Seg, TagPicker, Stepper, TimePicker,
  Banner, toast, fmtDate,
} from '../../ui';
import { SpecialtyList, Icon } from '../../icons';

const nextDays = () => {
  const out = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ iso, label: fmtDate(iso), short: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) });
  }
  return out;
};

export default function PostShift() {
  const { user } = useAuth();
  const nav = useNavigate();
  if (user.role !== 'manager') return <Navigate to="/app" replace />;
  const [role, setRole] = useState('chef');
  const [specialty, setSpecialty] = useState([]);
  const [date, setDate] = useState('');
  const [startMin, setStartMin] = useState(600);
  const [endMin, setEndMin] = useState(960);
  const [payMin, setPayMin] = useState(100);
  const [payMax, setPayMax] = useState(150);
  const [locationName, setLocationName] = useState('');
  const [loc, setLoc] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [dressCode, setDressCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setDate(nextDays()[0]?.iso || ''); }, []);

  const getLoc = () => {
    setLocBusy(true);
    if (!navigator.geolocation) { setLocBusy(false); setErr('Location is not available on this browser — you can still post without it.'); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocBusy(false); toast('Location added — nearby workers can find you.'); },
      (e) => { setLocBusy(false); setErr('Could not get your location. You can still post — workers near us will see it.'); }
    );
  };

  const submit = async () => {
    setErr(null);
    if (role === 'chef' && !specialty.length) { setErr('Choose what kind of chef you need.'); return; }
    if (!date) { setErr('Pick a date.'); return; }
    const pMin = Number(payMin);
    const pMax = Number(payMax);
    if (!Number.isFinite(pMin) || pMin <= 0) { setErr('Enter a valid minimum pay amount.'); return; }
    if (!Number.isFinite(pMax) || pMax < pMin) { setErr('High end pay must be greater than or equal to minimum pay.'); return; }
    if (!locationName.trim()) { setErr('Tell us where the shift is.'); return; }
    setBusy(true);
    try {
      const data = await api('/api/shifts', {
        method: 'POST',
        body: JSON.stringify({
          role, specialty: specialty[0] || null, date, startMin, endMin,
          locationName, lat: loc?.lat, lng: loc?.lng, payMin: pMin, payMax: pMax,
          notes: [dressCode ? `Dress code: ${dressCode}` : null, notes].filter(Boolean).join(' · ') || null,
        }),
      });
      toast('Shift posted. It will close in 12 hours if no one accepts.', 'green');
      nav(`/app/shifts/${data.shift.id}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">Post a shift</p>
        <h1>Fill the gap</h1>
        <p className="hero-sub">Set the details below. Workers nearby who match get notified.</p>
      </div>

      {err ? <Banner tone="danger" className="mt16">{err}</Banner> : null}

      <Card className="mt16">
        <Field label="Who do you need?" required>
          <Seg options={[{ value: 'chef', label: 'Chef' }, { value: 'waiter', label: 'Waiter' }]} value={role} onChange={setRole} />
        </Field>

        {role === 'chef' ? (
          <Field label="What kind of chef?" required hint="You can browse more specialties on your profile later.">
            <TagPicker options={SpecialtyList} value={specialty} onChange={setSpecialty} max={1} multi={false} checkLabel="Add" />
          </Field>
        ) : null}

        <Field label="Date" required>
          <div className="tags">
            {nextDays().map((d) => (
              <button type="button" key={d.iso} className={`tag ${date === d.iso ? 'tag-on' : ''}`} onClick={() => setDate(d.iso)}>
                {d.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex" style={{ gap: 12 }}>
          <div style={{ flex: 1 }}><TimePicker label="Starts" value={startMin} onChange={setStartMin} /></div>
          <div style={{ flex: 1 }}><TimePicker label="Ends" value={endMin} onChange={setEndMin} /></div>
        </div>
      </Card>

      <Card className="mt16">
        <Field label="Pay per shift" required hint="Type an amount or use +/- buttons to set minimum and maximum pay.">
          <div className="stack">
            <Stepper label="Low end (Minimum)" value={payMin} min={10} max={100000} step={50} unit="/shift" onChange={setPayMin} />
            <Stepper label="High end (Maximum)" value={payMax} min={10} max={100000} step={50} unit="/shift" onChange={setPayMax} />
          </div>
          <div className="flex mt12" style={{ gap: 6, flexWrap: 'wrap' }}>
            <span className="small muted" style={{ alignSelf: 'center', marginRight: 4 }}>Quick presets:</span>
            {[
              { label: '₹300–₹500', min: 300, max: 500 },
              { label: '₹500–₹800', min: 500, max: 800 },
              { label: '₹1,000–₹1,500', min: 1000, max: 1500 },
              { label: '₹2,000–₹3,000', min: 2000, max: 3000 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ fontSize: 12, padding: '4px 10px', height: 'auto', minHeight: 28 }}
                onClick={() => { setPayMin(p.min); setPayMax(p.max); }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Field>
      </Card>

      <Card className="mt16">
        <Field label="Where is the shift?" required>
          <TextInput value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Venue name, area, city" />
        </Field>
        <Button variant="ghost" size="md" icon={<Icon name="Pin" size={18} />} onClick={getLoc} disabled={locBusy} className="mb8">
          {loc ? 'Location added — tap to re-pin' : locBusy ? 'Finding you…' : 'Add my current location'}
        </Button>
        {loc ? <p className="small muted">Using coordinates {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p> : null}
      </Card>

      <Card className="mt16">
        <Field label="Anything else the worker should know?" hint="Dress code, station, what the shift involves.">
          <TextInput value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder="Dress code (e.g. black chef coat)" />
          <div className="space-8" />
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Extra notes (optional)" rows={3} />
        </Field>
      </Card>

      <div className="space-16" />
      <Banner tone="info" className="mb16">
        <Icon name="Info" size={16} />
        This request will disappear in 12 hours if no one accepts.
      </Banner>
      <Button full size="lg" icon={<Icon name="CheckBig" size={20} />} onClick={submit} disabled={busy}>
        {busy ? 'Posting…' : 'Post this shift'}
      </Button>
    </>
  );
}