import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import { Card, Button, Input, Select } from '../components/ui';
import { ChefIcon, WaiterIcon, ManagerIcon, SpecialtyList } from '../icons';
import { toast } from '../ui';
import { Shield, Lock, Phone, Camera, Ban, Check, LogOut } from 'lucide-react';
import { useI18n } from '../i18n';

function RoleBadge({ role, size = 18 }) {
  const IconComp = role === 'chef' ? ChefIcon : role === 'waiter' ? WaiterIcon : ManagerIcon;
  const label = role === 'chef' ? 'Chef' : role === 'waiter' ? 'Waiter' : 'Manager';
  return (
    <span className="inline-flex items-center gap-1.5 font-extrabold text-base text-ink-soft">
      <IconComp size={size} />
      <span>{label}</span>
    </span>
  );
}

function Pill({ tone = 'neutral', children, className = '' }) {
  const toneMap = {
    green: 'bg-green-soft text-green',
    amber: 'bg-amber-soft text-amber',
    red: 'bg-red-soft text-red',
    blue: 'bg-blue-soft text-blue',
    neutral: 'bg-paper-2 text-ink-soft',
    accent: 'bg-secondary text-accent-dark',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${toneMap[tone] || toneMap.neutral} ${className}`}>
      {children}
    </span>
  );
}

function Field({ label, hint, error, children, required }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">
        {label}
        {required && <span className="text-primary">*</span>}
      </span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</span>}
      {error && <span className="block mt-1.5 text-[13px] text-red font-semibold">{error}</span>}
    </label>
  );
}

function StepperLite({ value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-card border-[1.5px] border-border rounded-2xl p-2 mt-1">
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <div className="text-center flex-1 min-w-0">
        <span className="text-[28px] font-extrabold tracking-tight">{value}</span>
        <span className="text-[15px] text-muted-foreground font-semibold ml-1">years</span>
      </div>
      <button type="button" className="w-12 h-12 rounded-xl bg-paper-2 text-2xl font-bold text-ink-soft shrink-0 flex items-center justify-center hover:bg-line" onClick={() => onChange(Math.min(45, value + 1))}>+</button>
    </div>
  );
}

function timeAgoLocal(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const EXPERIENCE_LEVELS = [
  { value: 'Just starting', labelKey: 'exp.justStarting' },
  { value: '1–3 years', labelKey: 'exp.1to3' },
  { value: '4–7 years', labelKey: 'exp.4to7' },
  { value: '8+ years', labelKey: 'exp.8plus' },
];

export default function Profile() {
  const { t } = useI18n();
  const { user, updateUser, logout } = useAuth();
  const nav = useNavigate();
  const fileRef = useRef(null);
  const [form, setForm] = useState(() => ({
    name: user.name,
    businessName: user.businessName || '',
    businessType: user.businessType || 'restaurant',
    businessAddress: user.businessAddress || '',
    licenseFile: user.licenseFile || '',
    specialties: user.specialties || [],
    yearsExperience: user.yearsExperience || 0,
    certFile: user.certFile || '',
    experienceLevel: user.experienceLevel || '',
    languages: user.languages || [],
    idFile: user.idFile || '',
  }));
  const [sessions, setSessions] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [pin, setPin] = useState({ currentPassword: '', value: '', again: '' });
  const [pinBusy, setPinBusy] = useState(false);
  const [otpSetup, setOtpSetup] = useState(null);
  const [otpEnable, setOtpEnable] = useState({ currentPassword: '', code: '' });
  const [otpDisable, setOtpDisable] = useState({ currentPassword: '', code: '' });
  const [otpBusy, setOtpBusy] = useState(false);
  const [contact, setContact] = useState({ email: '', pw: '', newPhone: '', code: '', devCode: '', phoneStep: 'idle' });
  const [contactBusy, setContactBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const readSessions = async () => {
    try {
      const d = await api('/api/me/sessions');
      setSessions(d.sessions);
    } catch {}
  };

  const save = async () => {
    setBusy(true);
    try {
      const d = await api('/api/me', { method: 'PUT', body: JSON.stringify(form) });
      updateUser(d.user);
      toast(t('toast.profileUpdated'));
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 300_000) { toast(t('toast.photoTooBig'), 'red'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = await api('/api/me', { method: 'PUT', body: JSON.stringify({ photoData: reader.result }) });
        updateUser(d.user);
        toast(t('toast.photoUpdated'));
      } catch (ex) { toast(ex.message, 'red'); }
    };
    reader.readAsDataURL(file);
  };

  const changePassword = async () => {
    if (pw.next !== pw.again) { toast(t('toast.passwordMismatch'), 'red'); return; }
    try {
      await api('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
      toast(t('toast.passwordChanged'), 'green');
      setPwOpen(false);
      setPw({ current: '', next: '', again: '' });
      await logout();
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const deleteAccount = async () => {
    try {
      await api('/api/me/delete-account', { method: 'POST', body: JSON.stringify({ password: delPw }) });
      await logout();
      toast(t('toast.accountDeleted'));
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const revokeSession = async (sid) => {
    try {
      await api(`/api/me/sessions/${sid}`, { method: 'DELETE' });
      readSessions();
      toast(t('toast.sessionSignedOut'));
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const savePin = async () => {
    if (pin.value !== pin.again) { toast('PINs do not match.', 'red'); return; }
    setPinBusy(true);
    try {
      const d = await api('/api/me/pin', { method: 'POST', body: JSON.stringify({ currentPassword: pin.currentPassword, pin: pin.value }) });
      updateUser(d.user);
      setPin({ currentPassword: '', value: '', again: '' });
      toast(t('toast.pinSet'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setPinBusy(false); }
  };

  const clearPin = async () => {
    setPinBusy(true);
    try {
      const d = await api('/api/me/pin/clear', { method: 'POST', body: JSON.stringify({ currentPassword: pin.currentPassword }) });
      updateUser(d.user);
      setPin({ currentPassword: '', value: '', again: '' });
      toast(t('toast.pinRemoved'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setPinBusy(false); }
  };

  const startTotp = async () => {
    setOtpBusy(true);
    try {
      const d = await api('/api/me/totp/setup', { method: 'POST', body: JSON.stringify({ currentPassword: otpEnable.currentPassword }) });
      setOtpSetup(d);
      setOtpEnable((o) => ({ ...o, currentPassword: '' }));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setOtpBusy(false); }
  };

  const confirmTotp = async () => {
    setOtpBusy(true);
    try {
      const d = await api('/api/me/totp/confirm', { method: 'POST', body: JSON.stringify({ code: otpEnable.code }) });
      updateUser(d.user);
      setOtpSetup(null);
      setOtpEnable({ currentPassword: '', code: '' });
      toast(t('toast.authOn'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setOtpBusy(false); }
  };

  const disableTotp = async () => {
    setOtpBusy(true);
    try {
      const d = await api('/api/me/totp/disable', { method: 'POST', body: JSON.stringify(otpDisable) });
      updateUser(d.user);
      setOtpDisable({ currentPassword: '', code: '' });
      toast(t('toast.authOff'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setOtpBusy(false); }
  };

  const saveEmail = async () => {
    if (!contact.pw) { toast(t('toast.enterCurrentPassword'), 'red'); return; }
    setContactBusy(true);
    try {
      const d = await api('/api/me/email', { method: 'POST', body: JSON.stringify({ currentPassword: contact.pw, email: contact.email }) });
      updateUser(d.user);
      setContact({ ...contact, pw: '', email: '' });
      toast(t('toast.emailUpdated'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setContactBusy(false); }
  };

  const requestPhone = async () => {
    if (!contact.pw) { toast(t('toast.enterCurrentPassword'), 'red'); return; }
    setContactBusy(true);
    try {
      const d = await api('/api/me/phone/request', { method: 'POST', body: JSON.stringify({ currentPassword: contact.pw, newPhone: contact.newPhone }) });
      setContact({ ...contact, devCode: d.devCode || '', phoneStep: 'code' });
      toast(d.message || t('toast.codeSentNew'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setContactBusy(false); }
  };

  const confirmPhone = async () => {
    setContactBusy(true);
    try {
      const d = await api('/api/me/phone/confirm', { method: 'POST', body: JSON.stringify({ newPhone: contact.newPhone, code: contact.code }) });
      updateUser(d.user);
      setContact({ email: '', pw: '', newPhone: '', code: '', devCode: '', phoneStep: 'idle' });
      toast(t('toast.phoneUpdated'));
    } catch (ex) { toast(ex.message, 'red'); }
    finally { setContactBusy(false); }
  };

  const isWorker = user.role !== 'manager';

  return (
    <>
      <div className="py-1.5 px-0.5">
        <p className="text-accent-dark font-extrabold text-[13px] uppercase tracking-widest">{t('prof.title')}</p>
        <h1 className="text-[30px] font-black tracking-tight mt-1.5">{user.name}</h1>
        <p className="text-muted-foreground mt-2 text-[15px] flex items-center gap-2">
          <RoleBadge role={user.role} />
          {user.verifiedBadge ? (
            <Pill tone="green"><Shield size={13} /> Verified</Pill>
          ) : (
            <Pill tone="amber"><Shield size={13} /> Verification under review</Pill>
          )}
        </p>
      </div>

      {/* Photo + info card */}
      <Card className="mt-4">
        <div className="flex items-center gap-4">
          <button onClick={() => fileRef.current?.click()} className="relative">
            <div className="w-[72px] h-[72px] rounded-full bg-paper-2 flex items-center justify-center overflow-hidden">
              {user.photo ? (
                <img src={user.photo} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-extrabold text-ink-soft">
                  {(user.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
                </span>
              )}
            </div>
            <span className="absolute right-[-2px] bottom-[-2px] w-[26px] h-[26px] rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
              <Camera size={16} />
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label={t('prof.uploadPhoto')} onChange={uploadPhoto} />
          <div>
            <div className="text-[21px] font-black">{user.name}</div>
            <div className="text-muted-foreground">{user.phone || ''}</div>
            {user.email && <div className="text-muted-foreground">{user.email}</div>}
          </div>
        </div>
        {!user.verifiedBadge && isWorker && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue mt-3">
            <Shield size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t('prof.docsReview')}</span>
          </div>
        )}
      </Card>

      {/* Details card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.yourDetails')}</p>
        <Field label={t('lbl.fullName')}><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>

        {user.role === 'manager' && (
          <>
            <Field label={t('sf.businessName')}><Input value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
            <Field label={t('prof.businessType')}>
              <Select value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                <option value="restaurant">{t('sf.restaurant')}</option>
                <option value="bar">{t('sf.bar')}</option>
                <option value="hotel">{t('sf.hotel')}</option>
                <option value="cafe">Café</option>
                <option value="other">{t('sf.otherVenue')}</option>
              </Select>
            </Field>
            <Field label={t('sf.businessAddress')}><Input value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} /></Field>
            <Field label={t('prof.license')}><Input value={form.licenseFile} onChange={(e) => set('licenseFile', e.target.value)} placeholder={t('sf.filePlaceholder')} /></Field>
          </>
        )}

        {user.role === 'chef' && (
          <>
            <Field label={t('prof.specialties')}>
              <TagPicker options={SpecialtyList} value={form.specialties} onChange={(v) => set('specialties', v)} max={8} />
            </Field>
            <Field label={t('prof.yearsExp')}>
              <StepperLite value={form.yearsExperience} onChange={(v) => set('yearsExperience', v)} />
            </Field>
            <Field label={t('sf.foodCert')}><Input value={form.certFile} onChange={(e) => set('certFile', e.target.value)} placeholder={t('sf.filePlaceholder')} /></Field>
          </>
        )}

        {user.role === 'waiter' && (
          <>
            <Field label={t('sf.experience')}>
              <Select value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
                {EXPERIENCE_LEVELS.map((x) => <option key={x.value} value={x.value}>{t(x.labelKey)}</option>)}
              </Select>
            </Field>
            <Field label={t('lbl.languages')}>
              <TagPicker options={['English','Hindi','Tamil','Telugu','Kannada','Malayalam','Gujarati','Bengali','Punjabi','Marathi'].map((l) => ({ name: l }))} value={form.languages} onChange={(v) => set('languages', v)} max={6} />
            </Field>
            <Field label={t('lbl.idProof')}><Input value={form.idFile} onChange={(e) => set('idFile', e.target.value)} placeholder={t('sf.filePlaceholder')} /></Field>
          </>
        )}

        <Button className="w-full" onClick={save} disabled={busy} icon={<Check size={18} />}>
          {busy ? 'Saving…' : t('btn.saveProfile')}
        </Button>
      </Card>

      {/* Contact card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.contact')}</p>
        <div className="flex items-center gap-3 py-3.5 px-0.5 border-b border-line">
          <div className="flex-1 min-w-0">
            <div className="text-base font-black">{user.phone || '—'}</div>
            <div className="text-muted-foreground text-sm">{t('prof.phoneLogin')}</div>
          </div>
        </div>
        <Field label={t('prof.changePhone')}>
          <Input value={contact.newPhone} onChange={(e) => setContact({ ...contact, newPhone: e.target.value, phoneStep: 'idle' })} placeholder={t('prof.newNumber')} />
        </Field>
        {contact.phoneStep === 'code' && (
          <>
            {contact.devCode && <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue mb-3">{'Dev code for the new number: '}<b>{contact.devCode}</b></div>}
            <Field label={t('prof.codeSentNew')}><Input value={contact.code} onChange={(e) => setContact({ ...contact, code: e.target.value })} placeholder={t('prof.sixDigit')} /></Field>
          </>
        )}
        <Field label={t('prof.currentPassword')}><Input type="password" value={contact.pw} onChange={(e) => setContact({ ...contact, pw: e.target.value })} autoComplete="current-password" placeholder={t('prof.confirmWithPassword')} /></Field>
        <div className="flex gap-2">
          {contact.phoneStep === 'code' ? (
            <Button onClick={confirmPhone} disabled={contactBusy || !contact.code} icon={<Check size={18} />}>{t('prof.confirmPhone')}</Button>
          ) : (
            <Button onClick={requestPhone} disabled={contactBusy || !contact.newPhone} icon={<Phone size={16} />}>{t('prof.verifyNewPhone')}</Button>
          )}
        </div>

        <div className="h-px bg-border my-4" />
        <div className="flex items-center justify-between">
          <div>
            <div className="text-base font-black">{user.email || 'Not set'}</div>
            <div className="text-muted-foreground text-sm">{t('prof.email')}</div>
          </div>
          <div className="min-[280px]">
            <Field label={t('lbl.newEmail')}><Input value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="you@example.com" /></Field>
          </div>
        </div>
        <Button className="mt-3" onClick={saveEmail} disabled={contactBusy || !contact.email} icon={<Phone size={16} />}>{t('prof.saveEmail')}</Button>
      </Card>

      {/* Sessions card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.devices')}</p>
        <Button variant="ghost" onClick={readSessions} className="mb-3" icon={<Phone size={16} />}>{t('prof.seeLogins')}</Button>
        {sessions && (
          <div>
            {sessions.length === 0 && <p className="text-xs text-muted-foreground">{t('prof.noSessions')}</p>}
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 px-0.5 border-b border-line">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15.5px]">{s.device || 'web'}</div>
                  <div className="text-muted-foreground text-[13px] mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">Signed in {timeAgoLocal(s.created_at)}</div>
                </div>
                <button className="py-1.5 px-3 rounded-[10px] border-[1.5px] border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2" onClick={() => revokeSession(s.id)}>{t('nav.logout')}</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Password card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.security')}</p>
        {!pwOpen ? (
          <Button variant="ghost" onClick={() => setPwOpen(true)} icon={<Lock size={16} />}>{t('prof.changePassword')}</Button>
        ) : (
          <div>
            <Field label={t('prof.currentPassword')}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label={t('prof.newPassword')}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label={t('prof.repeatNew')}><Input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
            <div className="flex justify-end gap-2">
              <Button onClick={changePassword}>{t('prof.changePassword')}</Button>
              <Button variant="ghost" onClick={() => setPwOpen(false)}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
      </Card>

      {/* PIN card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.pin')}</p>
        <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-blue-soft text-blue mb-3">
          <Lock size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{t('prof.pinHint')}</span>
        </div>
        {user.pinEnabled && (
          <Pill tone="green" className="mb-3"><Shield size={13} /> PIN is on</Pill>
        )}
        <Field label={t('prof.currentPassword')}>
          <Input type="password" value={pin.currentPassword} onChange={(e) => setPin({ ...pin, currentPassword: e.target.value })} autoComplete="current-password" />
        </Field>
        <Field label={user.pinEnabled ? 'New PIN' : t('btn.choosePin')}>
          <Input value={pin.value} onChange={(e) => setPin({ ...pin, value: e.target.value })} placeholder={t('prof.pinPlaceholder')} maxLength={8} />
        </Field>
        <Field label={t('prof.repeatPin')}>
          <Input value={pin.again} onChange={(e) => setPin({ ...pin, again: e.target.value })} placeholder={t('prof.samePin')} maxLength={8} />
        </Field>
        <div className="flex gap-2">
          <Button icon={<Check size={18} />} onClick={savePin} disabled={pinBusy}>
            {pinBusy ? 'Saving…' : user.pinEnabled ? t('btn.changePin') : t('btn.savePin')}
          </Button>
          {user.pinEnabled && (
            <Button variant="destructive" onClick={clearPin} disabled={pinBusy} icon={<Ban size={16} />}>{t('prof.turnOffPin')}</Button>
          )}
        </div>
      </Card>

      {/* TOTP card */}
      <Card className="mt-4">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.totp')}</p>
        {user.totpEnabled ? (
          <>
            <Pill tone="green" className="mb-3"><Shield size={13} /> Authenticator is on</Pill>
            <Field label={t('prof.currentPassword')}><Input type="password" value={otpDisable.currentPassword} onChange={(e) => setOtpDisable({ ...otpDisable, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
            <Field label={t('prof.currentAuthCode')}><Input value={otpDisable.code} onChange={(e) => setOtpDisable({ ...otpDisable, code: e.target.value })} placeholder={t('prof.sixDigit')} /></Field>
            <Button variant="destructive" icon={<Ban size={16} />} onClick={disableTotp} disabled={otpBusy}>{t('prof.turnOffAuth')}</Button>
          </>
        ) : otpSetup ? (
          <>
            <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-amber-soft text-amber mb-3">
              Add this secret to Google Authenticator (or any TOTP app), then confirm with the code it shows.
            </div>
            <p className="text-xs text-muted-foreground">{t('prof.secretKey')}</p>
              <div className="font-mono text-[13px] leading-relaxed py-2.5 px-3 my-1 mb-3.5 bg-paper-2 border-[1.5px] border-dashed border-line rounded-[10px] text-ink select-all">{otpSetup.secret}</div>
            <p className="text-xs text-muted-foreground">{t('prof.manualEntry')}</p>
            <div className="font-mono text-[13px] leading-relaxed py-2.5 px-3 my-1 mb-3.5 bg-paper-2 border-[1.5px] border-dashed border-line rounded-[10px] text-ink select-all break-all">{otpSetup.otpauth}</div>
            <Field label={t('prof.authAppCode')}><Input value={otpEnable.code} onChange={(e) => setOtpEnable({ ...otpEnable, code: e.target.value })} placeholder={t('prof.sixDigit')} /></Field>
            <div className="flex gap-2">
              <Button icon={<Shield size={16} />} onClick={confirmTotp} disabled={otpBusy || !otpEnable.code}>{t('prof.turnOnAuth')}</Button>
              <Button variant="ghost" onClick={() => setOtpSetup(null)}>{t('common.cancel')}</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-3">{t('prof.totpHint')}</p>
            <Field label={t('prof.currentPassword')}><Input type="password" value={otpEnable.currentPassword} onChange={(e) => setOtpEnable({ ...otpEnable, currentPassword: e.target.value })} autoComplete="current-password" /></Field>
            <Button icon={<Shield size={16} />} onClick={startTotp} disabled={otpBusy}>{otpBusy ? t('btn.starting') : t('btn.setupAuth')}</Button>
          </>
        )}
      </Card>

      {/* Account card */}
      <Card className="mt-4 mb-8">
        <p className="text-base font-extrabold mb-3 flex items-center gap-2 text-ink-soft">{t('prof.account')}</p>
        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={logout} icon={<LogOut size={16} />}>{t('prof.logout')}</Button>
          {!delOpen ? (
            <Button variant="destructive" onClick={() => setDelOpen(true)} icon={<Ban size={16} />}>{t('prof.deleteAccount')}</Button>
          ) : (
            <div className="flex-1">
              <Field label={t('prof.reenterPassword')}><Input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></Field>
              <div className="flex justify-end gap-2">
                <Button variant="destructive" onClick={deleteAccount}>{t('prof.deleteMine')}</Button>
                <Button variant="ghost" onClick={() => { setDelOpen(false); setDelPw(''); }}>{t('common.cancel')}</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function TagPicker({ options, value, onChange, multi = true, max = 5 }) {
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
    <div className="flex flex-wrap gap-2.5">
      {options.map((o) => {
        const on = value.includes(o.name);
        return (
          <button type="button" key={o.name} className={`inline-flex items-center gap-2 py-2.5 px-3.5 border-[1.5px] rounded-[14px] bg-card font-bold text-[14.5px] transition-all duration-100 ${on ? 'border-primary bg-secondary text-accent-dark' : 'border-border text-ink-soft'}`} onClick={() => toggle(o.name)}>
            <span>{o.name}</span>
            {on && <Check size={14} className="text-primary" />}
          </button>
        );
      })}
    </div>
  );
}
