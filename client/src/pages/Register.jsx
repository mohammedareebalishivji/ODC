import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, Shield } from 'lucide-react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { LanguageToggle, ThemeToggle } from '../components/LanguageToggle';
import PasswordStrength from '../components/PasswordStrength';
import Logo from '../components/Logo';
import VoiceGuide from '../components/VoiceGuide';

/**
 * O.D.C Instant Registration & KYC Verification.
 *
 * One bilingual page: pick a role, fill the short form, get an OTP. The
 * deeper role-specific profile lives at /signup/:role and is reachable from
 * here for anyone who wants to complete it up front.
 */
const ROLES = [
  {
    key: 'chef',
    titleKey: 'reg.role.chef',
    descKey: 'reg.role.chefDesc',
    tone: 'amber',
  },
  {
    key: 'waiter',
    titleKey: 'reg.role.waiter',
    descKey: 'reg.role.waiterDesc',
    tone: 'blue',
  },
  {
    key: 'manager',
    titleKey: 'reg.role.manager',
    descKey: 'reg.role.managerDesc',
    tone: 'green',
  },
];

const TRUST = ['kyc.aadhaar', 'kyc.digilocker', 'auth.securityNote'];

export default function Register() {
  const { t } = useI18n();
  const nav = useNavigate();

  const [role, setRole] = useState('chef');
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [specialty, setSpecialty] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const phoneDigits = form.phone.replace(/\D/g, '').slice(-10);
  const ready = useMemo(
    () =>
      form.name.trim().length >= 2 &&
      phoneDigits.length === 10 &&
      form.password.length >= 8 &&
      terms &&
      (role !== 'chef' || specialty.trim()) &&
      (role !== 'manager' || businessName.trim()),
    [form, phoneDigits, terms, role, specialty, businessName]
  );

  async function submit(ev) {
    ev.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      const payload = {
        role,
        name: form.name.trim(),
        phone: `+91${phoneDigits}`,
        email: form.email.trim() || undefined,
        password: form.password,
        ...(role === 'chef'
          ? { specialties: specialty.split(',').map((s) => s.trim()).filter(Boolean), yearsExperience: 1 }
          : {}),
        ...(role === 'waiter' ? { experienceLevel: 'mid', languages: [] } : {}),
        ...(role === 'manager'
          ? { businessName: businessName.trim(), businessType: 'restaurant', businessAddress: '—' }
          : {}),
      };
      await api('/api/auth/signup', { method: 'POST', body: JSON.stringify(payload) });
      // VerifyOtp reads the pending number from sessionStorage, not the URL.
      sessionStorage.setItem('odc.pendingPhone', `+91${phoneDigits}`);
      nav('/verify');
    } catch (err) {
      setError(err.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="otp-page">
      <header className="otp-top reg-top">
        <Logo size={34} />
        <span className="otp-top-right">
          <LanguageToggle />
          <ThemeToggle />
        </span>
      </header>

      <main className="reg-wrap">
        <section className="otp-card">
          <p className="otp-eyebrow">{t('kyc.title')}</p>
          <h1 className="otp-title">{t('reg.title')}</h1>
          <p className="otp-sub">{t('reg.subtitle')}</p>
          <div className="otp-voice">
            <VoiceGuide text={`${t('reg.title')}. ${t('reg.subtitle')}`} />
          </div>

          <fieldset className="otp-roles reg-roles">
            <legend className="otp-legend">{t('reg.selectRole')}</legend>
            {ROLES.map((r) => (
              <label key={r.key} className={`otp-role ${role === r.key ? 'on' : ''}`}>
                <input
                  type="radio"
                  name="reg-role"
                  value={r.key}
                  checked={role === r.key}
                  onChange={() => setRole(r.key)}
                  className="sr-only"
                />
                <span className="otp-role-title">{t(r.titleKey)}</span>
                <span className="otp-role-desc">{t(r.descKey)}</span>
              </label>
            ))}
          </fieldset>

          <form onSubmit={submit} className="otp-form">
            <label className="field">
              <span className="field-label">{t('reg.fullName')}</span>
              <input className="input" value={form.name} onChange={set('name')} autoComplete="name" />
            </label>

            <label className="field">
              <span className="field-label">{t('auth.mobileLabel')}</span>
              <span className="otp-phone">
                <span className="otp-cc">+91</span>
                <input
                  className="input otp-phone-input"
                  value={form.phone}
                  onChange={set('phone')}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                />
              </span>
            </label>

            {role === 'chef' && (
              <label className="field">
                <span className="field-label">{t('reg.specialties')}</span>
                <input
                  className="input"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  placeholder="Tandoor, Continental"
                />
                <span className="field-hint">{t('reg.specialtiesHint')}</span>
              </label>
            )}

            {role === 'manager' && (
              <label className="field">
                <span className="field-label">{t('reg.businessName')}</span>
                <input
                  className="input"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
              </label>
            )}

            <label className="field">
              <span className="field-label">{t('reg.email')}</span>
              <input className="input" type="email" value={form.email} onChange={set('email')} autoComplete="email" />
            </label>

            <label className="field">
              <span className="field-label">{t('auth.password')}</span>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
              <PasswordStrength password={form.password} />
            </label>

            <label className="reg-terms">
              <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>{t('reg.terms')}</span>
            </label>

            {error && <p className="field-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={busy || !ready}>
              {t('reg.submit')}
            </button>
          </form>

          <div className="otp-alt">
            <Link to={`/signup/${role}`}>{t('reg.fullProfile')}</Link>
            <Link to="/login">{t('auth.signIn')} →</Link>
          </div>
        </section>

        {/* --- Trust rail, as in the design's right-hand column --- */}
        <aside className="reg-side">
          <div className="csc-panel">
            <h2 className="csc-h3">{t('reg.whyVerify')}</h2>
            <ul className="reg-trust">
              {TRUST.map((k) => (
                <li key={k}>
                  <Check size={15} aria-hidden="true" /> {t(k)}
                </li>
              ))}
            </ul>
          </div>
          <div className="csc-panel reg-guarantee">
            <Shield size={20} aria-hidden="true" />
            <p>{t('auth.payoutGuarantee')}</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
