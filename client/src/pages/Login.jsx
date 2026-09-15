import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { Button, Input } from '../components/ui';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';
import { AlertCircle } from 'lucide-react';
import { useI18n } from '../i18n';

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

export default function Login() {
  const { t } = useI18n();
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('credentials');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      nav(user.role === 'admin' ? '/tail/z7k9x2/admin/home' : '/app', { replace: true });
    }
  }, [user, nav]);

  const submit = async (e) => {
    if (e) e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const result = await login(identifier.trim(), password, step === 'code' ? code.trim() : '', 'web');
      if (result.needs2fa) {
        setStep('code');
        setCode('');
      } else {
        nav('/app');
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const quickLogin = async (roleEmail, rolePass) => {
    setErr(null);
    setBusy(true);
    setIdentifier(roleEmail);
    setPassword(rolePass);
    try {
      const result = await login(roleEmail, rolePass, '', 'web');
      if (result.needs2fa) {
        setStep('code');
        setCode('');
      } else {
        nav('/app');
      }
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
        <h1 className="text-2xl font-black text-center tracking-tight">{t('login.title')}</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
          {step === 'code'
            ? t('login.enterCode')
            : t('login.usePhoneEmail')}
        </p>

        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{err}</span>
          </div>
        )}

        {step === 'credentials' && (
          <div className="mt-3 mb-4 bg-paper rounded-[14px] p-3.5 border border-border">
            <p className="text-xs font-bold text-ink-soft mb-2">⚡ Quick Test Login (1-Click)</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { email: 'testchef@odc.in', role: 'Chef', icon: ChefIcon, color: 'text-amber' },
                { email: 'testwaiter@odc.in', role: 'Waiter', icon: WaiterIcon, color: 'text-blue' },
                { email: 'testmanager@odc.in', role: 'Manager', icon: ManagerIcon, color: 'text-green' },
              ].map(({ email, role, icon: Icon, color }) => (
                <button
                  key={role}
                  type="button"
                  className="flex flex-col items-center gap-1 p-2 h-auto bg-card rounded-xl border border-border hover:border-primary transition-colors"
                  onClick={() => quickLogin(email, 'Test@1234')}
                  disabled={busy}
                >
                  <Icon size={20} style={{ color: `var(--color-${color.replace('text-', '')})` }} />
                  <span className="text-xs">{role}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={submit} className="mt-2">
          <div className="block mb-4">
            <label className="block font-bold text-sm mb-1.5 text-ink-soft">
              Phone number or email <span className="text-primary">*</span>
            </label>
            <Input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              placeholder="+91 99990 00001 or testmanager@odc.in"
              disabled={step === 'code'}
            />
          </div>
          <div className="block mb-4">
            <label className="block font-bold text-sm mb-1.5 text-ink-soft">
              Password <span className="text-primary">*</span>
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder={t('login.passwordPlaceholder')}
              disabled={step === 'code'}
            />
          </div>
          {step === 'code' && (
            <div className="block mb-4">
              <label className="block font-bold text-sm mb-1.5 text-ink-soft">
                Sign-in code (PIN or authenticator) <span className="text-primary">*</span>
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="one-time-code"
                placeholder="e.g. 4821"
                autoFocus
              />
            </div>
          )}
          <Button className="w-full" type="submit" disabled={busy || !identifier || !password || (step === 'code' && !code)}>
            {busy ? t('btn.checking') : step === 'code' ? t('btn.finishSignIn') : t('login.title')}
          </Button>
        </form>

        {step === 'code' && (
          <div className="mt-4">
            <button className="py-1.5 px-3 rounded-[10px] border-[1.5px] border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2 transition-colors" onClick={() => setStep('credentials')}>
              ← Use a different sign-in code
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <Link to="/forgot" className="text-xs text-accent-dark font-semibold">{t('auth.forgot')}</Link>
          <Link to="/" className="text-xs text-accent-dark font-semibold">← Back</Link>
        </div>
      </div>
    </div>
  );
}
