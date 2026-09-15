import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

// 'system' leaves data-theme off the root so the prefers-color-scheme block in
// index.css decides; 'light'/'dark' stamp the attribute and win over it.
const MODES = ['system', 'light', 'dark'];
const LS_KEY = 'odc.theme';
const ThemeContext = createContext(null);

function readInitial() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && MODES.includes(saved)) return saved;
  } catch {
    /* private mode */
  }
  return 'system';
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(readInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }, [mode]);

  const setMode = useCallback((next) => {
    if (!MODES.includes(next)) return;
    setModeState(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const toggle = useCallback(() => {
    const isDark = document.documentElement.matches('[data-theme="dark"]')
      || (mode === 'system'
        && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setMode(isDark ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo(
    () => ({ mode, setMode, toggle, modes: MODES }),
    [mode, setMode, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
