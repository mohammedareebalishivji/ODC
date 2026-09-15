import { useEffect, useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../../state';
import { api } from '../../api';
import { Card, Button, Input, Textarea } from '../../components/ui';
import { SpecialtyList } from '../../icons';
import { toast, fmtDate } from '../../ui';
import { AlertCircle, Info, MapPin, Check } from 'lucide-react';
import { useI18n } from '../../i18n';

function Pill({ tone = 'neutral', children }) {
  const toneMap = { green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', neutral: 'bg-paper-2 text-ink-soft', accent: 'bg-secondary text-accent-dark' };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${toneMap[tone] || toneMap.neutral}`}>{children}</span>;
}

function Field({ label, hint, error, children, required }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">{label}{required && <span className="text-primary">*</span>}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</span>}
      {error && <span className="block mt-1.5 text-[13px] text-red font-semibold">{error}</span>}
    </label>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="flex bg-paper-2 p-1 rounded-[14px]">
      {options.map((o) => (
        <button key={o.value} className={`flex-1 py-2.5 px-2 rounded-[11px] font-bold text-[14.5px] transition-all ${value === o.value ? 'bg-card text-ink shadow-[0_2px_6px_rgb(26 28 26 / 0.08)]' : 'text-muted-foreground'}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ label, value, min = 0, max = 100000, step = 10, unit, onChange, disabled }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));
  return (
    <div className="flex items-center justify-between gap-3 bg-card border-[1.5px] border-border rounded-2xl p-2">
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line disabled:opacity-40" disabled={disabled || Number(value) <= min} onClick={() => onChange(clamp(Number(value) - step))}>−</button>
      <div className="text-center flex-1 min-w-0">
        <div className="inline-flex items-center justify-center gap-1">
          <span className="text-2xl font-extrabold text-ink-soft">₹</span>
          <input type="text" inputMode="numeric" className="w-[120px] max-w-[160px] text-center text-[28px] font-extrabold tracking-tight text-ink bg-transparent border-none border-b-2 border-transparent px-1 py-0.5 rounded-md outline-none font-[inherit] transition-all duration-150 focus:border-b-primary focus:bg-card" value={value === '' ? '' : value} onChange={(e) => { const raw = e.target.value.replace(/[^0-9]/g, ''); onChange(raw === '' ? '' : Number(raw)); }} disabled={disabled} placeholder={String(min)} />
          {unit && <span className="text-[15px] text-muted-foreground font-semibold ml-1">{unit}</span>}
        </div>
        {label && <span className="block text-xs text-muted-foreground mt-0.5">{label}</span>}
      </div>
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line disabled:opacity-40" disabled={disabled || Number(value) >= max} onClick={() => onChange(clamp(Number(value) + step))}>+</button>
    </div>
  );
}

function TimePicker({ label, value, onChange }) {
  const hh = Math.floor(value / 60);
  const mm = value % 60;
  // Each select needs its own accessible name — the visible heading is a span,
  // so a screen reader would otherwise announce two unnamed combo boxes.
  const hourLabel = `${label} — hour`;
  const minuteLabel = `${label} — minute`;
  const selectCls = 'flex-1 min-h-[50px] rounded-[13px] border-[1.5px] border-border bg-card px-4 py-3 text-ink appearance-none text-center';
  return (
    <div role="group" aria-label={label}>
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">{label}</span>
      <div className="flex items-center gap-1.5">
        <select
          className={selectCls}
          aria-label={hourLabel}
          value={hh}
          onChange={(e) => onChange(Number(e.target.value) * 60 + mm)}
        >
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
        </select>
        <span className="text-xl font-extrabold" aria-hidden="true">:</span>
        <select
          className={selectCls}
          aria-label={minuteLabel}
          value={mm}
          onChange={(e) => onChange(hh * 60 + Number(e.target.value))}
        >
          {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
        </select>
      </div>
    </div>
  );
}

function TagPicker({ options, value, onChange, multi = true, max = 5, checkLabel }) {
  const toggle = (name) => {
    if (multi) {
      const has = value.includes(name);
      if (has) onChange(value.filter((v) => v !== name));
      else if (value.length < max) onChange([...value, name]);
    } else { onChange([name]); }
  };
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = value.includes(o.name);
        return (
          <button type="button" key={o.name} className={`inline-flex items-center gap-2 py-2.5 px-3.5 border-[1.5px] rounded-[14px] bg-card font-bold text-[14.5px] transition-all duration-100 ${on ? 'border-primary bg-secondary text-accent-dark' : 'border-border text-ink-soft'}`} onClick={() => toggle(o.name)}>
            <span>{o.name}</span>
            {on && <Check size={14} className="text-primary" />}
            {!on && checkLabel && <span className="text-muted-foreground text-xs">{checkLabel}</span>}
          </button>
        );
      })}
    </div>
  );
}

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
  const { t } = useI18n();
  const { user } = useAuth();
  const nav = useNavigate();
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

  // Guard runs after every hook — an early return above them changes the hook
  // count between renders and throws "Rendered fewer hooks than expected".
  if (user.role !== 'manager') return <Navigate to="/app" replace />;

  const getLoc = () => {
    setLocBusy(true);
    if (!navigator.geolocation) { setLocBusy(false); setErr(t('geo.unsupported')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocBusy(false); toast(t('geo.added')); },
      (e) => { setLocBusy(false); setErr(t('geo.failed')); }
    );
  };

  const submit = async () => {
    setErr(null);
    if (role === 'chef' && !specialty.length) { setErr(t('val.chefKind')); return; }
    if (!date) { setErr(t('val.pickDate')); return; }
    const pMin = Number(payMin);
    const pMax = Number(payMax);
    if (!Number.isFinite(pMin) || pMin <= 0) { setErr(t('val.minPay')); return; }
    if (!Number.isFinite(pMax) || pMax < pMin) { setErr(t('val.maxPay')); return; }
    if (!locationName.trim()) { setErr(t('val.whereShift')); return; }
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
      toast(t('toast.shiftPosted12h'), 'green');
      nav(`/app/shifts/${data.shift.id}`);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{t('post.title')}</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{t('post.eyebrow')}</h1>
        <p className="text-muted-foreground mt-2 text-[15px]">{t('post.sub')}</p>
      </div>

      {err && (
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mt-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{err}</span>
        </div>
      )}

      <Card className="mt-4">
        <Field label={t('post.whoNeed')} required>
          <Seg options={[{ value: 'chef', label: 'Chef' }, { value: 'waiter', label: 'Waiter' }]} value={role} onChange={setRole} />
        </Field>
        {role === 'chef' && (
          <Field label={t('post.whatChef')} required hint={t('post.chefHint')}>
            <TagPicker options={SpecialtyList} value={specialty} onChange={setSpecialty} max={1} multi={false} checkLabel="Add" />
          </Field>
        )}
        <Field label={t('lbl.date')} required>
          <div className="flex flex-wrap gap-2.5">
            {nextDays().map((d) => (
              <button type="button" key={d.iso} className={`inline-flex items-center gap-2 py-2.5 px-3.5 border-[1.5px] rounded-[14px] bg-card font-bold text-[14.5px] transition-all duration-100 ${date === d.iso ? 'border-primary bg-secondary text-accent-dark' : 'border-border text-ink-soft'}`} onClick={() => setDate(d.iso)}>
                {d.label}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex gap-3">
          <div className="flex-1"><TimePicker label={t('lbl.starts')} value={startMin} onChange={setStartMin} /></div>
          <div className="flex-1"><TimePicker label={t('lbl.ends')} value={endMin} onChange={setEndMin} /></div>
        </div>
      </Card>

      <Card className="mt-4">
        <Field label={t('post.pay')} required hint={t('post.payHint')}>
          <div className="flex flex-col gap-3">
            <Stepper label={t('post.payLow')} value={payMin} min={10} max={100000} step={50} unit="/shift" onChange={setPayMin} />
            <Stepper label={t('post.payHigh')} value={payMax} min={10} max={100000} step={50} unit="/shift" onChange={setPayMax} />
          </div>
          <div className="flex mt-3 gap-1.5 flex-wrap items-center">
            <span className="text-xs text-muted-foreground mr-1">{t('post.presets')}</span>
            {[{ label: '₹300–₹500', min: 300, max: 500 }, { label: '₹500–₹800', min: 500, max: 800 }, { label: '₹1,000–₹1,500', min: 1000, max: 1500 }, { label: '₹2,000–₹3,000', min: 2000, max: 3000 }].map((p) => (
              <button key={p.label} type="button" className="py-1 px-2.5 rounded-xl border border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2 h-auto min-h-[28px]" onClick={() => { setPayMin(p.min); setPayMax(p.max); }}>{p.label}</button>
            ))}
          </div>
        </Field>
      </Card>

      <Card className="mt-4">
        <Field label={t('post.where')} required>
          <Input value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder={t('post.wherePlaceholder')} />
        </Field>
        <Button variant="ghost" size="md" icon={<MapPin size={18} />} onClick={getLoc} disabled={locBusy} className="mb-2">
          {loc ? t('geo.repin') : locBusy ? t('geo.finding') : t('geo.addCurrent')}
        </Button>
        {loc && <p className="text-xs text-muted-foreground">Using coordinates {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p>}
      </Card>

      <Card className="mt-4">
        <Field label={t('post.notesLabel')} hint={t('post.notesHint')}>
          <Input value={dressCode} onChange={(e) => setDressCode(e.target.value)} placeholder={t('post.dressPlaceholder')} />
          <div className="h-2" />
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('post.extraPlaceholder')} rows={3} />
        </Field>
      </Card>

      <div className="h-4" />
      <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue mb-4">
        <Info size={16} className="mt-0.5 shrink-0" /><span className="flex-1">{t('post.expiryNote')}</span>
      </div>
      <Button className="w-full" size="lg" icon={<Check size={20} />} onClick={submit} disabled={busy}>
        {busy ? t('btn.posting') : t('btn.postThisShift')}
      </Button>
    </>
  );
}
