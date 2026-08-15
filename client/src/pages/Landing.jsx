import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../state';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';
import { Button } from '../ui';

export default function Landing() {
  const { user } = useAuth();
  return (
    <div className="auth-wrap" style={{ justifyContent: 'flex-start', paddingTop: 60 }}>
      <div className="auth-panel text-center">
        <div className="auth-logo">
          <span className="logo"><ChefIcon size={40} style={{ transform: 'none' }} /><span>O<span style={{ color: 'var(--accent)' }}>.</span>D<span style={{ color: 'var(--accent)' }}>.</span>C</span></span>
        </div>
        <h1 className="auth-title">On-Demand Crew</h1>
        <p className="auth-sub">Fill empty shifts in your restaurant — or pick up a paid shift near you, on your terms.</p>

        <div className="stack mt24">
          <Link to="/signup" style={{ textDecoration: 'none' }}>
            <Button full>Create an account</Button>
          </Link>
          <Link to="/login" style={{ textDecoration: 'none' }}>
            <Button full variant="ghost">I already have an account — Log in</Button>
          </Link>
        </div>

        <div className="divider" style={{ marginTop: 28 }} />
        <p className="small" style={{ color: 'var(--muted)' }}>For restaurants, bars and hotels that need</p>
        <div className="flex" style={{ justifyContent: 'center', marginTop: 12, gap: 16 }}>
          <div className="flex" style={{ flexDirection: 'column', gap: 2 }}>
            <WaiterIcon size={30} style={{ color: 'var(--blue)', margin: '0 auto' }} />
            <span className="small">Waiters</span>
          </div>
          <div className="flex" style={{ flexDirection: 'column', gap: 2 }}>
            <ChefIcon size={30} style={{ color: 'var(--amber)', margin: '0 auto' }} />
            <span className="small">Chefs</span>
          </div>
          <div className="flex" style={{ flexDirection: 'column', gap: 2 }}>
            <ManagerIcon size={30} style={{ color: 'var(--green)', margin: '0 auto' }} />
            <span className="small">Managers</span>
          </div>
        </div>
        {user ? (
          <p className="mt24 small"><Link to="/app">Continue as {user.name} →</Link></p>
        ) : null}
      </div>
    </div>
  );
}