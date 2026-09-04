import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Button, Input, Select } from '../components/ui';
import { useAuth } from '../state';
import { ChefIcon, SpecialtyList } from '../icons';
import { toast } from '../ui';
import { Check, AlertCircle } from 'lucide-react';
import PasswordStrength from '../components/PasswordStrength';

const LANGS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Marathi'];
const EXPERIENCE = ['Just starting', '1–3 years', '4–7 years', '8+ years'];

function LogoTop() {
  return (
    <div className="flex justify-center mb-4.5">
      <span className="font-black text-[19px] tracking-tight inline-flex items-center gap-2 text-ink">
        <ChefIcon size={36} className="logo-icon" />
        <span>O<span className="text-primary">.</span>D<span className="text-primary">.</span>C</span>
      </span>
    </div>
  );
}

function Field({ label, hint, error, children, required }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">
        {label}
        {required && <span className="text-primary">*</span>}
      </span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</span>}
      {error && <span className="block mt-1.5 text-[13px] text-red font-semibold">{error}</span>}
    </label>
  );
}

function TagPicker({ options, value, onChange, multi = true, max = 5 }) {
  const toggle = (name) => {
    if (multi) {
      const has = value.includes(name);
      if (has) onChange(value.filter((v) => v !== name));
      else if (value.length < max) onChange([...value, name]);
    } else {
      onChange([name]);
    }
  };
  return (
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = value.includes(o.name);
        return (
          <button type="button" key={o.name} className={`inline-flex items-center gap-2 py-2.5 px-3.5 border-[1.5px] rounded-[14px] bg-card font-bold text-[14.5px] transition-all duration-100 ${on ? 'border-primary bg-secondary text-accent-dark' : 'border-border text-ink-soft'}`} onClick={() => toggle(o.name)}>
            <span>{o.name}</span>
            {on && <Check size={14} className="text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function StepperYears({ value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-card border-[1.5px] border-border rounded-2xl p-2 mt-1">
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <div className="text-center flex-1 min-w-0">
        <span className="text-[28px] font-extrabold tracking-tight">{value}</span>
        <span className="text-[15px] text-muted-foreground font-semibold ml-1">{value === 1 ? 'year' : 'years'}</span>
      </div>
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line" onClick={() => onChange(Math.min(40, value + 1))}>+</button>
    </div>
  );
}

export default function SignupForm() {
  const { role } = useParams();
  const nav = useNavigate();
  const { setUser } = useAuth();
  const valid = useMemo(() => ['manager', 'chef', 'waiter'].includes(role), [role]);

  const [form, setForm] = useState({
    name: '', phone: '', email: '', password: '',
    businessName: '', businessType: 'restaurant', businessAddress: '', licenseFile: '',
    specialties: [], yearsExperience: 2, certFile: '',
    experienceLevel: '', languages: [], idFile: '',
  });
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!valid) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">We could not find that signup type. <a href="#/signup">Choose again</a></span>
        </div>
      </div>
    );
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!terms) {
      setErr('Please accept the terms and privacy policy to continue.');
      return;
    }
    if (role === 'chef' && form.specialties.length === 0) {
      setErr('Pick at least one specialty so managers can find you.');
      return;
    }
    if (role === 'waiter' && !form.experienceLevel) {
      setErr('Tell us your experience level.');
      return;
    }
    if (role === 'manager' && !form.businessName) {
      setErr('Tell us your business name.');
      return;
    }
    setBusy(true);
    try {
      const data = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ role, ...form }) });
      sessionStorage.setItem('odc.pendingPhone', form.phone);
      sessionStorage.setItem('odc.pendingUserId', data.userId);
      nav('/verify');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgba(46,53,51,0.07)]">
        <LogoTop />
        <h1 className="text-2xl font-black text-center tracking-tight">{role === 'manager' ? 'Your business' : 'About you'}</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">A few details so we can match you well.</p>
        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{err}</span>
          </div>
        )}

        <form onSubmit={submit} className="mt-2">
          <Field label="Your full name" required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Priya Shah" />
          </Field>
          <Field label="Mobile number" required hint="We send a code to this number to keep accounts safe.">
            <Input value={form.phone} inputMode="tel" autoComplete="tel" onChange={(e) => set('phone', e.target.value)} placeholder="+91 99999 99999" />
          </Field>
          <Field label="Email" hint="Optional, but handy for receipts.">
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder="Create a strong password" />
            <PasswordStrength password={form.password} />
          </Field>

          {role === 'manager' && (
            <>
              <Field label="Business name" required>
                <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="e.g. Tandoor House" />
              </Field>
              <Field label="Kind of business" required>
                <Select value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                  <option value="restaurant">Restaurant</option>
                  <option value="bar">Bar / Pub</option>
                  <option value="hotel">Hotel</option>
                  <option value="cafe">Café</option>
                  <option value="other">Other venue</option>
                </Select>
              </Field>
              <Field label="Business address" required>
                <Input value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} placeholder="Area, city" />
              </Field>
              <Field label="Business license (optional)">
                <Input value={form.licenseFile} onChange={(e) => set('licenseFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          )}

          {role === 'chef' && (
            <>
              <Field label="What can you cook?" required hint="Pick as many as you like. Managers search by these.">
                <TagPicker options={SpecialtyList} value={form.specialties} onChange={(v) => set('specialties', v)} max={8} />
              </Field>
              <Field label="Years of cooking experience" required>
                <StepperYears value={form.yearsExperience} onChange={(v) => set('yearsExperience', v)} />
              </Field>
              <Field label="Food safety certificate (optional)">
                <Input value={form.certFile} onChange={(e) => set('certFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          )}

          {role === 'waiter' && (
            <>
              <Field label="Experience" required>
                <Select value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
                  <option value="">Choose…</option>
                  {EXPERIENCE.map((x) => <option key={x} value={x}>{x}</option>)}
                </Select>
              </Field>
              <Field label="Languages you speak" required hint="Pick the ones you are comfortable serving in.">
                <TagPicker options={LANGS.map((l) => ({ name: l }))} value={form.languages} onChange={(v) => set('languages', v)} max={6} />
              </Field>
              <Field label="ID proof (optional)">
                <Input value={form.idFile} onChange={(e) => set('idFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          )}

          <label className="flex mt-2 mb-4 items-start gap-2.5">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="w-5 h-5 mt-0.5 accent-primary" />
            <span className="text-xs">
              I agree to the <a href="#" className="text-accent-dark font-semibold">Terms of Service</a> and <a href="#" className="text-accent-dark font-semibold">Privacy Policy</a>.
            </span>
          </label>

          <Button className="w-full" type="submit" disabled={busy || !form.name || !form.phone || !form.password}>
            {busy ? 'Creating your account…' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
