import { useI18n } from '../i18n';

/**
 * Password strength meter shown under new-password fields.
 *
 * Mirrors the server's own scoring in auth.js so the bar and the server's
 * "strong enough" check never disagree with each other.
 */
function scorePassword(pw) {
  let n = 0;
  if (pw.length >= 8) n += 1;
  if (pw.length >= 12) n += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) n += 1;
  return Math.min(4, n);
}

const BARS = [1, 2, 3, 4];

export default function PasswordStrength({ password = '' }) {
  const { t } = useI18n();
  if (!password) return null;

  const score = scorePassword(password);
  const labelKey = score <= 1 ? 'pwd.weak' : score <= 3 ? 'pwd.good' : 'pwd.strong';
  const tone = score <= 1 ? 'sl-weak' : score <= 3 ? 'sl-good' : 'sl-strong';

  return (
    <div>
      <div className="strength-row" role="presentation">
        {BARS.map((i) => (
          <span key={i} className={`strength-bar ${i <= score ? 'on' : ''}`} />
        ))}
      </div>
      {/* Announced politely so a screen-reader user hears the rating change. */}
      <div className={`strength-label ${tone}`} aria-live="polite">
        {t(labelKey)} {score < 4 ? t('pwd.hint') : t('pwd.great')}
      </div>
    </div>
  );
}
