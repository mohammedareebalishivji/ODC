import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { logoTop, Banner, Button, toast } from '../ui';

export default function VerifyOtp() {
  const { finalizeSignup } = useAuth();
  const nav = useNavigate();
  const phone = sessionStorage.getItem('odc.pendingPhone') || '';
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const boxes = useRef([]);

  useEffect(() => {
    if (!phone) nav('/signup');
  }, [phone]);

  useEffect(() => {
    if (!resendIn) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const setDigit = (i, val) => {
    const v = val.replace(/\D/g, '');
    if (v.length > 1) {
      const next = v.slice(0, 6).split('');
      setDigits((cur) => next.length === 6 ? [...next] : cur);
      boxes.current[Math.min(5, next.length)]?.focus();
      return;
    }
    setDigits((cur) => {
      const next = [...cur];
      next[i] = v;
      return next;
    });
    if (v && i < 5) boxes.current[i + 1]?.focus();
  };

  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
  };

  const code = digits.join('');
  const submit = async () => {
    setErr(null);
    if (code.length !== 6) {
      setErr('Enter the 6-digit code we sent.');
      return;
    }
    setBusy(true);
    try {
      await finalizeSignup(phone, code);
      sessionStorage.removeItem('odc.pendingPhone');
      toast('Account verified. Welcome to O.D.C!', 'green');
      nav('/app');
    } catch (ex) {
      setErr(ex.message);
      setDigits(['', '', '', '', '', '']);
      boxes.current[0]?.focus();
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setResendIn(30);
    try {
      await api('/api/auth/signup-resend', { method: 'POST', body: JSON.stringify({ phone }) });
      toast('New code sent.');
    } catch {
      try {
        await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ phone }) });
        toast('A new code is on its way.');
      } catch (ex) {
        toast(ex.message, 'red');
      }
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        {logoTop()}
        <h1 className="auth-title">Enter the code</h1>
        <p className="auth-sub">We sent a 6-digit code by SMS to {phone || 'your number'}. It expires in 10 minutes.</p>
        {err ? <Banner tone="danger">{err}</Banner> : null}
        <div className="otp-row mt12">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (boxes.current[i] = el)}
              className="otp-box"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              maxLength={6}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>
        <div className="text-center mt16">
          <Button full onClick={submit} disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify my number'}
          </Button>
        </div>
        <p className="text-center small mt16 muted">
          {resendIn > 0 ? (
            <>Resend code in 0:{String(resendIn).padStart(2, '0')}</>
          ) : (
            <button className="small" style={{ color: 'var(--accent-dark)', fontWeight: 700 }} onClick={resend}>Did not get it? Resend code</button>
          )}
        </p>
      </div>
    </div>
  );
}