import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../icons';
import { Button, Pill, Field, TextArea, toast } from '../../ui';

const API = '/tail/z7k9x2/admin';

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

  useEffect(() => {
    if (!token) nav('/tail/z7k9x2/admin');
  }, [token]);

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
    } catch (ex) {
      setErr('Could not load data.');
    }
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
    } catch (ex) { toast('Action failed.', 'red'); }
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
    ['overview', 'Home', 'Home'],
    ['users', 'Accounts', 'User'],
    ['shifts', 'Shifts', 'Cal'],
    ['revenue', 'Earnings & Fee', 'Rupee'],
    ['announce', 'Announcements', 'Bolt'],
    ['logs', 'Audit log', 'Eye'],
  ];

  return (
    <div className="admin-shell">
      <aside className="admin-sidenav">
        <div className="logo" style={{ color: '#fff', padding: '6px 14px 14px' }}>
          <span className="logo-badge">ODC</span>
          <span>Admin</span>
        </div>
        <p className="admin-nav-hd">Platform</p>
        {navItems.map(([k, label, icon]) => (
          <button key={k} className={`admin-nav-item ${tab === k ? 'on' : ''}`} onClick={() => tabGo(k)}>
            <Icon name={icon} size={18} /> {label}
          </button>
        ))}
        <p className="admin-nav-hd">Session</p>
        <button className="admin-nav-item" onClick={logout}><Icon name="Arrow" size={18} /> Sign out</button>
      </aside>

      <main className="admin-main">
        {err ? <div className="admin-card"><Pill tone="red">{err}</Pill></div> : null}

        {tab === 'overview' && <Overview stats={stats} />}
        {tab === 'users' && <Users users={users} roleFilter={roleFilter} setRoleFilter={setRoleFilter} onAction={userAction} />}
        {tab === 'shifts' && <Shifts shifts={shifts} />}
        {tab === 'revenue' && (
          <Revenue fees={fees} feeRate={feeRate} setFeeRate={setFeeRate} onSave={saveFee} />
        )}
        {tab === 'announce' && (
          <div className="admin-card">
            <h2 className="admin-title">Announcements</h2>
            <Field label="Whom do you want to reach?">
              <select className="input select" value={announce.target} onChange={(e) => setAnnounce({ ...announce, target: e.target.value })}>
                <option value="all">Everyone</option>
                <option value="manager">Managers only</option>
                <option value="chef">Chefs only</option>
                <option value="waiter">Waiters only</option>
              </select>
            </Field>
            <Field label="Message">
              <TextArea rows={4} value={announce.message} onChange={(e) => setAnnounce({ ...announce, message: e.target.value })} placeholder="A short note to everyone on the app…" />
            </Field>
            <Button onClick={sendAnnouncement}><Icon name="Bolt" size={18} /> Broadcast now</Button>
          </div>
        )}
        {tab === 'logs' && <Logs logs={logs} />}
      </main>
    </div>
  );
}

function Overview({ stats }) {
  if (!stats) return <Loading />;
  const sections = [
    [`${stats.users}`, 'Total accounts'],
    [`${stats.roles.manager}`, 'Managers'],
    [`${stats.roles.chef}`, 'Chefs'],
    [`${stats.roles.waiter}`, 'Waiters'],
    [`${stats.shifts.open}`, 'Open shifts'],
    [`${stats.shifts.matched}`, 'Confirmed'],
    [`${stats.shifts.expired}`, 'Expired'],
    [`${stats.fillRate}%`, 'Fill rate'],
  ];
  return (
    <>
      <h2 className="admin-title">Live overview</h2>
      <div className="stat-grid">
        {sections.map(([num, label]) => (
          <div className="stat-card"><div className="stat-num">{num}</div><div className="stat-lbl">{label}</div></div>
        ))}
      </div>
      <div className="admin-card mt16">
        <p className="small muted">Average time to match a shift</p>
        <div className="admin-stat-num">
          {stats.avgTimeToMatchSec == null ? '—' : `${Math.round(stats.avgTimeToMatchSec / 60)} min`}
        </div>
      </div>
      <div className="grid2 mt16">
        <div className="admin-card">
          <h3 className="mb12">Most requested specialties</h3>
          <BarList rows={stats.mostRequestedSpecialties.map((x) => [x.specialty, x.n])} />
        </div>
        <div className="admin-card">
          <h3 className="mb12">Busiest locations</h3>
          <BarList rows={stats.busiestLocations.map((x) => [x.loc, x.n])} />
        </div>
      </div>
    </>
  );
}

