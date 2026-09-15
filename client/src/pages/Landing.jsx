
import { Link } from 'react-router-dom';
import { useAuth } from '../state';
import { ChefIcon, WaiterIcon, ManagerIcon } from '../icons';
import { Button } from '../components/ui';

import { useI18n } from '../i18n';

export default function Landing() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-[60px] px-6 bg-background">
      <div className="w-full max-w-[440px] bg-card border border-border rounded-3xl p-7 shadow-[0_8px_24px_rgb(26 28 26 / 0.07)] text-center">
        {/* Logo */}
        <div className="flex justify-center mb-4.5">
          <span className="font-black text-[22px] tracking-tight inline-flex items-center gap-2 text-ink">
            <ChefIcon size={40} style={{ transform: 'none' }} />
            <span>O<span className="text-primary">.</span>D<span className="text-primary">.</span>C</span>
          </span>
        </div>

        {/* Headline */}
        <h1 className="text-[26px] font-black tracking-tight">{t('landing.tagline')}</h1>
        <p className="text-muted-foreground mt-2 mb-6 text-[15px] leading-relaxed max-w-[320px] mx-auto">
          Fill empty shifts in your restaurant — or pick up a paid shift near you, on your terms.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 mt-6">
          <Link to="/signup" className="no-underline">
            <Button className="w-full" size="lg">{t('landing.createAccount')}</Button>
          </Link>
          <Link to="/login" className="no-underline">
            <Button className="w-full" variant="ghost" size="lg">I already have an account — Log in</Button>
          </Link>
        </div>

        {/* Divider */}
        <div className="h-px bg-border my-7" />

        {/* Roles */}
        <p className="text-xs text-muted-foreground">{t('landing.forVenues')}</p>
        <div className="flex justify-center mt-3 gap-6">
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-xl bg-blue-soft flex items-center justify-center">
              <WaiterIcon size={26} style={{ color: 'var(--color-blue)' }} />
            </div>
            <span className="text-xs font-semibold text-ink-soft">{t('landing.waiters')}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-xl bg-amber-soft flex items-center justify-center">
              <ChefIcon size={26} style={{ color: 'var(--color-amber)' }} />
            </div>
            <span className="text-xs font-semibold text-ink-soft">{t('landing.chefs')}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-12 h-12 rounded-xl bg-green-soft flex items-center justify-center">
              <ManagerIcon size={26} style={{ color: 'var(--color-green)' }} />
            </div>
            <span className="text-xs font-semibold text-ink-soft">{t('landing.managers')}</span>
          </div>
        </div>

        {user && (
          <p className="mt-6 text-xs"><Link to="/app" className="text-primary font-semibold">Continue as {user.name} →</Link></p>
        )}
      </div>
    </div>
  );
}
