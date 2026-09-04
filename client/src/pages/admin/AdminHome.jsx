import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../icons';
import { Button, Input, Textarea, Card } from '../../components/ui';
import { toast } from '../../ui';
import { Check, ArrowLeft, Shield, Home, User, Calendar, Coins, Zap, Eye, AlertCircle } from 'lucide-react';

const API = '/tail/z7k9x2/admin';

function Pill({ tone = 'neutral', children }) {
  const toneMap = { green: 'bg-green-soft text-green', amber: 'bg-amber-soft text-amber', red: 'bg-red-soft text-red', neutral: 'bg-paper-2 text-ink-soft', accent: 'bg-secondary text-accent-dark' };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap ${toneMap[tone] || toneMap.neutral}`}>{children}</span>;
}

function Field({ label, hint, children, required }) {
  return (
    <label className="block mb-4">
      <span className="block font-bold text-sm mb-1.5 text-ink-soft">{label}{required && <span className="text-primary">*</span>}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground leading-relaxed">{hint}</span>}
    </label>
  );
}

function Loading() {
  return <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5"><div className="skeleton h-[60px]" /></div>;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

export default function AdminHome() {
  const nav = useNavigate();
  const token = localStorage.getItem('odc.admin');
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [shifts, setShifts] = useState(null);
  const [fees, setFees] = useState(null);
  const [logs, setLogs] = useState(null);
  const [roleFilter, setRoleFilter] = useState('');
  const [err, setErr] = useState(null);
  const [feeRate, setFeeRate] = useState(10);
  const [announce, setAnnounce] = useState({ target: 'all', message: '' });

  useEffect(() => { if (!token) nav('/tail/z7k9x2/admin'); }, [token]);

  const hdr = { headers: { Authorization: `Bearer ${token}` } };
  const jhdr = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

  const load = useCallback(async (what) => {
    if (!token) return;
    try {
      if (what === 'overview' || what === 'all') {
        const r = await fetch(`${API}/stats`, hdr);
        if (r.ok) { const d = await r.json(); setStats(d.stats); setFeeRate(Math.round(d.feeRate * 100)); }
      }
      if (what === 'users' || what === 'all') {
        const r = await fetch(`${API}/users`, hdr);
        if (r.ok) { const d = await r.json(); setUsers(d.users); }
      }
      if (what === 'shifts' || what === 'all') {
        const r = await fetch(`${API}/shifts`, hdr);
        if (r.ok) { const d = await r.json(); setShifts(d.shifts); }
      }
      if (what === 'revenue' || what === 'all') {
        const r = await fetch(`${API}/fees`, hdr);
        if (r.ok) { const d = await r.json(); setFees(d); setFeeRate(Math.round(d.feeRate * 100)); }
      }
      if (what === 'logs') {
        const r = await fetch(`${API}/audit-logs`, hdr);
        if (r.ok) { const d = await r.json(); setLogs(d.logs); }
      }
      setErr(null);
    } catch { setErr('Could not load data.'); }
  }, [token]);

  useEffect(() => { load('all'); }, [load]);
  const tabGo = (t) => { setTab(t); load(t === 'revenue' ? 'revenue' : t === 'logs' ? 'logs' : t); };

  if (!token) return null;

  const userAction = async (id, action) => {
    const labels = { verify: 'Verified', suspend: 'Suspended', unsuspend: 'Active again', ban: 'Banned', unban: 'Unbanned' };
    try {
      await fetch(`${API}/users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action }) });
      toast(`${labels[action] || action}.`, 'green');
      load('users');
    } catch { toast('Action failed.', 'red'); }
  };

  const saveFee = async () => {
    try {
      await fetch(`${API}/fees`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ rate: feeRate }) });
      toast(`Service fee set to ${feeRate}%.`, 'green');
      load('revenue');
    } catch (ex) { toast(ex.message || 'Could not save.', 'red'); }
  };

  const sendAnnouncement = async () => {
    if (!announce.message.trim()) { toast('Write a message first.', 'red'); return; }
    try {
      const r = await fetch(`${API}/announcements`, jhdr(announce));
      const d = await r.json();
      toast(r.ok ? `Sent to ${d.sentTo} user(s).` : 'Could not send.', r.ok ? 'green' : 'red');
      setAnnounce({ target: 'all', message: '' });
    } catch { toast('Could not send.', 'red'); }
  };

  const logout = () => { localStorage.removeItem('odc.admin'); nav('/tail/z7k9x2/admin'); };

  const navItems = [
    ['overview', 'Home', Home], ['users', 'Accounts', User], ['shifts', 'Shifts', Calendar],
    ['revenue', 'Earnings & Fee', Coins], ['announce', 'Announcements', Zap], ['logs', 'Audit log', Eye], ['profile', 'My account', Shield],
  ];

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <aside className="w-[260px] shrink-0 bg-ink text-white flex flex-col border-r border-border overflow-y-auto">
        <div className="flex items-center gap-2 px-4 py-3.5 font-extrabold text-[14px]">
          <span className="inline-flex items-center justify-center min-w-[38px] h-[22px] px-1.5 text-[11.5px] font-black bg-accent text-ink rounded-[6px]">ODC</span>
          <span>Admin</span>
        </div>
        <p className="text-white/40 font-bold text-[11.5px] tracking-widest uppercase px-4 mt-4 mb-1.5">Platform</p>
        {navItems.map(([k, label, IconComp]) => (
          <button key={k} className={`flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-[14.5px] font-bold transition-colors ${tab === k ? 'text-white bg-white/10 border-l-[3px] border-accent' : 'text-white/60 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent'}`} onClick={() => tabGo(k)}>
            <IconComp size={18} /> {label}
          </button>
        ))}
        <p className="text-white/40 font-bold text-[11.5px] tracking-widest uppercase px-4 mt-4 mb-1.5">Session</p>
        <button className="flex items-center gap-2.5 w-full text-left px-4 py-2.5 text-[14.5px] font-bold text-white/60 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent" onClick={logout}><ArrowLeft size={18} /> Sign out</button>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto min-h-[100dvh]">
        {err && (
          <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-red-soft text-red mb-4">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /><span className="flex-1">{err}</span>
          </div>
        )}
        {tab === 'overview' && <Overview stats={stats} />}
        {tab === 'users' && <Users users={users} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onAction={userAction} />}
        {tab === 'shifts' && <Shifts shifts={shifts} />}
        {tab === 'revenue' && <Revenue fees={fees} feeRate={feeRate} setFeeRate={setFeeRate} onSave={saveFee} />}
        {tab === 'announce' && (
          <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
            <h2 className="text-[17px] font-black mb-4">Announcements</h2>
            <Field label="Whom do you want to reach?">
              <select className="flex h-[50px] w-full rounded-[13px] border-[1.5px] border-border bg-card px-4 py-3 text-ink outline-none text-[15px] font-bold" value={announce.target} onChange={(e) => setAnnounce({ ...announce, target: e.target.value })}>
                <option value="all">Everyone</option><option value="manager">Managers only</option><option value="chef">Chefs only</option><option value="waiter">Waiters only</option>
              </select>
            </Field>
            <Field label="Message">
              <Textarea rows={4} value={announce.message} onChange={(e) => setAnnounce({ ...announce, message: e.target.value })} placeholder="A short note to everyone on the app…" />
            </Field>
            <Button onClick={sendAnnouncement}><Zap size={18} /> Broadcast now</Button>
          </div>
        )}
        {tab === 'logs' && <Logs logs={logs} />}
        {tab === 'profile' && <ProfileTab API={API} token={token} onLogout={logout} />}
      </main>
    </div>
  );
}

