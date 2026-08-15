import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';
import { logoTop } from '../ui';

const ROLES = [
  {
    key: 'manager', cls: 'manager', Icon: ManagerIcon,
    title: 'I run a restaurant, bar or hotel',
    sub: 'Post shifts when you are short staffed',
  },
  {
    key: 'chef', cls: 'chef', Icon: ChefIcon,
    title: 'I am a chef',
    sub: 'Cook shifts, set your specialties, pick your pay',
  },
  {
    key: 'waiter', cls: 'waiter', Icon: WaiterIcon,
    title: 'I am a waiter',
    sub: 'Pick up serving shifts near you',
  },
];

export default function Signup() {
  const nav = useNavigate();
  return (
    <div className="auth-wrap">
      <div className="auth-panel">
        {logoTop()}
        <h1 className="auth-title">What do you do?</h1>
        <p className="auth-sub">Pick the account type that fits you. You can update profile details later.</p>
        <div className="role-cards">
          {ROLES.map((r) => (
            <button key={r.key} className={`role-card role-${r.cls}`} onClick={() => nav(`/signup/${r.key}`)}>
              <span className="role-card-icon"><r.Icon size={30} /></span>
              <span>
                <span className="role-card-title">{r.title}</span>
                <span className="role-card-sub">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-center small mt16 muted">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}