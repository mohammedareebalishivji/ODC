import { useI18n } from '../i18n';

/**
 * O.D.C brand lockup, from the Stitch logo artboards: a teal rounded tile
 * holding a cloche, the wordmark, a hairline rule, and the descriptor.
 *
 * `variant="mark"` renders just the tile — use it where space is tight (app
 * bar, favicon-sized slots). `variant="full"` is the horizontal lockup.
 */
export function LogoMark({ size = 40, className = '' }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="O.D.C"
      focusable="false"
    >
      <rect width="48" height="48" rx="12" fill="var(--color-teal)" />
      {/* Cloche dome + handle */}
      <circle cx="24" cy="15.5" r="2.6" fill="var(--color-m3-on-primary)" />
      <path
        d="M11 31c0-7.2 5.8-13 13-13s13 5.8 13 13H11z"
        fill="var(--color-m3-on-primary)"
      />
      {/* Serving tray, in the brand's terracotta */}
      <rect x="9" y="33" width="30" height="4.2" rx="2.1" fill="var(--color-m3-secondary-container)" />
    </svg>
  );
}

export default function Logo({ size = 40, showDescriptor = true, className = '' }) {
  const { t } = useI18n();
  return (
    <span className={`brand-lockup ${className}`}>
      <LogoMark size={size} />
      <span className="brand-word">
        O<span className="brand-dot">.</span>D<span className="brand-dot">.</span>C
      </span>
      {showDescriptor && (
        <>
          <span className="brand-rule" aria-hidden="true" />
          <span className="brand-descriptor">
            <span className="brand-descriptor-main">{t('brand.descriptorMain')}</span>
            <span className="brand-descriptor-sub">{t('brand.descriptorSub')}</span>
          </span>
        </>
      )}
    </span>
  );
}
