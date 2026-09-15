import { useEffect, useState } from 'react';
import { Icon, ChefIcon, WaiterIcon, ManagerIcon, EmptyShifts, EmptyBell, SpecialtyIcon } from './icons';

export { Icon } from './icons';

export function fmtMoney(n) {
  return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

export function clockFromMin(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')}${period}`;
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d)) return dateStr;
  const today = new Date();
  const same = (a, b) => a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (same(d, today)) return 'Today';
  const tomorrow = new Date(today.getTime() + 86400000);
  if (same(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeAgo(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d}d ago`;
}

export function timeLeft(ms) {
  if (ms == null) return null;
  ms = Math.max(0, ms);
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0 && m === 0) return 'just now';
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function useNow(interval = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function urgencyTone(shift) {
  if (shift.status !== 'open' && shift.status !== 'matched') return 'neutral';
  const ms = shift.remainingMs;
  if (ms > 2 * 3600000) return 'green';
  if (ms > 0) return 'amber';
  return 'red';
}

export function Button({ variant = 'primary', size = 'lg', full, icon, iconEnd, children, className = '', ...props }) {
  const vcls = variant === 'green' ? 'btn-green' : variant === 'dark' ? 'btn-dark' : variant === 'soft' ? 'btn-soft' : variant === 'ghost' ? 'btn-ghost' : variant === 'danger' ? 'btn-danger' : 'btn-primary';
  return (
    <button className={`btn ${vcls} btn-${size} ${full ? 'btn-full' : ''} ${className}`} {...props}>
      {icon ? <span className="btn-icon">{icon}</span> : null}
      <span>{children}</span>
      {iconEnd ? <span className="btn-icon btn-icon-end">{iconEnd}</span> : null}
    </button>
  );
}

export function Card({ children, className = '', style, onClick }) {
  return (
    <div className={`card ${onClick ? 'card-tap' : ''} ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function Pill({ tone = 'neutral', children }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Banner({ tone = 'info', children, icon, onClose }) {
  return (
    <div className={`banner banner-${tone}`}>
      {icon ? <span className="banner-icon">{icon}</span> : null}
      <span className="banner-body">{children}</span>
      {onClose ? (
        <button className="banner-x" onClick={onClose} aria-label="Dismiss">
          <Icon name="X" size={16} />
        </button>
      ) : null}
    </div>
  );
}

export function Seg({ options, value, onChange, className = '' }) {
  return (
    <div className={`seg ${className}`}>
      {options.map((o) => (
        <button key={o.value} className={`seg-item ${value === o.value ? 'seg-on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  );
}

export function TextInput(props) {
  return <input className="input" {...props} />;
}

export function TextArea(props) {
  return <textarea className="input textarea" rows={props.rows || 3} {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="input select" {...props}>
      {children}
    </select>
  );
}

export function Stepper({ label, value, min = 0, max = 100000, step = 10, unit, onChange, disabled }) {
  const clamp = (v) => Math.min(max, Math.max(min, v));

  const handleInputChange = (e) => {
    const raw = e.target.value.replace(/[^0-9]/g, '');
    if (raw === '') {
      onChange('');
      return;
    }
    const num = Number(raw);
    onChange(num);
  };

  const handleBlur = () => {
    const num = Number(value);
    if (isNaN(num) || num < min) {
      onChange(min);
    } else if (num > max) {
      onChange(max);
    }
  };

  const numVal = Number(value) || 0;

  return (
    <div className="stepper-row">
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled || numVal <= min}
        onClick={() => onChange(clamp(numVal - step))}
        aria-label="Decrease amount"
      >
        −
      </button>
      <div className="stepper-val">
        <div className="stepper-input-wrap">
          <span className="stepper-currency">₹</span>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className="stepper-input"
            value={value === '' ? '' : value}
            onChange={handleInputChange}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={String(min)}
          />
          {unit ? <span className="stepper-unit">{unit}</span> : null}
        </div>
        {label ? <span className="stepper-label">{label}</span> : null}
      </div>
      <button
        type="button"
        className="stepper-btn"
        disabled={disabled || numVal >= max}
        onClick={() => onChange(clamp(numVal + step))}
        aria-label="Increase amount"
      >
        +
      </button>
    </div>
  );
}

export function TimePicker({ label, value, onChange, minTime }) {
  const hh = Math.floor(value / 60);
  const mm = value % 60;
  const str = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  return (
    <div className="tpicker">
      <span className="tpicker-label">{label}</span>
      <div className="tpicker-inner">
        <select className="input select" value={hh} onChange={(e) => onChange(Number(e.target.value) * 60 + mm)}>
          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}</option>)}
        </select>
        <span className="tpicker-colon">:</span>
        <select className="input select" value={mm} onChange={(e) => onChange(hh * 60 + Number(e.target.value))}>
          {[0, 15, 30, 45].map((m) => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
        </select>
      </div>
    </div>
  );
}

export function TagPicker({ options, value, onChange, multi = true, max = 5, checkLabel }) {
  const toggle = (name) => {
    if (multi) {
      const has = value.includes(name);
      if (has) onChange(value.filter((v) => v !== name));
      else if (value.length < max) onChange([...value, name]);
    } else {
      onChange([name]);
    }
  };
  return (
    <div className="tags">
      {options.map((o) => {
        const on = value.includes(o.name);
        return (
          <button type="button" key={o.name} className={`tag ${on ? 'tag-on' : ''}`} onClick={() => toggle(o.name)}>
            <span className="tag-icon">{o.icon ? <SpecialtyIcon name={o.icon} size={22} /> : null}</span>
            <span>{o.name}</span>
            <span className="tag-check">{on ? <Icon name="Check" size={14} /> : checkLabel}</span>
          </button>
        );
      })}
    </div>
  );
}

export function RatingInput({ value, onChange, size = 34 }) {
  return (
    <div className="rating-input">
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)} aria-label={`${s} stars`}>
          <Icon name="Star" size={size} className={s <= value ? 'star-on' : 'star-off'} />
        </button>
      ))}
    </div>
  );
}

export function Avatar({ photo, name, size = 44, role }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const RoleIcon = role === 'chef' ? ChefIcon : role === 'waiter' ? WaiterIcon : role === 'manager' ? ManagerIcon : null;
  return (
    <span className={`avatar avatar-${size}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {photo ? <img src={photo} alt={name || ''} /> : RoleIcon ? <RoleIcon size={size * 0.58} className="avatar-rb" /> : <span>{initials}</span>}
    </span>
  );
}

export function EmptyState({ icon, title, sub, children }) {
  return (
    <div className="empty">
      <div className="empty-art">{icon || <EmptyShifts />}</div>
      <h3 className="empty-title">{title}</h3>
      {sub ? <p className="empty-sub">{sub}</p> : null}
      {children ? <div className="empty-actions">{children}</div> : null}
    </div>
  );
}

export function EmptyBellState({ title, sub, children }) {
  return <EmptyState icon={<EmptyBell />} title={title} sub={sub}>{children}</EmptyState>;
}

export function RoleBadge({ role, size = 18 }) {
  const Icon = role === 'chef' ? ChefIcon : role === 'waiter' ? WaiterIcon : ManagerIcon;
  const label = role === 'chef' ? 'Chef' : role === 'waiter' ? 'Waiter' : 'Manager';
  return (
    <span className="rolebadge">
      <Icon size={size} />
      <span>{label}</span>
    </span>
  );
}

export function logoTop() {
  return (
    <div className="auth-logo">
      <span className="logo">
        <ChefIcon size={36} className="logo-icon" />
        <span>O<span style={{ color: 'var(--accent)' }}>.</span>D<span style={{ color: 'var(--accent)' }}>.</span>C</span>
      </span>
    </div>
  );
}

const toastState = {
  listeners: new Set(),
  msg: (message, tone = 'dark') => toastState.listeners.forEach((l) => l(message, tone)),
};

export function toast(message, tone = 'dark') {
  toastState.msg(message, tone);
}

export function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const on = (message, tone) => {
      const id = Math.random().toString(36).slice(2);
      setItems((cur) => [...cur, { id, message, tone }]);
      setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 3600);
    };
    toastState.listeners.add(on);
    return () => toastState.listeners.delete(on);
  }, []);
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>{t.message}</div>
      ))}
    </div>
  );
}

