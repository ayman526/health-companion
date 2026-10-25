import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, Languages, LogOut, Mail, MessageCircle, ShieldCheck, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { setLanguage } from '../i18n'
import { deliveryChannels, disablePush, enablePush, pushState, type PushState } from '../lib/push'
import { CONSENT_VERSION } from '../lib/consent'
import { findRepeatingReminder, setRepeatingReminder } from '../lib/daily'
import { PageHeader } from '../components/ui'
import { toWesternDigits } from '../domain/numbers'

interface Prefs {
  email_enabled: boolean
  whatsapp_enabled: boolean
  whatsapp_number: string
}

function Section({ icon: Icon, title, children }: { icon: typeof Bell; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-5 text-brand-700" aria-hidden /> {title}</h2>
      {children}
    </section>
  )
}

export function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { session, profile, signOut } = useAuth()
  const [sunday, setSunday] = useState(false)
  const userId = session?.user.id ?? ''
  const [push, setPush] = useState<PushState | null>(null)
  const [channels, setChannels] = useState<{ push: boolean; email: boolean; whatsapp: boolean } | null>(null)
  const [prefs, setPrefs] = useState<Prefs>({ email_enabled: true, whatsapp_enabled: false, whatsapp_number: '' })
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    void pushState().then(setPush)
    void deliveryChannels().then(setChannels)
    void findRepeatingReminder('weekly_summary').then((r) => setSunday(!!r))
    if (supabase) {
      void supabase.from('notification_preferences').select('email_enabled, whatsapp_enabled, whatsapp_number').maybeSingle()
        .then(({ data }) => data && setPrefs({ ...data, whatsapp_number: data.whatsapp_number ?? '' }))
    }
  }, [])

  async function savePrefs(next: Prefs) {
    if (!supabase) return
    setSaved(false)
    setError(false)
    const number = next.whatsapp_number.replace(/[\s-]/g, '')
    if (next.whatsapp_enabled && !/^\+[1-9]\d{7,14}$/.test(number)) return setError(true)
    const { error: e } = await supabase.from('notification_preferences').upsert({
      user_id: userId, email_enabled: next.email_enabled, whatsapp_enabled: next.whatsapp_enabled,
      whatsapp_number: number || null, updated_at: new Date().toISOString(),
    })
    if (e) return setError(true)
    await supabase.from('user_consents').insert([
      { user_id: userId, consent_type: 'notifications_email', version: CONSENT_VERSION, granted: next.email_enabled },
      { user_id: userId, consent_type: 'notifications_whatsapp', version: CONSENT_VERSION, granted: next.whatsapp_enabled },
    ])
    setPrefs({ ...next, whatsapp_number: number })
    setSaved(true)
  }

  const notReady = (on: boolean | undefined) => channels && !on && <span className="ms-2 text-xs font-normal text-status-watch">{t('settings.notSetUp')}</span>

  return (
    <>
      <PageHeader title={t('settings.title')} />
      <div className="flex flex-col gap-4">
        <Link to="/profile" className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <UserRound className="size-5 shrink-0 text-brand-700" aria-hidden />
          <span className="flex-1"><span className="block font-semibold">{t('profile.title')}</span><span className="block text-sm text-muted">{t('profile.settingsHint')}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        <Link to="/family" className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <Users className="size-5 shrink-0 text-brand-700" aria-hidden />
          <span className="flex-1"><span className="block font-semibold">{t('family.title')}</span><span className="block text-sm text-muted">{t('family.settingsHint')}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>
        <Section icon={Languages} title={t('settings.language')}>
          <div className="flex gap-2">
            {(['en', 'ar'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={i18n.language === l} onClick={() => setLanguage(l)}
                className={`min-h-11 rounded-full border px-4 text-sm font-medium ${i18n.language === l ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
                {l === 'en' ? 'English' : 'العربية'}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={Bell} title={t('settings.notifications')}>
          <p className="mb-3 text-sm text-muted">{t('settings.notificationsIntro')}</p>
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-medium">{t('settings.push')} {notReady(channels?.push)}</p>
              <p className="text-sm text-muted">{push ? t(`settings.pushState.${push}`) : t('auth.loading')}</p>
              {push === 'off' && <button type="button" onClick={async () => setPush(await enablePush(userId))} className="mt-2 min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('settings.enablePush')}</button>}
              {push === 'on' && <button type="button" onClick={async () => setPush(await disablePush(userId))} className="mt-2 min-h-11 rounded-xl border border-line px-4 text-sm font-medium">{t('settings.disablePush')}</button>}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={prefs.email_enabled} onChange={(e) => void savePrefs({ ...prefs, email_enabled: e.target.checked })} />
              <span><span className="flex items-center gap-1 font-medium"><Mail className="size-4" aria-hidden /> {t('settings.email')} {notReady(channels?.email)}</span><span className="text-muted">{t('settings.emailHint')}</span></span>
            </label>
            <div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={prefs.whatsapp_enabled} onChange={(e) => setPrefs({ ...prefs, whatsapp_enabled: e.target.checked })} />
                <span><span className="flex items-center gap-1 font-medium"><MessageCircle className="size-4" aria-hidden /> {t('settings.whatsapp')} {notReady(channels?.whatsapp)}</span><span className="text-muted">{t('settings.whatsappHint')}</span></span>
              </label>
              {prefs.whatsapp_enabled && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input dir="ltr" inputMode="tel" placeholder="+201001234567" className="min-h-11 flex-1 rounded-lg border border-line px-3 text-sm" value={prefs.whatsapp_number} onChange={(e) => setPrefs({ ...prefs, whatsapp_number: toWesternDigits(e.target.value) })} />
                  <button type="button" onClick={() => void savePrefs(prefs)} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('reminders.save')}</button>
                </div>
              )}
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={sunday} disabled={!profile}
                onChange={async (e) => {
                  const on = e.target.checked
                  if (profile && await setRepeatingReminder(profile.id, 'weekly_summary', on, t('weekly.reminderTitle'), '18:00', profile.time_zone)) setSunday(on)
                }} />
              <span><span className="font-medium">{t('weekly.remindSunday')}</span><span className="block text-muted">{t('settings.weeklyHint')}</span></span>
            </label>
            {saved && <p role="status" className="text-sm text-status-ok">{t('settings.saved')}</p>}
            {error && <p role="alert" className="text-sm text-status-urgent">{t('settings.saveError')}</p>}
            <p className="text-xs text-muted">{t('settings.privacyOfMessages')}</p>
          </div>
        </Section>

        <Link to="/privacy" className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface p-4">
          <ShieldCheck className="size-5 shrink-0 text-brand-700" aria-hidden />
          <span className="flex-1"><span className="block font-semibold">{t('privacy.title')}</span><span className="block text-sm text-muted">{t('privacy.settingsHint')}</span></span>
          <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
        </Link>

        <Section icon={LogOut} title={t('settings.account')}>
          <p className="mb-3 text-sm text-muted"><span dir="ltr">{session?.user.email}</span></p>
          <button type="button" onClick={() => void signOut()} className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium">{t('auth.signOut')}</button>
        </Section>
      </div>
    </>
  )
}
