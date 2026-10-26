import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { enablePush, pushPromptSnoozed, pushState, sendTestPush, snoozePushPrompt } from '../lib/push'
import { track } from '../lib/usage'

/**
 * "Get reminded on your phone": shown once there is something to remind about
 * (a medicine with reminders, or an active reminder) and notifications are
 * off on this device. On iPhone before "Add to Home Screen" the state is
 * needs_install and InstallPrompt explains that step instead.
 */
export function PushPrompt({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  const { session } = useAuth()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    if (!supabase || pushPromptSnoozed()) return
    let alive = true
    void (async () => {
      if ((await pushState()) !== 'off') return
      const [meds, reminders] = await Promise.all([
        supabase!.from('medication_schedules').select('id', { count: 'exact', head: true }).eq('reminders_enabled', true).is('valid_to', null),
        supabase!.from('reminders').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      ])
      if (alive && (meds.count ?? 0) + (reminders.count ?? 0) > 0) {
        setShow(true)
        track('push_prompt_shown')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!show || !session) return null

  async function turnOn() {
    setBusy(true)
    const state = await enablePush(session!.user.id)
    setBusy(false)
    if (state === 'on') {
      track('push_prompt_enabled')
      setShow(false)
      void sendTestPush() // so the person sees what a reminder looks like
    } else if (state === 'denied') setDenied(true)
  }

  function notNow() {
    snoozePushPrompt()
    track('push_prompt_dismissed')
    setShow(false)
  }

  return (
    <section className={`rounded-2xl border border-brand-100 bg-brand-50 p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-700 text-white"><BellRing className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{t('pushPrompt.title')}</h2>
          <p className="mt-0.5 text-sm text-muted">{denied ? t('settings.pushState.denied') : t('pushPrompt.body')}</p>
        </div>
        <button type="button" aria-label={t('pushPrompt.notNow')} onClick={notNow} className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {!denied && (
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void turnOn()} className="min-h-11 flex-1 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-60">{t('pushPrompt.enable')}</button>
          <button type="button" onClick={notNow} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium">{t('pushPrompt.notNow')}</button>
        </div>
      )}
    </section>
  )
}
