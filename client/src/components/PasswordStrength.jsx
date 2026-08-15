import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { logoTop, Banner, Button } from '../ui';

export default function PasswordStrength({ password }) {
  if (!password) return null;
  const score = scorePwd(password);
  const label = score <= 1 ? 'Weak' : score <= 3 ? 'Good' : 'Strong';
  const cls = score <= 1 ? 'sl-weak' : score <= 3 ? 'sl-good' : 'sl-strong';
  return (
    <div>
      <div className="strength-row">
        {[1, 2, 3, 4].map((i) => <span key={i} className={`strength-bar ${i <= Math.max(1, Math.ceil((score / 4) * 4)) ? 'on' : ''}`} />)}
      </div>
      <div className={`strength-label ${cls}`}>
        {label} {score < 4 ? '— add more length, numbers, or symbols to get a strong password.' : '— looks great.'}
      </div>
    </div>
  );
}

function scorePwd(pw) {
  let n = 0;
  if (pw.length >= 8) n++;
  if (pw.length >= 12) n++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n++;
  return Math.min(4, n);
}