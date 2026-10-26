import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, ChevronDown, HeartPulse, LockKeyhole, MapPin, Pill, Plus, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { setLanguage } from '../i18n'
import { CONSENT_VERSION } from '../lib/consent'
import { setActiveProfileId } from '../lib/activeProfile'
import { loadProfileDetails, saveProfileFields } from '../lib/profile'
import { todayIn } from '../lib/medications'
import { track, type UsageEvent } from '../lib/usage'
import { ageOn } from '../domain/profileOptions'
import { AboutFields, type AboutValue } from '../components/ProfileFields'

type ConsentKey = 'terms' | 'privacy' | 'health_data_processing' | 'ai_processing'
const REQUIRED: ConsentKey[] = ['terms', 'privacy', 'health_data_processing']
const ALL: ConsentKey[] = [...REQUIRED, 'ai_processing']
// Short on purpose: privacy, a few facts that change how results are read, then
// straight into a first action. Health background, family history, goals,
// pregnancy and the doctor's name are asked later, where they matter.
const STEPS = ['consent', 'about', 'start'] as const
type Step = (typeof STEPS)[number]

const detectCountry = (): 'EG' | 'US' => (Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('America') ? 'US' : 'EG')

const FIRST_ACTIONS = [
  { key: 'report', to: '/records/scan', icon: Camera },
  { key: 'prescription', to: '/records/scan', icon: Pill },
  { key: 'medicine', to: '/medications/new', icon: Plus },
  { key: 'reading', to: '/vitals', icon: HeartPulse },
] as const