function Overview({ stats }) {
  if (!stats) return <Loading />;
  const sections = [
    [`${stats.users}`, 'Total accounts'], [`${stats.roles.manager}`, 'Managers'], [`${stats.roles.chef}`, 'Chefs'],
    [`${stats.roles.waiter}`, 'Waiters'], [`${stats.shifts.open}`, 'Open shifts'], [`${stats.shifts.matched}`, 'Confirmed'],
    [`${stats.shifts.expired}`, 'Expired'], [`${stats.fillRate}%`, 'Fill rate'],
  ];
  return (
    <>
      <h2 className="text-[17px] font-black mb-4">Live overview</h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {sections.map(([num, label]) => (
          <div key={label} className="bg-card border-[1.5px] border-border rounded-[18px] p-5 text-center">
            <div className="text-[28px] font-black text-ink-soft leading-tight">{num}</div>
            <div className="text-xs text-muted-foreground font-bold mt-1.5">{label}</div>
          </div>
        ))}
      </div>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5 mt-4">
        <p className="text-xs text-muted-foreground font-bold">Average time to match a shift</p>
        <div className="text-[28px] font-black text-ink-soft leading-tight mt-1">{stats.avgTimeToMatchSec == null ? '—' : `${Math.round(stats.avgTimeToMatchSec / 60)} min`}</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
          <h3 className="font-extrabold mb-3">Most requested specialties</h3>
          <BarList rows={stats.mostRequestedSpecialties.map((x) => [x.specialty, x.n])} />
        </div>
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
          <h3 className="font-extrabold mb-3">Busiest locations</h3>
          <BarList rows={stats.busiestLocations.map((x) => [x.loc, x.n])} />
        </div>
      </div>
    </>
  );
}

