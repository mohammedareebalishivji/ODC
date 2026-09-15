import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setAuthStore } from './api';

const AuthContext = createContext(null);
const LS_KEY = 'odc.tokens';
const USER_KEY = 'odc.user';

export function AuthProvider({ children }) {
  const [tokens, setTokens] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [booted, setBooted] = useState(false);
  const [meta, setMeta] = useState(null);
  const refreshing = useRef(null);

  const persist = useCallback((t, u) => {
    try { window.__log && window.__log('persist', t ? 'tokens=SET' : 'tokens=NULL', u ? 'user=SET' : 'user=NULL'); } catch {}
    setTokens(t);
    setUser(u);
    if (t) localStorage.setItem(LS_KEY, JSON.stringify(t));
    else localStorage.removeItem(LS_KEY);
    if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(USER_KEY);
  }, []);

  const refresh = useCallback(async () => {
    const t = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (!t || !t.refreshToken) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: t.refreshToken }),
      });
      if (!res.ok) {
        persist(null, null);
        return false;
      }
      const data = await res.json();
      persist(data, user);
      return true;
    } catch {
      persist(null, null);
      return false;
    }
  }, [persist, user]);

  const authFn = useMemo(
    () => ({
      async login(identifier, password, challenge = '', device = 'web') {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password, device, pin: challenge, code: challenge }),
        });
        if (data.step === 'challenge') {
          return { needs2fa: true, user: data.user };
        }
        persist({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
        return { needs2fa: false, user: data.user };
      },
      // Passwordless login. Must go through persist() so the provider's own
      // token state is updated — writing localStorage directly leaves the
      // in-memory store empty and the next request 401s into a forced logout.
      async loginWithOtp(phone, code, device = 'web') {
        const data = await api('/api/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ phone, code, device }),
        });
        persist({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
        return data.user;
      },
      async finalizeSignup(phone, code) {
        const data = await api('/api/auth/verify', {
          method: 'POST',
          body: JSON.stringify({ phone, code }),
        });
        persist({ accessToken: data.accessToken, refreshToken: data.refreshToken }, data.user);
        return data.user;
      },
    }),
    [persist]
  );

  const logout = useCallback(async () => {
    try {
      const t = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (t) await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t.accessToken}` },
        body: JSON.stringify({ refreshToken: t.refreshToken }),
      });
    } catch {}
    persist(null, null);
  }, [persist]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === LS_KEY) {
        try { setTokens(e.newValue ? JSON.parse(e.newValue) : null); } catch { setTokens(null); }
      }
      if (e.key === USER_KEY) {
        try { setUser(e.newValue ? JSON.parse(e.newValue) : null); } catch { setUser(null); }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    (async () => {
      let done = false;
      if (tokens && tokens.accessToken) {
        try { window.__log && window.__log('boot effect', 'tokens=' + (tokens ? 'SET' : 'NULL'), 'access=' + (tokens && tokens.accessToken ? 'SET' : 'NULL')); } catch {}
        try {
          const data = await api('/api/me', {});
          setUser(data.user);
          setMeta({ specialties: data.specialties || [], languages: data.languages || [] });
          const t = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
          done = true;
        } catch {
          persist(null, null);
        }
      }
      setBooted(true);
    })();
  }, [tokens]);

  const apiUntyped = useMemo(
    () => ({
      api,
      me: async () => {
        const data = await api('/api/me');
        setUser(data.user);
        setMeta({ specialties: data.specialties, languages: data.languages });
        return data.user;
      },
      cat: (u) => {
        setUser(u);
        localStorage.setItem(USER_KEY, JSON.stringify(u));
      },
    }),
    []
  );

  const storeObj = useMemo(
    () => ({ getTokens: () => tokens, refresh: () => { if (!refreshing.current) refreshing.current = refresh().finally(() => (refreshing.current = null)); return refreshing.current; }, forceLogout: () => persist(null, null) }),
    [tokens, refresh, persist]
  );
  setAuthStore(storeObj);

  const value = useMemo(
    () => ({
      user, tokens, booted, meta,
      login: authFn.login, finalizeSignup: authFn.finalizeSignup,
      loginWithOtp: authFn.loginWithOtp, logout,
      updateUser: (u) => { setUser(u); if (u) localStorage.setItem(USER_KEY, JSON.stringify(u)); },
      reload: apiUntyped.me,
      setUser,
    }),
    [user, tokens, booted, meta, authFn, logout, apiUntyped]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useAuthSafe() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}