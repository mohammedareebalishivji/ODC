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
      async login(identifier, password, device) {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier, password, device }),
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
    (async () => {
      let done = false;
      if (tokens && tokens.accessToken) {
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
    () => ({ getTokens: () => tokens, refresh: () => { if (!refreshing.current) refreshing.current = refresh().finally(() => (refreshing.current = null)); return refreshing.current; } }),
    [tokens, refresh]
  );
  setAuthStore(storeObj);

  const value = useMemo(
    () => ({
      user, tokens, booted, meta,
      login: authFn.login, finalizeSignup: authFn.finalizeSignup, logout,
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