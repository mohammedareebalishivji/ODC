import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import en from './en';
import hi from './hi';

const CATALOGUES = { en, hi };
export const LOCALES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

const LS_KEY = 'odc.lang';
const I18nContext = createContext(null);

function detectInitial() {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && CATALOGUES[saved]) return saved;
  } catch {
    /* private mode — fall through to language detection */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language || '' : '';
  return nav.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

// "Pay {amount} now" + { amount: '₹500' } -> "Pay ₹500 now"
function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match
  );
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(detectInitial);

  // Keep <html lang> in sync so the :lang(hi) font stack and screen readers
  // both get the right language.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!CATALOGUES[next]) return;
    setLangState(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* non-fatal: the choice just won't persist */
    }
  }, []);

  const t = useCallback(
    (key, vars) => {
      const table = CATALOGUES[lang] || en;
      let str = table[key];
      if (str === undefined) {
        str = en[key];
        if (str === undefined) {
          if (import.meta.env.DEV) {
            console.warn(`[i18n] missing key: ${key}`);
          }
          // Showing the key beats showing nothing when copy is missing.
          return key;
        }
      }
      return interpolate(str, vars);
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, locales: LOCALES }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

// Convenience hook for the common case of only needing the translate function.
export function useT() {
  return useI18n().t;
}
