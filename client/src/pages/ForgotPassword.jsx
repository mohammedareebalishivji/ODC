import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Button, Input } from '../components/ui';
import { toast } from '../ui';
import { ChefIcon } from '../icons';
import { AlertCircle } from 'lucide-react';

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

export default function ForgotPassword() {
  const nav = useNavigate();
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ phone }) });
      sessionStorage.setItem('odc.resetPhone', phone);
      setSent(true);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
        <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgba(46,53,51,0.07)]">
          <LogoTop />
          <h1 className="text-2xl font-black text-center tracking-tight">Code sent</h1>
          <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
            If an account exists for {phone}, we have sent a 6-digit code to it. Enter the code and your new password next.
          </p>
          <Button className="w-full" onClick={() => nav('/reset')}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgba(46,53,51,0.07)]">
        <LogoTop />
        <h1 className="text-2xl font-black text-center tracking-tight">Forgot password</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
          Enter the phone number on your account. We will send a code to reset your password.
        </p>
        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{err}</span>
          </div>
        )}
        <form onSubmit={submit} className="mt-4">
          <Field label="Mobile number" required>
            <Input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="+91 99999 99999" />
          </Field>
          <Button className="w-full" type="submit" disabled={busy || !phone}>
            {busy ? 'Sending code…' : 'Send code'}
          </Button>
        </form>
      </div>
    </div>
  );
}
