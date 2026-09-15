import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../state';
import { useI18n } from '../i18n';
import { LanguageToggle, ThemeToggle } from '../components/LanguageToggle';
import Logo from '../components/Logo';
import VoiceGuide from '../components/VoiceGuide';

/**
 * O.D.C Universal Login & Quick OTP Verification.
 *
 * Mobile-first, passwordless, bilingual — the flow the designs lead with. The
 * role cards are informational: the server already knows the account's role,
 * so picking one only tailors the copy, it never grants anything.
 */
const ROLES = [
  { key: 'worker', titleKey: 'auth.role.worker', descKey: 'auth.role.workerDesc' },
  { key: 'manager', titleKey: 'auth.role.manager', descKey: 'auth.role.managerDesc' },
  { key: 'admin', titleKey: 'auth.role.admin', descKey: 'auth.role.adminDesc' },
];

const OTP_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function OtpLogin() {
  const { t } = useI18n();
  const nav = useNavigate();
  const { loginWithOtp } = useAuth();

  const [role, setRole] = useState('worker');
  const [phone, setPhone] = useState('');
  const [stage, setStage] = useState('phone'); // 'phone' | 'otp'
  const [digits, setDigits] = useState(Array(OTP_LENGTH).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const boxes = useRef([]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const phoneValid = phoneDigits.length === 10;

  async function requestOtp(ev) {
    ev?.preventDefault();
    if (!phoneValid) {
      setError(t('auth.mobileLabel'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: `+91${phoneDigits}` }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || t('common.error'));
      setStage('otp');
      setCooldown(RESEND_SECONDS);
      // Development builds echo the code so it can be filled in without SMS.
      if (d.devCode) setDevCode(d.devCode);
      setTimeout(() => boxes.current[0]?.focus(), 50);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(code) {
    setBusy(true);
    setError('');
    try {
      await loginWithOtp(`+91${phoneDigits}`, code);
      nav('/app', { replace: true });
    } catch (err) {
      setError(err.message);
      setDigits(Array(OTP_LENGTH).fill(''));
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i, value) {
    const v = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < OTP_LENGTH - 1) boxes.current[i + 1]?.focus();
    const joined = next.join('');
    if (joined.length === OTP_LENGTH && !next.includes('')) verify(joined);
  }

  function onKeyDown(i, ev) {
    if (ev.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
    if (ev.key === 'ArrowLeft' && i > 0) boxes.current[i - 1]?.focus();
    if (ev.key === 'ArrowRight' && i < OTP_LENGTH - 1) boxes.current[i + 1]?.focus();
  }

  // Pasting the whole code into any box should fill the row.
  function onPaste(ev) {
    const text = (ev.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    ev.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((c, idx) => { next[idx] = c; });
    setDigits(next);
    if (text.length === OTP_LENGTH) verify(text);
    else boxes.current[text.length]?.focus();
  }

  return (
    <div className="otp-page">
      <header className="otp-top">
        <Logo size={34} />
        <span className="otp-top-right">
          <LanguageToggle />
          <ThemeToggle />
        </span>
      </header>

      <main className="otp-card">
        <p className="otp-eyebrow">{t('brand.network')}</p>
        <h1 className="otp-title">{t('auth.title')}</h1>
        <p className="otp-sub">{t('auth.subtitle')}</p>
        <div className="otp-voice">
          <VoiceGuide text={`${t('auth.title')}. ${t('auth.otpBlurb')}`} />
        </div>

        {/* --- Role picker --- */}
        <fieldset className="otp-roles">
          <legend className="otp-legend">{t('auth.selectRole')}</legend>
          {ROLES.map((r) => (
            <label key={r.key} className={`otp-role ${role === r.key ? 'on' : ''}`}>
              <input
                type="radio"
                name="role"
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

        {stage === 'phone' ? (
          <form onSubmit={requestOtp} className="otp-form">
            <label className="field">
              <span className="field-label">{t('auth.mobileLabel')}</span>
              <span className="otp-phone">
                <span className="otp-cc">+91</span>
                <input
                  className="input otp-phone-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="numeric"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  aria-describedby="otp-blurb"
                />
              </span>
            </label>
            <p className="otp-blurb" id="otp-blurb">{t('auth.otpBlurb')}</p>

            {error && <p className="field-error">{error}</p>}

            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={busy || !phoneValid}>
              {t('auth.sendOtp')}
            </button>
          </form>
        ) : (
          <div className="otp-form">
            <p className="field-label">{t('auth.enterOtp')}</p>
            <div className="otp-boxes" onPaste={onPaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { boxes.current[i] = el; }}
                  className="otp-box"
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`Digit ${i + 1}`}
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>

            {devCode && (
              <p className="code-box">Development code: {devCode}</p>
            )}
            {error && <p className="field-error">{error}</p>}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-full"
              disabled={busy || digits.includes('')}
              onClick={() => verify(digits.join(''))}
            >
              {t('auth.verify')}
            </button>

            <button
              type="button"
              className="otp-resend"
              disabled={cooldown > 0 || busy}
              onClick={requestOtp}
            >
              {cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
            </button>
          </div>
        )}

        <p className="otp-secure">{t('auth.securityNote')}</p>
        <p className="otp-guarantee">{t('auth.payoutGuarantee')}</p>

        <div className="otp-alt">
          <Link to="/login/password">{t('otp.usePassword')}</Link>
          <Link to="/signup">{t('auth.registerFree')} →</Link>
        </div>
      </main>
    </div>
  );
}
