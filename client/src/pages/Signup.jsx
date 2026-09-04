import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';

const ROLES = [
  {
    key: 'manager', Icon: ManagerIcon, iconColor: 'text-green', iconBg: 'bg-green-soft',
    title: 'I run a restaurant, bar or hotel',
    sub: 'Post shifts when you are short staffed',
  },
  {
    key: 'chef', Icon: ChefIcon, iconColor: 'text-amber', iconBg: 'bg-amber-soft',
    title: 'I am a chef',
    sub: 'Cook shifts, set your specialties, pick your pay',
  },
  {
    key: 'waiter', Icon: WaiterIcon, iconColor: 'text-blue', iconBg: 'bg-blue-soft',
    title: 'I am a waiter',
    sub: 'Pick up serving shifts near you',
  },
];

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

export default function Signup() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgba(46,53,51,0.07)]">
        <LogoTop />
        <h1 className="text-2xl font-black text-center tracking-tight">What do you do?</h1>
        <p className="text-muted-foreground text-center mt-2 mb-5.5 text-[14.5px] max-w-[320px] mx-auto leading-relaxed">
          Pick the account type that fits you. You can update profile details later.
        </p>
        <div className="grid gap-3 mt-2">
          {ROLES.map((r) => (
            <button
              key={r.key}
              className="flex items-center gap-4 py-4 px-[18px] border-[1.5px] border-border rounded-[18px] bg-card text-left transition-all duration-100 hover:border-primary"
              onClick={() => nav(`/signup/${r.key}`)}
            >
              <span className={`w-[54px] h-[54px] rounded-[16px] flex items-center justify-center shrink-0 ${r.iconBg}`}>
                <r.Icon size={30} className={r.iconColor} />
              </span>
              <span>
                <span className="font-extrabold text-[17px] block">{r.title}</span>
                <span className="text-muted-foreground text-[13.5px] mt-0.5 block">{r.sub}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="text-center text-xs mt-4 text-muted-foreground">
          Already have an account? <Link to="/login" className="text-accent-dark font-semibold">Log in</Link>
        </p>
      </div>
    </div>
  );
}
