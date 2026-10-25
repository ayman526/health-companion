import { Suspense } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Home, FolderHeart, MessageCircleHeart, Pill, CalendarClock, Languages, Bell, Settings, LockKeyhole, Eye, EyeOff } from 'lucide-react'
import { setDiscreet, useDiscreet } from '../lib/discreet'
import { setLanguage } from '../i18n'

const NAV = [
  { to: '/', key: 'home', icon: Home },
  { to: '/records', key: 'records', icon: FolderHeart },
  { to: '/advisor', key: 'advisor', icon: MessageCircleHeart },
  { to: '/medications', key: 'medications', icon: Pill },
  { to: '/timeline', key: 'timeline', icon: CalendarClock },
] as const

function LanguageToggle() {
  const { t, i18n } = useTranslation()
  return (
    <button
      type="button"
      onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-brand-50"
    >
      <Languages className="size-4" aria-hidden />
      {t('actions.switchLanguage')}
    </button>
  )
}

/** Always-visible reminder that records are private, and the way into the Privacy Center. */
function PrivacyBadge() {
  const { t } = useTranslation()
  return (
    <Link to="/privacy" className="inline-flex min-h-8 items-center gap-1 rounded-full bg-brand-50 px-2.5 text-xs font-medium text-brand-700">
      <LockKeyhole className="size-3.5" aria-hidden />
      {/* Icon only on narrow phones, where the header is tight. */}
      <span className="max-[400px]:sr-only">{t('privacy.badge')}</span>
    </Link>
  )
}

function HeaderLinks({ withLabels }: { withLabels?: boolean }) {
  const { t } = useTranslation()
  const discreet = useDiscreet()
  const cls = 'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-3 text-sm font-medium text-muted hover:bg-canvas hover:text-ink'
  const DiscreetIcon = discreet ? EyeOff : Eye
  return (
    <>
      <button type="button" aria-pressed={discreet} aria-label={t(discreet ? 'discreet.off' : 'discreet.on')} title={t(discreet ? 'discreet.off' : 'discreet.on')}
        onClick={() => setDiscreet(!discreet)} className={`${cls} ${discreet ? 'bg-brand-50 text-brand-700' : ''}`}>
        <DiscreetIcon className="size-5" aria-hidden />{withLabels && t(discreet ? 'discreet.off' : 'discreet.on')}
      </button>
      <Link to="/reminders" aria-label={t('reminders.title')} className={cls}><Bell className="size-5" aria-hidden />{withLabels && t('reminders.title')}</Link>
      <Link to="/settings" aria-label={t('settings.title')} className={cls}><Settings className="size-5" aria-hidden />{withLabels && t('settings.title')}</Link>
    </>
  )
}

export function AppShell() {
  const { t } = useTranslation()

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar on tablet and desktop */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface p-4 md:flex">
        <div className="mb-8 flex flex-col items-start gap-2 px-3 pt-2">
          <span className="text-lg font-semibold text-brand-700">{t('app.name')}</span>
          <PrivacyBadge />
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium ${
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas hover:text-ink'
                }`
              }
            >
              <Icon className="size-5" aria-hidden />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-start gap-2">
          <HeaderLinks withLabels />
          <LanguageToggle />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <span className="whitespace-nowrap text-base font-semibold text-brand-700">{t('app.name')}</span>
            <PrivacyBadge />
          </span>
          <div className="flex items-center gap-1">
            <HeaderLinks />
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-10 md:pb-10">
          {/* Navigation stays visible while a screen's code downloads. */}
          <Suspense fallback={<p role="status" className="py-10 text-center text-sm text-muted">{t('auth.loading')}</p>}>
            <Outlet />
          </Suspense>
        </main>

        {/* Bottom navigation on mobile */}
        <nav
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
          aria-label="Primary"
        >
          {NAV.map(({ to, key, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  isActive ? 'text-brand-700' : 'text-muted'
                }`
              }
            >
              <Icon className="size-6" aria-hidden />
              {t(`nav.${key}`)}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
