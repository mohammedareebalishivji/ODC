import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input } from '../../components/ui';
import { Lock } from 'lucide-react';
import { AlertCircle } from 'lucide-react';

function Field({ label, hint, children, required }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">{label}{required && <span className="text-primary">*</span>}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</span>}
    </label>
  );
}

export default function AdminLogin() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/tail/z7k9x2/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, code }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'That email or password did not match.'); return; }
      localStorage.setItem('odc.admin', data.accessToken);
      nav('/tail/z7k9x2/admin/home');
    } catch { setErr('Could not reach the sign-in service.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-[100dvh] bg-ink p-4 sm:p-6">
      <div className="w-full max-w-[420px] border-[1.5px] border-border bg-card rounded-[18px] shadow-sm">
        <div className="px-8 pt-8 pb-0">
          <div className="flex items-center gap-2 text-foreground font-extrabold text-[14px] mb-2"><Lock size={18} /> Platform sign-in</div>
          <h1 className="text-[28px] font-black tracking-tight mb-2">Internal access</h1>
          <p className="text-muted-foreground text-[15px]">Authorized staff only. A one-time code is required for every sign-in.</p>
        </div>
        <div className="p-8 pt-4">
          {err && (
            <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{err}</span>
            </div>
          )}
          <form onSubmit={submit}>
            <Field label="Email" required>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@odc-internal.com" />
            </Field>
            <Field label="Password" required>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" />
            </Field>
            <Field label="6-digit code" required hint="Your permanent admin code (it never changes).">
              <Input value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" className="tracking-[4px]" />
            </Field>
            <Button type="submit" className="w-full" disabled={busy || !email || !password || code.length !== 6}>
              {busy ? 'Signing in…' : 'Sign in securely'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
