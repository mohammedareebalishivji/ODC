import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Button, Input, Select } from '../components/ui';
import { useAuth } from '../state';
import { ChefIcon, SpecialtyList } from '../icons';

import { Check, AlertCircle } from 'lucide-react';
import PasswordStrength from '../components/PasswordStrength';
import { useI18n } from '../i18n';

const LANGS = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Gujarati', 'Bengali', 'Punjabi', 'Marathi'];
// value = what we persist (stable across languages); labelKey = what we show.
const EXPERIENCE = [
  { value: 'Just starting', labelKey: 'exp.justStarting' },
  { value: '1–3 years', labelKey: 'exp.1to3' },
  { value: '4–7 years', labelKey: 'exp.4to7' },
  { value: '8+ years', labelKey: 'exp.8plus' },
];

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
  const { t } = useI18n();
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
          <span className="flex-1">{t('sf.badType')} <a href="#/signup">{t('sf.chooseAgain')}</a></span>
        </div>
      </div>
    );
  }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (!terms) {
      setErr(t('val.acceptTerms'));
      return;
    }
    if (role === 'chef' && form.specialties.length === 0) {
      setErr(t('val.pickSpecialty'));
      return;
    }
    if (role === 'waiter' && !form.experienceLevel) {
      setErr(t('val.experienceLevel'));
      return;
    }
    if (role === 'manager' && !form.businessName) {
      setErr(t('val.businessName'));
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
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgb(26 28 26 / 0.07)]">
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
          <Field label={t('sf.fullName')} required>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('sf.namePlaceholder')} />
          </Field>
          <Field label={t('sf.mobile')} required hint={t('sf.mobileHint')}>
            <Input value={form.phone} inputMode="tel" autoComplete="tel" onChange={(e) => set('phone', e.target.value)} placeholder="+91 99999 99999" />
          </Field>
          <Field label={t('lbl.email')} hint={t('sf.emailHint')}>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" />
          </Field>
          <Field label={t('lbl.password')} required>
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} autoComplete="new-password" placeholder={t('sf.passwordPlaceholder')} />
            <PasswordStrength password={form.password} />
          </Field>

          {role === 'manager' && (
            <>
              <Field label={t('sf.businessName')} required>
                <Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} placeholder={t('sf.businessPlaceholder')} />
              </Field>
              <Field label={t('sf.businessKind')} required>
                <Select value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                  <option value="restaurant">{t('sf.restaurant')}</option>
                  <option value="bar">{t('sf.bar')}</option>
                  <option value="hotel">{t('sf.hotel')}</option>
                  <option value="cafe">Café</option>
                  <option value="other">{t('sf.otherVenue')}</option>
                </Select>
              </Field>
              <Field label={t('sf.businessAddress')} required>
                <Input value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} placeholder={t('sf.areaCity')} />
              </Field>
              <Field label={t('sf.license')}>
                <Input value={form.licenseFile} onChange={(e) => set('licenseFile', e.target.value)} placeholder={t('sf.filePlaceholder')} />
              </Field>
            </>
          )}

          {role === 'chef' && (
            <>
              <Field label={t('sf.whatCook')} required hint={t('sf.cookHint')}>
                <TagPicker options={SpecialtyList} value={form.specialties} onChange={(v) => set('specialties', v)} max={8} />
              </Field>
              <Field label={t('sf.yearsExp')} required>
                <StepperYears value={form.yearsExperience} onChange={(v) => set('yearsExperience', v)} />
              </Field>
              <Field label={t('sf.foodCert')}>
                <Input value={form.certFile} onChange={(e) => set('certFile', e.target.value)} placeholder={t('sf.filePlaceholder')} />
              </Field>
            </>
          )}

          {role === 'waiter' && (
            <>
              <Field label={t('sf.experience')} required>
                <Select value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
                  <option value="">{t('sf.choose')}</option>
                  {EXPERIENCE.map((x) => <option key={x.value} value={x.value}>{t(x.labelKey)}</option>)}
                </Select>
              </Field>
              <Field label={t('sf.languages')} required hint={t('sf.languagesHint')}>
                <TagPicker options={LANGS.map((l) => ({ name: l }))} value={form.languages} onChange={(v) => set('languages', v)} max={6} />
              </Field>
              <Field label={t('lbl.idProof')}>
                <Input value={form.idFile} onChange={(e) => set('idFile', e.target.value)} placeholder={t('sf.filePlaceholder')} />
              </Field>
            </>
          )}

          <label className="flex mt-2 mb-4 items-start gap-2.5">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="w-5 h-5 mt-0.5 accent-primary" />
            <span className="text-xs">
              I agree to the <a href="#" className="text-accent-dark font-semibold">{t('sf.terms')}</a> and <a href="#" className="text-accent-dark font-semibold">{t('sf.privacy')}</a>.
            </span>
          </label>

          <Button className="w-full" type="submit" disabled={busy || !form.name || !form.phone || !form.password}>
            {busy ? t('btn.creatingAccount') : t('common.next')}
          </Button>
        </form>
      </div>
    </div>
  );
}