function BarList({ rows }) {
  const max = Math.max(1, ...rows.map(([, n]) => n));
  if (!rows.length) return <p className="small muted">No data yet.</p>;
  return (
    <div className="stack">
      {rows.map(([label, n]) => (
        <div key={label}>
          <div className="flex" style={{ justifyContent: 'space-between' }}>
            <span className="small" style={{ fontWeight: 700 }}>{label}</span>
            <span className="small muted">{n}</span>
          </div>
          <div style={{ height: 8, background: 'var(--paper-2)', borderRadius: 4, marginTop: 4 }}>
            <div style={{ height: 8, width: `${(n / max) * 100}%`, background: 'var(--accent)', borderRadius: 4 }} />
          </div>
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
      <h2 className="admin-title">Accounts</h2>
      <div className="flex mb16">
        {['', 'manager', 'chef', 'waiter'].map((r) => (
          <button key={r} className={`ghost-btn ${roleFilter === r ? 'on-ghost' : ''}`} onClick={() => setRoleFilter(r)}>{r || 'All'}</button>
        ))}
      </div>
      <div className="admin-card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr><th>User</th><th>Role</th><th>Phone</th><th>Status</th><th>Verified</th><th>Rating</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: 700 }}>{u.name}</td>
                <td>{cap(u.role)}</td>
                <td>{u.phone || u.email}</td>
                <td><Pill tone={u.banned ? 'red' : u.suspended ? 'amber' : u.active ? 'green' : 'neutral'}>{u.banned ? 'Banned' : u.suspended ? 'Suspended' : u.active ? 'Active' : 'Pending OTP'}</Pill></td>
                <td>{u.verifiedBadge ? 'Yes' : 'No'}</td>
                <td>{u.rating.count ? `${u.rating.avg.toFixed(1)} (${u.rating.count})` : '—'}</td>
                <td>
                  <div className="flex" style={{ gap: 4, justifyContent: 'flex-end' }}>
                    {!u.verifiedBadge ? <MiniBtn label="Verify" tone="green" onClick={() => onAction(u.id, 'verify')} /> : null}
                    {u.suspended ? <MiniBtn label="Restore" onClick={() => onAction(u.id, 'unsuspend')} /> : <MiniBtn label="Suspend" onClick={() => onAction(u.id, 'suspend')} />}
                    {u.banned ? <MiniBtn label="Unban" onClick={() => onAction(u.id, 'unban')} /> : <MiniBtn label="Ban" tone="red" onClick={() => onAction(u.id, 'ban')} />}
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
      <h2 className="admin-title">All shifts</h2>
      <div className="admin-card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr><th>Role</th><th>Venue</th><th>Status</th><th>Pay</th><th>Agreed</th><th>Responses</th><th>Posted</th><th>Expires</th><th>Fee record</th></tr>
          </thead>
          <tbody>
            {shifts.map((s) => (
              <tr key={s.id}>
                <td>{s.specialty || cap(s.role)}</td>
                <td>{s.managerName}<div className="small muted">{s.locationName}</div></td>
                <td><Pill tone={s.status === 'matched' ? 'green' : s.status === 'open' ? 'amber' : 'neutral'}>{s.status}</Pill></td>
                <td>₹{s.payMin}–{s.payMax}</td>
                <td>{s.agreedPay != null ? `₹${s.agreedPay}` : '—'}</td>
                <td>{s.respCount}</td>
                <td className="small muted">{s.createdAt.slice(0, 16).replace('T', ' ')}</td>
                <td className="small">{s.status === 'open' ? `${Math.max(0, Math.round(s.differenceMs / 60000))} min` : '—'}</td>
                <td>
                  {s.feeRecord ? (
                    <span className="small">fee ₹{s.feeRecord.fee_amount} · payout ₹{s.feeRecord.worker_payout}<br /><i>{Math.round(s.feeRecord.fee_rate * 100)}%</i></span>
                  ) : '—'}
                </td>
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
      <h2 className="admin-title">Earnings & platform fee</h2>
      <div className="stat-grid">
        <div className="stat-card"><div className="stat-num" style={{ color: 'var(--accent-dark)' }}>{Math.round(fees.feeRate * 100)}%</div><div className="stat-lbl">Current service fee</div></div>
      </div>
      <div className="admin-card mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Set the platform fee</p>
        <p className="small muted mb12">This percentage is taken from the worker side of each completed shift. Changing it applies to future matches and re-computes existing confirmed-shift estimates.</p>
        <div className="flex">
          <input type="range" min={0} max={30} step={0.5} value={feeRate} onChange={(e) => setFeeRate(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontWeight: 900, fontSize: 22, minWidth: 70, textAlign: 'right' }}>{feeRate}%</span>
        </div>
        <div className="space-8" />
        <Button size="md" onClick={onSave}><Icon name="Check" size={16} /> Save fee</Button>
      </div>
      <div className="admin-card mt16">
        <p className="section-title" style={{ marginTop: 0 }}>Fee change history</p>
        <table className="admin-table">
          <thead><tr><th>Rate</th><th>Note</th><th>By</th><th>When</th></tr></thead>
          <tbody>
            {(fees.history || []).map((h) => (
              <tr key={h.id}><td>{Math.round(h.rate * 100)}%</td><td>{h.label || '—'}</td><td>{h.updated_by || 'system'}</td><td className="small muted">{h.created_at.slice(0, 16).replace('T', ' ')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Logs({ logs }) {
  if (!logs) return <Loading />;
  return (
    <>
      <h2 className="admin-title">Audit log</h2>
      <div className="admin-card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="admin-table">
          <thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="small muted">{l.created_at.slice(0, 19).replace('T', ' ')}</td>
                <td style={{ fontWeight: 700 }}>{l.action}</td>
                <td className="small">{l.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MiniBtn({ label, tone, onClick }) {
  const color = tone === 'green' ? { color: 'var(--green)' } : tone === 'red' ? { color: 'var(--red)' } : {};
  return <button className="ghost-btn" style={color} onClick={onClick}>{label}</button>;
}

function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

function Loading() {
  return <div className="admin-card"><div className="skeleton" style={{ height: 60 }} /></div>;
}