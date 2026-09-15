import { Moon, Sun } from 'lucide-react';
import { useI18n } from '../i18n';
import { useTheme } from '../theme';

/**
 * The pill-shaped EN / हिन्दी switch from the Stitch header designs.
 * Renders as a radiogroup so keyboard and screen-reader users get the same
 * "pick one of two" affordance the visual design implies.
 */
export function LanguageToggle({ className = '' }) {
  const { lang, setLang, locales, t } = useI18n();

  return (
    <div
      className={`lang-toggle ${className}`}
      role="radiogroup"
      aria-label={t('lang.label')}
    >
      {locales.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          lang={l.code}
          className={`lang-toggle-item ${lang === l.code ? 'on' : ''}`}
          onClick={() => setLang(l.code)}
        >
          {l.native}
        </button>
      ))}
    </div>
  );
}

/** Sun/moon control matching the header in the dark-mode design. */
export function ThemeToggle({ className = '' }) {
  const { mode, toggle } = useTheme();
  const { t } = useI18n();
  const label = mode === 'dark' ? t('misc.toLight') : t('misc.toDark');

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      {mode === 'dark'
        ? <Sun size={16} aria-hidden="true" />
        : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}

export default LanguageToggle;
