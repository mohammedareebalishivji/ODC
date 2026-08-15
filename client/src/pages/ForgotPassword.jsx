import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { logoTop, Banner, Button, Field, TextInput, toast } from '../ui';

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
      <div className="auth-wrap">
        <div className="auth-panel">
          {logoTop()}
          <h1 className="auth-title">Code sent</h1>
          <p className="auth-sub">If an account exists for {phone}, we have sent a 6-digit code to it. Enter the code and your new password next.</p>
          <Button full onClick={() => nav('/reset')}>Continue</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        {logoTop()}
        <h1 className="auth-title">Forgot password</h1>
        <p className="auth-sub">Enter the phone number on your account. We will send a code to reset your password.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <form onSubmit={submit} className="mt16">
          <Field label="Mobile number" required>
            <TextInput value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} placeholder="+91 99999 99999" />
          </Field>
          <Button full type="submit" disabled={busy || !phone}>{busy ? 'Sending code…' : 'Send code'}</Button>
        </form>
      </div>
    </div>
  );
}