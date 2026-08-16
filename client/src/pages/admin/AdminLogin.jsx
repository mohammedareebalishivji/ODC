import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, TextInput, Button, Banner, Card, Icon } from '../../ui';

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
      if (!res.ok) {
        setErr(data.error || 'That email or password did not match.');
        return;
      }
      localStorage.setItem('odc.admin', data.accessToken);
      nav('/tail/z7k9x2/admin/home');
    } catch {
      setErr('Could not reach the sign-in service.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap" style={{ background: 'var(--ink)' }}>
      <div className="auth-panel admin-login" style={{ background: '#fff8ec29', borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'none', backdropFilter: 'blur(6px)' }}>
        <div className="auth-logo">
          <span className="logo" style={{ color: '#fff' }}><Icon name="Lock" size={22} /> Platform sign-in</span>
        </div>
        <h1 className="auth-title" style={{ color: '#fff' }}>Internal access</h1>
        <p className="auth-sub" style={{ color: 'rgba(255,255,255,0.7)' }}>Authorized staff only. A one-time code is required for every sign-in.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <form onSubmit={submit} className="mt16">
          <Field label="Email" required>
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@odc-internal.com" style={{ background: '#fff' }} />
          </Field>
          <Field label="Password" required>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" style={{ background: '#fff' }} />
          </Field>
          <Field label="6-digit code" required hint="Your permanent admin code (it never changes).">
            <TextInput value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ background: '#fff', letterSpacing: '4px' }} />
          </Field>
          <Button full type="submit" disabled={busy || !email || !password || code.length !== 6}>
            {busy ? 'Signing in…' : 'Sign in securely'}
          </Button>
        </form>
      </div>
    </div>
  );
}