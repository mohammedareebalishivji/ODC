import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { logoTop, Banner, Button, Field, TextInput, toast } from '../ui';
import PasswordStrength from '../components/PasswordStrength';

export default function ResetPassword() {
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
    if (password !== confirm) { setErr('The two passwords do not match.'); return; }
    if (code.length !== 6) { setErr('Enter the 6-digit code.'); return; }
    setBusy(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ phone, code, newPassword: password }) });
      sessionStorage.removeItem('odc.resetPhone');
      toast('Password updated. Log in with your new password.', 'green');
      nav('/login');
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
        <h1 className="auth-title">Set a new password</h1>
        <p className="auth-sub">Enter the code we sent and choose a new password.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <form onSubmit={submit} className="mt16">
          <Field label="6-digit code" required>
            <TextInput value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
          </Field>
          <Field label="New password" required>
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" />
            <PasswordStrength password={password} />
          </Field>
          <Field label="Confirm new password" required>
            <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" />
          </Field>
          <Button full type="submit" disabled={busy}>{busy ? 'Updating…' : 'Update password'}</Button>
        </form>
      </div>
    </div>
  );
}