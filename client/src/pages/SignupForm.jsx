import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { toast, Banner, Button, Field, Select, TextInput, TextArea, TagPicker } from '../ui';
import { logoTop } from '../ui';
import { useAuth } from '../state';
import { SpecialtyList } from '../icons';
import PasswordStrength from '../components/PasswordStrength';

const LANGS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Marathi'];
const EXPERIENCE = ['Just starting', '1–3 years', '4–7 years', '8+ years'];

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
      <div className="auth-wrap">
        <Banner tone="danger">We could not find that signup type. <a href="#/signup">Choose again</a></Banner>
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
    <div className="auth-wrap">
      <div className="auth-panel">
        {logoTop()}
        <h1 className="auth-title">{role === 'manager' ? 'Your business' : role === 'chef' ? 'About you' : 'About you'}</h1>
        <p className="auth-sub">A few details so we can match you well.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}

        <form onSubmit={submit} className="mt8">
          <Field label="Your full name" required>
            <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Priya Shah" />
          </Field>
          <Field label="Mobile number" required hint="We send a code to this number to keep accounts safe. You will not be charged.">
            <TextInput value={form.phone} inputMode="tel" autoComplete="tel" onChange={(e) => set('phone', e.target.value)} placeholder="+91 99999 99999" />
          </Field>
          <Field label="Email" hint="Optional, but handy for receipts.">
            <TextInput type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label="Password" required>
            <TextInput type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder="Create a strong password" />
            <PasswordStrength password={form.password} />
          </Field>

          {role === 'manager' ? (
            <>
              <Field label="Business name" required>
                <TextInput value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder="e.g. Tandoor House" />
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
                <TextInput value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} placeholder="Area, city" />
              </Field>
              <Field label="Business license (optional)" hint="Uploading it lets us show you as a Verified business faster.">
                <TextInput value={form.licenseFile} onChange={(e) => set('licenseFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          ) : null}

          {role === 'chef' ? (
            <>
              <Field label="What can you cook?" required hint="Pick as many as you like. Managers search by these.">
                <TagPicker options={SpecialtyList} value={form.specialties} onChange={(v) => set('specialties', v)} max={8} />
              </Field>
              <Field label="Years of cooking experience" required>
                <StepperYears value={form.yearsExperience} onChange={(v) => set('yearsExperience', v)} />
              </Field>
              <Field label="Food safety certificate (optional)" hint="Helps you get the Verified badge faster.">
                <TextInput value={form.certFile} onChange={(e) => set('certFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          ) : null}

          {role === 'waiter' ? (
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
                <TextInput value={form.idFile} onChange={(e) => set('idFile', e.target.value)} placeholder="File name or link" />
              </Field>
            </>
          ) : null}

          <label className="flex mt8 mb16" style={{ alignItems: 'flex-start', gap: 10 }}>
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} style={{ width: 22, height: 22, marginTop: 2 }} />
            <span className="small">
              I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>.
            </span>
          </label>

          <Button full type="submit" disabled={busy || !form.name || !form.phone || !form.password}>
            {busy ? 'Creating your account…' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function StepperYears({ value, onChange }) {
  return (
    <div className="stepper-row" style={{ marginTop: 4 }}>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <div className="stepper-val">
        <span className="stepper-big">{value}</span>
        <span className="stepper-unit">{value === 1 ? 'year' : 'years'}</span>
      </div>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.min(40, value + 1))}>+</button>
    </div>
  );
}