function BarList({ rows }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className="text-xs text-muted-foreground">No data yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {rows.map(([label, n]) => (
        <div key={label}>
          <div className="flex justify-between"><span className="text-xs font-bold">{label}</span><span className="text-xs text-muted-foreground">{n}</span></div>
          <div className="h-2 bg-paper-2 rounded mt-1"><div className="h-2 bg-accent rounded" style={{ width: `${(n / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Users({ users, roleFilter, setRoleFilter, onAction }) {
  if (!users) return <Loading />;
  const filtered = roleFilter ? users.filter((u) => u.role === roleFilter) : users;
  return (
    <>
      <h2 className="text-[17px] font-black mb-4">Accounts</h2>
      <div className="flex gap-1 mb-4">
        {['', 'manager', 'chef', 'waiter'].map((r) => (
          <button key={r} className={`px-3 py-1.5 rounded-xl text-xs font-bold border border-border transition-colors ${roleFilter === r ? 'bg-secondary border-primary text-accent-dark' : 'bg-card text-ink-soft hover:bg-paper-2'}`} onClick={() => setRoleFilter(r)}>{r || 'All'}</button>
        ))}
      </div>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead className="border-b border-border"><tr className="text-left text-xs font-bold text-muted-foreground uppercase tracking-wider"><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Verified</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-paper-2/50 transition-colors">
                <td className="px-4 py-3 font-bold">{u.name}</td>
                <td className="px-4 py-3">{cap(u.role)}</td>
                <td className="px-4 py-3">{u.phone || u.email}</td>
                <td className="px-4 py-3"><Pill tone={u.banned ? 'red' : u.suspended ? 'amber' : u.active ? 'green' : 'neutral'}>{u.banned ? 'Banned' : u.suspended ? 'Suspended' : u.active ? 'Active' : 'Pending OTP'}</Pill></td>
                <td className="px-4 py-3">{u.verifiedBadge ? 'Yes' : 'No'}</td>
                <td className="px-4 py-3">{u.rating.count ? `${u.rating.avg.toFixed(1)} (${u.rating.count})` : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex gap-1 justify-end">
                    {!u.verifiedBadge && <MiniBtn label="Verify" onClick={() => onAction(u.id, 'verify')} />}
                    {u.suspended ? <MiniBtn label="Restore" onClick={() => onAction(u.id, 'unsuspend')} /> : <MiniBtn label="Suspend" onClick={() => onAction(u.id, 'suspend')} />}
                    {u.banned ? <MiniBtn label="Unban" onClick={() => onAction(u.id, 'unban')} /> : <MiniBtn label="Ban" className="text-red" onClick={() => onAction(u.id, 'ban')} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Shifts({ shifts }) {
  if (!shifts) return <Loading />;
  return (
    <>
      <h2 className="text-[17px] font-black mb-4">All shifts</h2>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead className="border-b border-border"><tr className="text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <th className="px-4 py-3">Role</th><th className="px-4 py-3">Venue</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Pay</th><th className="px-4 py-3">Agreed</th><th className="px-4 py-3">Responses</th><th className="px-4 py-3">Posted</th><th className="px-4 py-3">Expires</th><th className="px-4 py-3">Fee record</th>
          </tr></thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0 hover:bg-paper-2/50 transition-colors">
                <td className="px-4 py-3">{s.specialty || cap(s.role)}</td>
                <td className="px-4 py-3">{s.managerName}<div className="text-xs text-muted-foreground">{s.locationName}</div></td>
                <td className="px-4 py-3"><Pill tone={s.status === 'matched' ? 'green' : s.status === 'open' ? 'amber' : 'neutral'}>{s.status}</Pill></td>
                <td className="px-4 py-3">₹{s.payMin}–{s.payMax}</td>
                <td className="px-4 py-3">{s.agreedPay != null ? `₹${s.agreedPay}` : '—'}</td>
                <td className="px-4 py-3">{s.respCount}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{s.createdAt.slice(0, 16).replace('T', ' ')}</td>
                <td className="px-4 py-3 text-xs">{s.status === 'open' ? `${Math.max(0, Math.round(s.differenceMs / 60000))} min` : '—'}</td>
                <td className="px-4 py-3">{s.feeRecord ? <span className="text-xs">fee ₹{s.feeRecord.fee_amount} · payout ₹{s.feeRecord.worker_payout}<br /><i>{Math.round(s.feeRecord.fee_rate * 100)}%</i></span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Revenue({ fees, feeRate, setFeeRate, onSave }) {
  if (!fees) return <Loading />;
  return (
    <>
      <h2 className="text-[17px] font-black mb-4">Earnings & platform fee</h2>
      <div className="grid grid-cols-1 gap-3">
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5 text-center">
          <div className="text-[28px] font-black text-accent-dark leading-tight">{Math.round(fees.feeRate * 100)}%</div>
          <div className="text-xs text-muted-foreground font-bold mt-1.5">Current service fee</div>
        </div>
      </div>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5 mt-4">
        <p className="text-[15px] font-extrabold mb-1">Set the platform fee</p>
        <p className="text-xs text-muted-foreground font-bold mb-3">This percentage is taken from the worker side of each completed shift.</p>
        <div className="flex items-center gap-3">
          <input type="range" min={0} max={30} step={0.5} value={feeRate} onChange={(e) => setFeeRate(Number(e.target.value))} className="flex-1" />
          <span className="font-black text-[22px] min-w-[70px] text-right">{feeRate}%</span>
        </div>
        <div className="h-2" />
        <Button size="md" onClick={onSave}><Check size={16} /> Save fee</Button>
      </div>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5 mt-4">
        <p className="text-[15px] font-extrabold mb-3">Fee change history</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[14.5px]">
            <thead className="border-b border-border"><tr className="text-left text-xs font-bold text-muted-foreground uppercase tracking-wider"><th className="px-4 py-3">Rate</th><th className="px-4 py-3">Note</th><th className="px-4 py-3">By</th><th className="px-4 py-3">When</th></tr></thead>
            <tbody>
              {(fees.history || []).map((h) => (
                <tr key={h.id} className="border-b border-border last:border-0"><td className="px-4 py-3">{Math.round(h.rate * 100)}%</td><td className="px-4 py-3">{h.label || '—'}</td><td className="px-4 py-3">{h.updated_by || 'system'}</td><td className="px-4 py-3 text-xs text-muted-foreground">{h.created_at.slice(0, 16).replace('T', ' ')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function ProfileTab({ API, token, onLogout }) {
  const [admin, setAdmin] = useState(null);
  const [staticCode, setStaticCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState({ current: '', next: '', again: '' });
  const [rot, setRot] = useState({ pw: '', secret: null });
  const [codePw, setCodePw] = useState('');
  const [newCode, setNewCode] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const hdr = { headers: { Authorization: `Bearer ${token}` } };
  const jhdr = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });

  const load = useCallback(async () => {
    try { const r = await fetch(`${API}/self`, hdr); if (r.ok) { const d = await r.json(); setAdmin(d.admin); setStaticCode(d.staticCode); setName(d.admin.name || ''); setEmail(d.admin.email || ''); } } catch {}
  }, [API, token]);
  useEffect(() => { load(); }, [load]);
  if (!admin) return <Loading />;

  const saveName = async () => {
    if (!name.trim()) { toast('Enter your name.', 'red'); return; }
    setBusy(true);
    try { const r = await fetch(`${API}/self`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ name }) }); const d = await r.json(); if (d.admin) setAdmin(d.admin); toast('Name updated.', 'green'); } catch { toast('Could not save.', 'red'); }
    finally { setBusy(false); }
  };

  const saveEmail = async () => {
    if (!pw.current) { toast('Enter your current password.', 'red'); return; }
    setBusy(true);
    try { const r = await fetch(`${API}/self`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email, currentPassword: pw.current }) }); const d = await r.json(); if (d.error) throw new Error(d.error); setAdmin(d.admin); setPw((p) => ({ ...p, current: '' })); toast('Email updated.', 'green'); } catch (ex) { toast(ex.message || 'Could not save.', 'red'); }
    finally { setBusy(false); }
  };

  const changePassword = async () => {
    if (pw.next !== pw.again) { toast('New passwords do not match.', 'red'); return; }
    setBusy(true);
    try { const r = await fetch(`${API}/self/password`, jhdr({ currentPassword: pw.current, newPassword: pw.next })); const d = await r.json(); if (d.error) throw new Error(d.error); toast('Password changed. Use it on next login.', 'green'); setPw({ current: '', next: '', again: '' }); } catch (ex) { toast(ex.message || 'Could not change.', 'red'); }
    finally { setBusy(false); }
  };

  const rotateTotp = async () => {
    if (!rot.pw) { toast('Enter your current password.', 'red'); return; }
    setBusy(true);
    try { const r = await fetch(`${API}/self/totp/rotate`, jhdr({ currentPassword: rot.pw })); const d = await r.json(); if (d.error) throw new Error(d.error); setRot({ pw: '', secret: d }); toast('New authenticator key generated.', 'green'); } catch (ex) { toast(ex.message || 'Could not rotate.', 'red'); }
    finally { setBusy(false); }
  };

  const changeCode = async (code) => {
    if (!codePw) { toast('Enter your current password.', 'red'); return; }
    if (code && !/^\d{6}$/.test(code)) { toast('Code must be exactly 6 digits.', 'red'); return; }
    setBusy(true);
    try { const r = await fetch(`${API}/self/code`, jhdr({ currentPassword: codePw, code })); const d = await r.json(); if (d.error) throw new Error(d.error); setStaticCode(d.staticCode); setNewCode(d.staticCode); setCodePw(''); setCustomCode(''); toast(d.message || 'Sign-in code changed.', 'green'); } catch (ex) { toast(ex.message || 'Could not change.', 'red'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <h2 className="text-[17px] font-black mb-4">My account</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
          <h3 className="font-extrabold mb-3">Profile</h3>
          <div className="flex gap-2 items-center mb-3.5">
            <div className="w-14 h-14 rounded-full bg-accent/20 text-accent-dark flex items-center justify-center font-black text-xl shrink-0">{admin.name.slice(0, 1).toUpperCase()}</div>
            <div>
              <div className="font-black text-[17px]">{admin.name}</div>
              <div className="text-xs text-muted-foreground">{admin.email || 'No email'}{admin.phone ? ` · ${admin.phone}` : ''}</div>
              <div className="mt-1"><Pill tone="accent">Super admin</Pill></div>
            </div>
          </div>
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Button size="md" icon={<Check size={16} />} onClick={saveName} disabled={busy}>Save name</Button>
          <hr className="border-border my-4" />
          <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Current password"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Button size="md" icon={<Check size={16} />} onClick={saveEmail} disabled={busy}>Save email</Button>
          <p className="text-xs text-muted-foreground mt-4">Account created {new Date(admin.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
            <h3 className="font-extrabold mb-3">Password</h3>
            <Field label="Current password"><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
            <Field label="New password"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
            <Field label="Repeat new password"><Input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" /></Field>
            <Button size="md" variant="destructive" onClick={changePassword} disabled={busy}>Change password</Button>
          </div>
          <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
            <h3 className="font-extrabold mb-3">Sign-in code</h3>
            <div className="flex gap-2 items-center mb-3">
              <Pill tone="green">Permanent</Pill>
              <span className="text-xs text-muted-foreground">Your admin code never changes.</span>
            </div>
            <p className="text-xs text-muted-foreground">6-digit code</p>
            <div className="bg-paper-2 text-center py-3 rounded-xl font-black text-[22px] tracking-[8px] mt-1.5">{staticCode}</div>
            {newCode && <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-amber-soft text-[#8f5a08] mt-3">Your new code is <b>{newCode}</b> — it takes effect next time you sign in.</div>}
            <Field label="Set your own 6-digit code (optional)"><Input value={customCode} inputMode="numeric" maxLength={6} onChange={(e) => setCustomCode(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 123456" className="tracking-[4px]" /></Field>
            <Field label="Current password (to change the code)"><Input type="password" value={codePw} onChange={(e) => setCodePw(e.target.value)} autoComplete="current-password" /></Field>
            <div className="flex gap-2">
              <Button size="md" onClick={() => changeCode(customCode)} disabled={busy || !codePw || customCode.length !== 6}>Set this code</Button>
              <Button size="md" variant="ghost" onClick={() => changeCode('')} disabled={busy || !codePw}>Generate random</Button>
            </div>
            <p className="text-xs text-muted-foreground mt-3">Optional: an authenticator app can be set on top of it.</p>
            {rot.secret ? (
              <>
                <div className="flex items-start gap-2.5 rounded-[14px] p-3 px-3.5 text-[14.5px] bg-amber-soft text-[#8f5a08] mt-3">Scan or enter the new key below — the old one no longer works.</div>
                <p className="text-xs text-muted-foreground mt-3">Secret</p>
                <div className="bg-paper-2 text-center py-3 rounded-xl font-mono text-sm mt-1.5 break-all">{rot.secret.secret}</div>
                <p className="text-xs text-muted-foreground mt-3">otpauth URI</p>
                <div className="bg-paper-2 text-center py-3 rounded-xl font-mono text-sm mt-1.5 break-all">{rot.secret.otpauth}</div>
                <p className="text-xs text-muted-foreground mt-3">Current code: <b>{rot.secret.code}</b></p>
              </>
            ) : (
              <Field label="Current password"><Input type="password" value={rot.pw} onChange={(e) => setRot({ ...rot, pw: e.target.value })} autoComplete="current-password" /></Field>
            )}
            <Button size="md" icon={<Shield size={16} />} className="mt-3" onClick={rotateTotp} disabled={busy}>{rot.secret ? 'Generate another key' : 'Rotate authenticator key'}</Button>
          </div>
          <div className="bg-card border-[1.5px] border-border rounded-[18px] p-5">
            <h3 className="font-extrabold mb-3">Session</h3>
            <p className="text-xs text-muted-foreground mb-3">Sign out of this dashboard.</p>
            <Button size="md" onClick={onLogout}><ArrowLeft size={16} /> Sign out</Button>
          </div>
        </div>
      </div>
    </>
  );
}

function Logs({ logs }) {
  if (!logs) return <Loading />;
  return (
    <>
      <h2 className="text-[17px] font-black mb-4">Audit log</h2>
      <div className="bg-card border-[1.5px] border-border rounded-[18px] overflow-x-auto">
        <table className="w-full text-[14.5px]">
          <thead className="border-b border-border"><tr className="text-left text-xs font-bold text-muted-foreground uppercase tracking-wider"><th className="px-4 py-3">When</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0 hover:bg-paper-2/50 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground">{l.created_at.slice(0, 19).replace('T', ' ')}</td>
                <td className="px-4 py-3 font-bold">{l.action}</td>
                <td className="px-4 py-3 text-xs">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MiniBtn({ label, onClick, className = '' }) {
  return <button className={`px-2.5 py-1 rounded-xl border border-border text-xs font-bold text-ink-soft bg-card hover:bg-paper-2 transition-colors ${className}`} onClick={onClick}>{label}</button>;
}
