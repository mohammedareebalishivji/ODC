import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { Field, TextInput, Button, Banner, logoTop } from '../ui';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';

export default function Login() {
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
    <div className="auth-wrap">
      <div className="auth-panel">
        {logoTop()}
        <h1 className="auth-title">Log in</h1>
        <p className="auth-sub">
          {step === 'code'
            ? 'Now enter your sign-in code — your PIN or authenticator code.'
            : 'Use your phone number or email.'}
        </p>
        {err ? <Banner tone="danger">{err}</Banner> : null}

        {step === 'credentials' ? (
          <div className="mt12 mb16" style={{ background: 'var(--paper)', borderRadius: 14, padding: '12px 14px', border: '1px solid var(--line)' }}>
            <p className="small" style={{ fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8 }}>⚡ Quick Test Login (1-Click)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ flexDirection: 'column', gap: 2, padding: '8px 4px', height: 'auto', background: 'var(--card)' }}
                onClick={() => quickLogin('testchef@odc.in', 'Test@1234')}
                disabled={busy}
              >
                <ChefIcon size={20} style={{ color: 'var(--amber)' }} />
                <span style={{ fontSize: 12 }}>Chef</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ flexDirection: 'column', gap: 2, padding: '8px 4px', height: 'auto', background: 'var(--card)' }}
                onClick={() => quickLogin('testwaiter@odc.in', 'Test@1234')}
                disabled={busy}
              >
                <WaiterIcon size={20} style={{ color: 'var(--blue)' }} />
                <span style={{ fontSize: 12 }}>Waiter</span>
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                style={{ flexDirection: 'column', gap: 2, padding: '8px 4px', height: 'auto', background: 'var(--card)' }}
                onClick={() => quickLogin('testmanager@odc.in', 'Test@1234')}
                disabled={busy}
              >
                <ManagerIcon size={20} style={{ color: 'var(--green)' }} />
                <span style={{ fontSize: 12 }}>Manager</span>
              </button>
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className="mt8">
          <Field label="Phone number or email" required>
            <TextInput value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="+91 99990 00001 or testmanager@odc.in" disabled={step === 'code'} />
          </Field>
          <Field label="Password" required>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" disabled={step === 'code'} />
          </Field>
          {step === 'code' ? (
            <Field label="Sign-in code (PIN or authenticator)" required>
              <TextInput value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" placeholder="e.g. 4821" autoFocus />
            </Field>
          ) : null}
          <Button full type="submit" disabled={busy || !identifier || !password || (step === 'code' && !code)}>
            {busy ? 'Checking…' : step === 'code' ? 'Finish signing in' : 'Log in'}
          </Button>
        </form>
        {step === 'code' ? (
          <div className="mt16">
            <button className="ghost-btn" onClick={() => setStep('credentials')}>← Use a different sign-in code</button>
          </div>
        ) : null}
        <div className="flex mt16" style={{ justifyContent: 'space-between' }}>
          <Link to="/forgot" className="small">Forgot password?</Link>
          <Link to="/" className="small">← Back</Link>
        </div>
      </div>
    </div>
  );
}