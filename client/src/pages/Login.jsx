import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { Field, TextInput, Button, Banner, logoTop } from '../ui';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await login(identifier.trim(), password, 'web');
      nav('/app');
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
        <p className="auth-sub">Use your phone number or email.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <form onSubmit={submit} className="mt16">
          <Field label="Phone number or email" required>
            <TextInput value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" placeholder="+91 99999 99999" />
          </Field>
          <Field label="Password" required>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Your password" />
          </Field>
          <Button full type="submit" disabled={busy || !identifier || !password}>
            {busy ? 'Logging in…' : 'Log in'}
          </Button>
        </form>
        <div className="flex mt16" style={{ justifyContent: 'space-between' }}>
          <Link to="/forgot" className="small">Forgot password?</Link>
          <Link to="/" className="small">← Back</Link>
        </div>
      </div>
    </div>
  );
}