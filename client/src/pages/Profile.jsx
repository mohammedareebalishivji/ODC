import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../state';
import { api } from '../api';
import {
  Card, Button, Banner, Field, TextInput, Select, TextArea, TagPicker, Avatar,
  RoleBadge, Pill, Icon, toast, Seg,
} from '../ui';
import { SpecialtyList } from '../icons';

export default function Profile() {
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
      toast('Profile updated.');
    } catch (ex) {
      toast(ex.message, 'red');
    } finally {
      setBusy(false);
    }
  };

  const uploadPhoto = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 300_000) { toast('Photo too big — keep it under 300 KB.', 'red'); return; }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const d = await api('/api/me', { method: 'PUT', body: JSON.stringify({ photoData: reader.result }) });
        updateUser(d.user);
        toast('Photo updated.');
      } catch (ex) { toast(ex.message, 'red'); }
    };
    reader.readAsDataURL(file);
  };

  const changePassword = async () => {
    if (pw.next !== pw.again) { toast('New passwords do not match.', 'red'); return; }
    try {
      await api('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
      toast('Password changed. Log in again with it.', 'green');
      setPwOpen(false);
      setPw({ current: '', next: '', again: '' });
      await logout();
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const deleteAccount = async () => {
    try {
      await api('/api/me/delete-account', { method: 'POST', body: JSON.stringify({ password: delPw }) });
      await logout();
      toast('Account deleted.');
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const revokeSession = async (sid) => {
    try {
      await api(`/api/me/sessions/${sid}`, { method: 'DELETE' });
      readSessions();
      toast('Session signed out.');
    } catch (ex) { toast(ex.message, 'red'); }
  };

  const isWorker = user.role !== 'manager';

  return (
    <>
      <div className="hero">
        <p className="hero-eyebrow">Profile</p>
        <h1>{user.name}</h1>
        <p className="hero-sub flex" style={{ gap: 8 }}>
          <RoleBadge role={user.role} />
          {(user.verifiedBadge ? <><Pill tone="green"><Icon name="Shield" size={13} /> Verified</Pill></> : <Pill tone="amber"><Icon name="Clock" size={13} /> Verification under review</Pill>)}
        </p>
      </div>

      <Card className="mt16">
        <div className="profile-head">
          <button onClick={() => fileRef.current?.click()} style={{ position: 'relative' }}>
            <Avatar photo={user.photo} name={user.name} size={72} role={user.role} />
            <span className="badge-camera"><Icon name="Camera" size={16} /></span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={uploadPhoto} />
          <div>
            <div className="profile-name">{user.name}</div>
            <div className="profile-role">{user.phone || ''}</div>
            {user.email ? <div className="profile-role">{user.email}</div> : null}
          </div>
        </div>
        {!user.verifiedBadge && isWorker ? (
          <Banner tone="info" className="mt12">
            <Icon name="Shield" size={16} />
            Your ID documents are under review. Managers see you as unverified until they are approved.
          </Banner>
        ) : null}
      </Card>

      <Card className="mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Your details</p>
        <Field label="Full name"><TextInput value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>

        {user.role === 'manager' ? (
          <>
            <Field label="Business name"><TextInput value={form.businessName} onChange={(e) => set('businessName', e.target.value)} /></Field>
            <Field label="Business type">
              <Select value={form.businessType} onChange={(e) => set('businessType', e.target.value)}>
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar / Pub</option>
                <option value="hotel">Hotel</option>
                <option value="cafe">Café</option>
                <option value="other">Other venue</option>
              </Select>
            </Field>
            <Field label="Business address"><TextInput value={form.businessAddress} onChange={(e) => set('businessAddress', e.target.value)} /></Field>
            <Field label="License (optional)"><TextInput value={form.licenseFile} onChange={(e) => set('licenseFile', e.target.value)} placeholder="File name or link" /></Field>
          </>
        ) : null}

        {user.role === 'chef' ? (
          <>
            <Field label="Specialties">
              <TagPicker options={SpecialtyList} value={form.specialties} onChange={(v) => set('specialties', v)} max={8} />
            </Field>
            <Field label="Years of experience">
              <StepperLite value={form.yearsExperience} onChange={(v) => set('yearsExperience', v)} />
            </Field>
            <Field label="Food safety certificate (optional)"><TextInput value={form.certFile} onChange={(e) => set('certFile', e.target.value)} placeholder="File name or link" /></Field>
          </>
        ) : null}

        {user.role === 'waiter' ? (
          <>
            <Field label="Experience">
              <Select value={form.experienceLevel} onChange={(e) => set('experienceLevel', e.target.value)}>
                {['Just starting', '1–3 years', '4–7 years', '8+ years'].map((x) => <option key={x} value={x}>{x}</option>)}
              </Select>
            </Field>
            <Field label="Languages"><TagPicker options={['English','Hindi','Tamil','Telugu','Kannada','Malayalam','Gujarati','Bengali','Punjabi','Marathi'].map((l) => ({ name: l }))} value={form.languages} onChange={(v) => set('languages', v)} max={6} /></Field>
            <Field label="ID proof (optional)"><TextInput value={form.idFile} onChange={(e) => set('idFile', e.target.value)} placeholder="File name or link" /></Field>
          </>
        ) : null}

        <Button full icon={<Icon name="Check" size={18} />} onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </Card>

      <Card className="mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Devices & sessions</p>
        <Button variant="ghost" size="md" onClick={readSessions} className="mb12"><Icon name="Phone" size={16} /> See active logins</Button>
        {sessions && (
          <div>
            {sessions.length === 0 ? <p className="small muted">No other active sessions.</p> : null}
            {sessions.map((s) => (
              <div key={s.id} className="row" style={{ padding: '10px 0' }}>
                <div className="row-main">
                  <div className="row-title">{s.device || 'web'}</div>
                  <div className="row-sub">Signed in {timeAgoLocal(s.created_at)}</div>
                </div>
                <button className="ghost-btn" onClick={() => revokeSession(s.id)}>Sign out</button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Security</p>
        {!pwOpen ? (
          <Button variant="ghost" size="md" onClick={() => setPwOpen(true)}><Icon name="Lock" size={16} /> Change password</Button>
        ) : (
          <div>
            <Field label="Current password"><TextInput type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><TextInput type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Repeat new password"><TextInput type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
            <div className="flex flex-end">
              <Button size="md" onClick={changePassword}>Change password</Button>
              <Button size="md" variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Account</p>
        <div className="flex" style={{ justifyContent: 'space-between' }}>
          <Button variant="ghost" size="md" onClick={logout}><Icon name="Arrow" size={16} /> Log out</Button>
          {!delOpen ? (
            <Button variant="danger" size="md" onClick={() => setDelOpen(true)}><Icon name="Ban" size={16} /> Delete account</Button>
          ) : (
            <div style={{ flex: 1 }}>
              <Field label="Re-enter password to confirm"><TextInput type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} /></Field>
              <div className="flex flex-end">
                <Button size="md" variant="danger" onClick={deleteAccount}>Delete my account</Button>
                <Button size="md" variant="ghost" onClick={() => { setDelOpen(false); setDelPw(''); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}

function StepperLite({ value, onChange }) {
  return (
    <div className="stepper-row" style={{ marginTop: 4 }}>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.max(0, value - 1))}>−</button>
      <div className="stepper-val"><span className="stepper-big">{value}</span><span className="stepper-unit">years</span></div>
      <button type="button" className="stepper-btn" onClick={() => onChange(Math.min(45, value + 1))}>+</button>
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