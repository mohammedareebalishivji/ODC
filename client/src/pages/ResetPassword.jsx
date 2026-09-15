import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button, Input } from '../components/ui';
import { toast } from '../ui';
import { ChefIcon } from '../icons';
import { AlertCircle } from 'lucide-react';
import PasswordStrength from '../components/PasswordStrength';
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

function Field({ label, required, children }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">
        {label}
        {required && <span className="text-primary">*</span>}
      </span>
      {children}
    </label>
  );
}

export default function ResetPassword() {
  const { t } = useI18n();
  const nav = useNavigate();
  const phone = sessionStorage.getItem('odc.resetPhone') || '';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!phone) nav('/forgot'); }, [phone]);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) { setErr(t('toast.passwordsDiffer')); return; }
    if (code.length !== 6) { setErr(t('toast.enterSixDigit')); return; }
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ phone, code, newPassword: password }) });
      sessionStorage.removeItem('odc.resetPhone');
      toast(t('toast.passwordUpdated'), 'green');
      nav('/login');
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
        <h1 className="text-2xl font-black text-center tracking-tight">{t('reset.title')}</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
          Enter the code we sent and choose a new password.
        </p>
        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{err}</span>
          </div>
        )}
        <form onSubmit={submit} className="mt-4">
          <Field label="6-digit code" required>
            <Input value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
          </Field>
          <Field label={t('reset.newPassword')} required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('reset.newPassword')} />
            <PasswordStrength password={password} />
          </Field>
          <Field label={t('reset.confirm')} required>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={t('reset.typeAgain')} />
          </Field>
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? t('btn.updating') : t('btn.updatePassword')}
          </Button>
        </form>
      </div>
    </div>
  );
}