export function OnboardingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { session, profile, refreshProfile } = useAuth()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayIn(timeZone)

  // Resuming: with a profile, consent is done. (Earlier, longer versions saved
  // higher step numbers; anything past "about" resumes at the first action.)
  const [stepIndex, setStepIndex] = useState(profile ? (profile.onboarding_step >= 3 ? 2 : 1) : 0)
  const [profileId, setProfileId] = useState<string | null>(profile?.id ?? null)
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ terms: false, privacy: false, health_data_processing: false, ai_processing: false })
  const [individually, setIndividually] = useState(false)
  const [adult, setAdult] = useState(false)
  const [about, setAbout] = useState<AboutValue>({ display_name: '', date_of_birth: '', sex: '', country: detectCountry(), height_cm: '', weight_kg: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!profile) return
    void loadProfileDetails().then(({ profile: p }) => {
      if (!p) return
      setAbout((a) => ({ ...a, display_name: p.display_name ?? '', date_of_birth: p.date_of_birth ?? '', sex: p.sex ?? '', country: p.country }))
    })
  }, [profile])

  const step: Step = STEPS[stepIndex]

  function go(delta: 1 | -1) {
    const i = Math.max(0, Math.min(STEPS.length - 1, stepIndex + delta))
    setError(null)
    setStepIndex(i)
    if (profileId && delta === 1) void saveProfileFields(profileId, { onboarding_step: i === 2 ? 3 : i })
  }

  async function run(save: () => Promise<boolean | string>) {
    setSaving(true)
    setError(null)
    const result = await save()
    setSaving(false)
    if (result === true) go(1)
    else setError(typeof result === 'string' ? result : t('review.saveError'))
  }

  // ---------------------------------------------------------------- step savers
  async function saveConsent(all: boolean): Promise<boolean | string> {
    if (!supabase || !session) return false
    const chosen = all ? { terms: true, privacy: true, health_data_processing: true, ai_processing: true } : consents
    if (!REQUIRED.every((k) => chosen[k])) return t('onboarding.requiredConsents')
    if (!adult) return t('onboarding.mustConfirmAdult')
    setConsents(chosen)
    const { error: e1 } = await supabase.from('user_consents').insert(
      ALL.map((k) => ({ user_id: session.user.id, consent_type: k, version: CONSENT_VERSION, granted: chosen[k] })),
    )
    if (e1) return false
    const lang = i18n.language === 'ar' ? 'ar' : 'en'
    const fields = { country: about.country, ui_language: lang, explanation_language: lang, time_zone: timeZone, onboarding_step: 1 }
    // Your own profile: reuse it if consent is given again, otherwise create it.
    const { data: existing } = await supabase.from('health_profiles').select('id').eq('relationship', 'self').eq('is_demo', false).maybeSingle()
    const { data, error: e2 } = existing
      ? await supabase.from('health_profiles').update(fields).eq('id', existing.id).select('id').single()
      : await supabase.from('health_profiles').insert({ owner_id: session.user.id, relationship: 'self', ...fields }).select('id').single()
    if (e2) return false
    setActiveProfileId(data.id)
    setProfileId(data.id)
    return true
  }

  async function saveAbout(): Promise<boolean | string> {
    if (!profileId) return false
    if (about.date_of_birth) {
      const age = ageOn(about.date_of_birth, today)
      if (age != null && age < 18) return t('onboarding.mustBeAdult')
    }
    return saveProfileFields(profileId, {
      display_name: about.display_name.trim() || null, date_of_birth: about.date_of_birth || null, sex: about.sex || null,
    })
  }

  async function finish(next: string, event: UsageEvent) {
    if (!profileId) return
    setSaving(true)
    track('onboarding_done')
    track(event)
    await saveProfileFields(profileId, { onboarding_step: 3, onboarding_completed_at: new Date().toISOString() })
    navigate(next, { replace: true })
    await refreshProfile()
  }

  const header = (title: string, intro?: string) => (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
    </>
  )

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6">
      <main className="mx-auto w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex flex-1 gap-1.5" aria-hidden>
            {STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= stepIndex ? 'bg-brand-600' : 'bg-line'}`} />)}
          </div>
          <span className="sr-only">{t('onboarding.step', { n: stepIndex + 1, total: STEPS.length })}</span>
          <button type="button" onClick={() => setLanguage(i18n.language === 'ar' ? 'en' : 'ar')} className="min-h-10 rounded-full border border-line bg-surface px-3 text-xs font-medium">
            {t('actions.switchLanguage')}
          </button>
        </div>

        {step === 'consent' && (
          <>
            {header(t('onboarding.consentTitle'), t('onboarding.consentIntro'))}
            <ul className="mt-6 flex flex-col gap-3">
              {([['lock', LockKeyhole], ['place', MapPin], ['ai', Sparkles]] as const).map(([k, Icon]) => (
                <li key={k} className="flex gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden /></span>
                  <span><span className="block font-medium">{t(`onboarding.summary.${k}.title`)}</span><span className="block text-sm text-muted">{t(`onboarding.summary.${k}.body`)}</span></span>
                </li>
              ))}
            </ul>

            <h2 className="mb-2 mt-6 text-sm font-semibold">{individually ? t('onboarding.chooseTitle') : t('onboarding.readFull')}</h2>
            <div className="flex flex-col gap-2">
              {ALL.map((k) => (
                <details key={k} open={individually} className="group rounded-2xl border border-line bg-surface">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2">
                    {individually && (
                      <input type="checkbox" className="size-5 shrink-0 accent-brand-700" checked={consents[k]} aria-label={t(`onboarding.consent.${k}.title`)}
                        onClick={(e) => e.stopPropagation()} onChange={(e) => setConsents({ ...consents, [k]: e.target.checked })} />
                    )}
                    <span className="flex-1 font-medium">
                      {t(`onboarding.consent.${k}.title`)}
                      {k === 'ai_processing' && <span className="ms-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700">{t('onboarding.recommended')}</span>}
                      {k !== 'ai_processing' && individually && <span className="ms-2 text-xs font-normal text-muted">{t('onboarding.required')}</span>}
                    </span>
                    <ChevronDown className="size-4 shrink-0 text-muted transition group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="px-4 pb-4 text-sm text-muted">{t(`onboarding.consent.${k}.body`)}</p>
                </details>
              ))}
            </div>
            {individually && !consents.ai_processing && <p className="mt-3 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">{t('onboarding.withoutAi')}</p>}
            <p className="mt-3 text-xs text-muted">{t('onboarding.legalDraftNote')}</p>

            {/* Always visible on a phone: the decision never hides below the fold. */}
            <div className="sticky bottom-0 -mx-4 mt-6 border-t border-line bg-canvas/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
              <label className="mb-3 flex min-h-11 items-center gap-3">
                <input type="checkbox" className="size-5 shrink-0 accent-brand-700" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
                <span className="text-sm font-medium">{t('onboarding.adultConfirm')}</span>
              </label>
              {error && <p role="alert" className="mb-2 text-sm text-status-urgent">{error}</p>}
              {!individually ? (
                <>
                  <button type="button" disabled={saving || !adult} onClick={() => void run(() => saveConsent(true))} className="min-h-14 w-full rounded-xl bg-brand-700 font-semibold text-white disabled:opacity-50">
                    {saving ? t('onboarding.saving') : t('onboarding.agreeAll')}
                  </button>
                  <div className="mt-1 flex justify-end">
                    <button type="button" onClick={() => setIndividually(true)} className="min-h-11 text-sm font-medium text-muted underline">{t('onboarding.chooseIndividually')}</button>
                  </div>
                </>
              ) : (
                <>
                  <button type="button" disabled={saving || !adult} onClick={() => void run(() => saveConsent(false))} className="min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white disabled:opacity-50">
                    {saving ? t('onboarding.saving') : t('onboarding.continue')}
                  </button>
                  <button type="button" onClick={() => setIndividually(false)} className="mt-1 min-h-11 w-full text-sm text-muted">{t('onboarding.back')}</button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'about' && (
          <>
            {header(t('onboarding.profileTitle'), t('onboarding.aboutIntro'))}
            <div className="mt-6"><AboutFields value={about} onChange={setAbout} compact /></div>
            {error && <p role="alert" className="mt-3 text-sm text-status-urgent">{error}</p>}
            <div className="mt-8 flex items-center gap-3">
              <button type="button" disabled={saving} onClick={() => void run(saveAbout)} className="min-h-12 flex-1 rounded-xl bg-brand-700 px-4 font-medium text-white disabled:opacity-60">
                {saving ? t('onboarding.saving') : t('onboarding.continue')}
              </button>
              <button type="button" onClick={() => go(1)} className="min-h-12 px-3 font-medium text-muted">{t('onboarding.skip')}</button>
            </div>
          </>
        )}

        {step === 'start' && (
          <>
            {header(t('onboarding.startTitle'), t('onboarding.startIntro'))}
            <div className="mt-6 grid grid-cols-2 gap-3">
              {FIRST_ACTIONS.map((a) => (
                <button key={a.key} type="button" disabled={saving} onClick={() => void finish(a.to, `first_action_${a.key}`)}
                  className="flex min-h-36 flex-col items-start gap-3 rounded-2xl border border-line bg-surface p-4 text-start disabled:opacity-60">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700"><a.icon className="size-6" aria-hidden /></span>
                  <span>
                    <span className="block font-semibold leading-snug">{t(`onboarding.first.${a.key}.title`)}</span>
                    <span className="mt-1 block text-xs text-muted">{t(`onboarding.first.${a.key}.hint`)}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" disabled={saving} onClick={() => void finish('/', 'first_action_explore')} className="mt-4 min-h-12 w-full rounded-xl px-4 font-medium text-muted">{t('onboarding.startLater')}</button>
          </>
        )}
      </main>
    </div>
  )
}
