import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Button } from '../components/ui';
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgba(46,53,51,0.07)]">
        <LogoTop />
        <h1 className="text-2xl font-black text-center tracking-tight">Enter the code</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
          We sent a 6-digit code by SMS to {phone || 'your number'}. It expires in 10 minutes.
        </p>
        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{err}</span>
          </div>
        )}
        <div className="flex gap-2.5 justify-center my-3">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (boxes.current[i] = el)}
              className="w-[52px] h-[60px] text-center text-2xl font-extrabold border-[1.5px] border-border rounded-[14px] bg-paper outline-none text-ink focus:border-primary focus:bg-white focus:shadow-[0_0_0_3px_rgba(74,138,111,0.14)]"
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
        <div className="text-center mt-4">
          <Button className="w-full" onClick={submit} disabled={busy || code.length !== 6}>
            {busy ? 'Verifying…' : 'Verify my number'}
          </Button>
        </div>
        <p className="text-center text-xs mt-4 text-muted-foreground">
          {resendIn > 0 ? (
            <>Resend code in 0:{String(resendIn).padStart(2, '0')}</>
          ) : (
            <button className="text-xs font-bold text-accent-dark" onClick={resend}>Did not get it? Resend code</button>
          )}
        </p>
      </div>
    </div>
  );
}
