import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { installSnoozed, promptInstall, snoozeInstall, useInstallMode } from '../lib/install'
import { track } from '../lib/usage'

/**
 * "Add to Home Screen" guidance. `card` appears on Home until installed or
 * snoozed; `inline` is always shown (e.g. in Settings, next to reminders).
 */
export function InstallPrompt({ variant = 'card' }: { variant?: 'card' | 'inline' }) {
  const { t } = useTranslation()
  const mode = useInstallMode()
  const [hidden, setHidden] = useState(() => variant === 'card' && installSnoozed())
  const visible = !hidden && (mode === 'ios' || mode === 'prompt')

  useEffect(() => {
    if (visible && variant === 'card') track('install_prompt_shown')
  }, [visible, variant])

  if (!visible) return null

  const close = () => {
    snoozeInstall()
    setHidden(true)
    track('install_prompt_dismissed')
  }

  return (
    <section className={`rounded-2xl border border-brand-100 bg-brand-50 p-4 ${variant === 'inline' ? 'mt-3' : ''}`}>
      <div className="flex items-start gap-3">
        <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('install.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{t(mode === 'ios' ? 'install.whyIos' : 'install.why')}</p>
        </div>
        {variant === 'card' && (
          <button type="button" aria-label={t('install.notNow')} onClick={close} className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {mode === 'ios' ? (
        <ol className="mt-3 flex flex-col gap-2 text-sm">
          <li className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">1</span>
            {t('install.ios1')} <Share className="size-4 shrink-0 text-brand-700" aria-label={t('install.shareIcon')} /></li>
          <li className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">2</span>
            {t('install.ios2')} <SquarePlus className="size-4 shrink-0 text-brand-700" aria-hidden /></li>
          <li className="flex items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-semibold text-white">3</span>
            {t('install.ios3')}</li>
        </ol>
      ) : (
        <button type="button" onClick={async () => { if (await promptInstall()) track('install_prompt_done') }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">
          <Download className="size-4" aria-hidden /> {t('install.button')}
        </button>
      )}
      {mode === 'ios' && variant === 'card' && (
        <button type="button" onClick={() => { close(); track('install_prompt_done') }} className="mt-3 min-h-10 text-sm font-medium text-brand-700">{t('install.done')}</button>
      )}
    </section>
  )
}