export function CountdownBanner({ expiresAt, prefix, suffix }) {
  const now = useNow(30000);
  const ms = Math.max(0, new Date(expiresAt).getTime() - now);
  const tone = ms > 2 * 3600000 ? 'green' : ms > 0 ? 'amber' : 'red';
  if (!ms) return null;
  return (
    <div className={`expiry-day expiry-${tone}`}>
      <Icon name="Clock" size={16} />
      <span>
        {prefix || 'Your shift request'} {timeLeft(ms)} {suffix}
      </span>
    </div>
  );
}

export function useGeolocation() {
  const [pos, setPos] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) {
      setErr('Location not available on this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => setErr(e.message || 'Could not get your location.')
    );
  }, []);
  return { pos, err };
}

export function usePushRegister() {
  const { user } = useAuthSafe();
  useEffect(() => {
    if (!user) return;
    let access = null;
    try {
      access = (JSON.parse(localStorage.getItem('odc.tokens') || '{}') || {}).accessToken;
    } catch {}
    if (!access) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').then(() => {}).catch(() => {});
    if (!('PushManager' in window)) return;
    navigator.serviceWorker.ready.then(async (reg) => {
      let key = null;
      try {
        const r = await fetch('/api/me/vapid');
        const data = await r.json();
        key = data.publicKey
          ? new Uint8Array(base64urlToBytes(data.publicKey))
          : null;
      } catch {}
      if (!key || !reg.pushManager) return;
      let sub = null;
      try {
        sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
      } catch {}
      if (sub) {
        await fetch('/api/me/push-subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access}` },
          body: JSON.stringify({ subscription: { endpoint: sub.endpoint, keys: sub.toJSON().keys }, name: 'web' }),
        }).catch(() => {});
      }
    });
  }, [user]);
}

function base64urlToBytes(b64) {
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  return atob(b64.replace(/-/g, '+').replace(/_/g, '/') + pad).split('').map((c) => c.charCodeAt(0));
}

import { useAuthSafe } from './state';