import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, Camera, Check, ChevronDown, FileText, LockKeyhole, MapPin, Pill, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { setLanguage } from '../i18n'
import { CONSENT_VERSION } from '../lib/consent'
import { setActiveProfileId } from '../lib/activeProfile'
import { loadProfileDetails, saveAllergies, saveConditions, saveFamilyHistory, saveProfileFields } from '../lib/profile'
import { enablePush, pushState, type PushState } from '../lib/push'
import { todayIn } from '../lib/medications'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, FAMILY_OPTIONS, ageOn, askPregnancy } from '../domain/profileOptions'
import { parseNumber } from '../domain/numbers'
import { AboutFields, ChipGroup, GoalsField, PregnancyField, SmokingField, fieldClass, type AboutValue } from '../components/ProfileFields'

type ConsentKey = 'terms' | 'privacy' | 'health_data_processing' | 'ai_processing'
const REQUIRED: ConsentKey[] = ['terms', 'privacy', 'health_data_processing']
const ALL: ConsentKey[] = [...REQUIRED, 'ai_processing']
const STEPS = ['language', 'consent', 'about', 'pregnancy', 'health', 'family', 'goals', 'doctor', 'alerts', 'start'] as const
type Step = (typeof STEPS)[number]

const detectCountry = (): 'EG' | 'US' => (Intl.DateTimeFormat().resolvedOptions().timeZone.startsWith('America') ? 'US' : 'EG')

export function OnboardingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { session, profile, refreshProfile } = useAuth()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = todayIn(timeZone)

  const [stepIndex, setStepIndex] = useState(profile ? Math.max(2, profile.onboarding_step) : 0)
  const [profileId, setProfileId] = useState<string | null>(profile?.id ?? null)
  const [consents, setConsents] = useState<Record<ConsentKey, boolean>>({ terms: false, privacy: false, health_data_processing: false, ai_processing: false })
  const [individually, setIndividually] = useState(false)
  const [adult, setAdult] = useState(false)
  const [about, setAbout] = useState<AboutValue>({ display_name: '', date_of_birth: '', sex: '', country: detectCountry(), height_cm: '', weight_kg: '' })
  const [pregnancy, setPregnancy] = useState('')
  const [conditions, setConditions] = useState<string[]>([])
  const [noConditions, setNoConditions] = useState(false)
  const [allergies, setAllergies] = useState<string[]>([])
  const [noAllergies, setNoAllergies] = useState(false)
  const [smoking, setSmoking] = useState('')
  const [family, setFamily] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [doctor, setDoctor] = useState('')
  const [push, setPush] = useState<PushState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Resuming: load what was already saved.
  useEffect(() => {
    if (!profile) return
    void loadProfileDetails().then(({ profile: p, lists }) => {
      if (!p) return
      setAbout({
        display_name: p.display_name ?? '', date_of_birth: p.date_of_birth ?? '', sex: p.sex ?? '', country: p.country,
        height_cm: p.height_cm ? String(p.height_cm) : '', weight_kg: p.weight_kg ? String(p.weight_kg) : '',
      })
      setPregnancy(p.pregnancy_status ?? '')
      setSmoking(p.smoking_status ?? '')
      setNoConditions(p.no_known_conditions)
      setNoAllergies(p.no_known_allergies)
      setGoals(p.health_goals ?? [])
      setDoctor(p.physician_name ?? '')
      setConditions(lists.conditions)
      setAllergies(lists.allergies)
      setFamily(lists.family)
    })
  }, [profile])

  useEffect(() => {
    void pushState().then(setPush)
  }, [])

  const visibleSteps = useMemo(
    () => STEPS.filter((s) => s !== 'pregnancy' || askPregnancy(about.sex || null, about.date_of_birth || null, today)),
    [about.sex, about.date_of_birth, today],
  )
  const step: Step = STEPS[stepIndex]
  const position = visibleSteps.indexOf(step)

  function go(delta: 1 | -1) {
    let i = stepIndex + delta
    while (STEPS[i] && !visibleSteps.includes(STEPS[i])) i += delta
    setError(null)
    setStepIndex(Math.max(0, Math.min(STEPS.length - 1, i)))
    if (profileId && delta === 1) void saveProfileFields(profileId, { onboarding_step: i })
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
    const fields = { country: about.country, ui_language: lang, explanation_language: lang, time_zone: timeZone, onboarding_step: 2 }
    // Your own profile: reuse it if consent is given again (e.g. after going back), otherwise create it.
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
      country: about.country, height_cm: parseNumber(about.height_cm), weight_kg: parseNumber(about.weight_kg),
    })
  }

  async function saveHealth(): Promise<boolean> {
    if (!profileId) return false
    const ok = await saveConditions(profileId, noConditions ? [] : conditions) && await saveAllergies(profileId, noAllergies ? [] : allergies)
    return ok && saveProfileFields(profileId, { no_known_conditions: noConditions, no_known_allergies: noAllergies, smoking_status: smoking || null })
  }

  async function finish(next: string) {
    if (!profileId) return
    setSaving(true)
    await saveProfileFields(profileId, { onboarding_step: STEPS.length - 1, onboarding_completed_at: new Date().toISOString() })
    navigate(next, { replace: true })
    await refreshProfile()
  }

  // ---------------------------------------------------------------- layout
  const footer = (onNext: () => void, opts: { skippable?: boolean; nextLabel?: string } = {}) => (
    <div className="mt-8 flex flex-wrap items-center gap-3">
      {position > 0 && step !== 'about' && (
        <button type="button" onClick={() => go(-1)} className="min-h-12 rounded-xl border border-line bg-surface px-4 font-medium">{t('onboarding.back')}</button>
      )}
      <button type="button" disabled={saving} onClick={onNext} className="min-h-12 flex-1 rounded-xl bg-brand-700 px-4 font-medium text-white disabled:opacity-60">
        {saving ? t('onboarding.saving') : opts.nextLabel ?? t('onboarding.continue')}
      </button>
      {opts.skippable && <button type="button" onClick={() => go(1)} className="min-h-12 px-3 font-medium text-muted">{t('onboarding.skip')}</button>}
    </div>
  )
  const header = (title: string, intro?: string) => (
    <>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {intro && <p className="mt-2 text-sm text-muted">{intro}</p>}
    </>
  )

  return (
    <div className="min-h-dvh bg-canvas px-4 py-6">
      <main className="mx-auto w-full max-w-lg">
        <div className="mb-6" aria-hidden>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${((position + 1) / visibleSteps.length) * 100}%` }} />
          </div>
        </div>
        <p className="mb-2 text-xs font-medium text-brand-700">{t('onboarding.step', { n: position + 1, total: visibleSteps.length })}</p>

        {step === 'language' && (
          <>
            {header(t('onboarding.languageTitle'), 'Choose your language · اختر لغتك')}
            <div className="mt-6 grid gap-3">
              {(['en', 'ar'] as const).map((l) => (
                <button key={l} type="button" onClick={() => { setLanguage(l); go(1) }}
                  className={`flex min-h-16 items-center justify-between rounded-2xl border px-5 text-lg font-medium ${i18n.language === l ? 'border-brand-700 bg-brand-50' : 'border-line bg-surface'}`}>
                  {l === 'en' ? 'English' : 'العربية'}
                  {i18n.language === l && <Check className="size-5 text-brand-700" aria-hidden />}
                </button>
              ))}
            </div>
          </>
        )}

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
                  <div className="mt-1 flex justify-between">
                    <button type="button" onClick={() => go(-1)} className="min-h-11 text-sm text-muted">{t('onboarding.back')}</button>
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
            {header(t('onboarding.profileTitle'), t('onboarding.profileIntro'))}
            <div className="mt-6"><AboutFields value={about} onChange={setAbout} /></div>
            {error && <p role="alert" className="mt-3 text-sm text-status-urgent">{error}</p>}
            {footer(() => void run(saveAbout), { skippable: true })}
          </>
        )}

        {step === 'pregnancy' && (
          <>
            {header(t('onboarding.pregnancyTitle'), t('onboarding.pregnancyIntro'))}
            <div className="mt-6"><PregnancyField value={pregnancy} onChange={setPregnancy} /></div>
            {footer(() => void run(() => saveProfileFields(profileId!, { pregnancy_status: pregnancy || null })), { skippable: true })}
          </>
        )}

        {step === 'health' && (
          <>
            {header(t('onboarding.healthTitle'), t('onboarding.healthIntro'))}
            <h2 className="mb-2 mt-6 text-sm font-semibold">{t('profileFields.conditionsLabel')}</h2>
            <ChipGroup options={CONDITION_OPTIONS} i18nPrefix="profileFields.conditions" value={conditions} onChange={setConditions} none={noConditions} onNone={setNoConditions} />
            <h2 className="mb-2 mt-6 text-sm font-semibold">{t('profileFields.allergiesLabel')}</h2>
            <ChipGroup options={ALLERGY_OPTIONS} i18nPrefix="profileFields.allergies" value={allergies} onChange={setAllergies} none={noAllergies} onNone={setNoAllergies} />
            <h2 className="mb-2 mt-6 text-sm font-semibold">{t('profileFields.smokingLabel')}</h2>
            <SmokingField value={smoking} onChange={setSmoking} />
            {error && <p role="alert" className="mt-3 text-sm text-status-urgent">{error}</p>}
            {footer(() => void run(saveHealth), { skippable: true })}
          </>
        )}

        {step === 'family' && (
          <>
            {header(t('onboarding.familyTitle'), t('onboarding.familyIntro'))}
            <div className="mt-6"><ChipGroup options={FAMILY_OPTIONS} i18nPrefix="profileFields.family" value={family} onChange={setFamily} /></div>
            {footer(() => void run(() => saveFamilyHistory(profileId!, family)), { skippable: true })}
          </>
        )}

        {step === 'goals' && (
          <>
            {header(t('onboarding.goalsTitle'), t('onboarding.goalsIntro'))}
            <div className="mt-6"><GoalsField value={goals} onChange={setGoals} /></div>
            {footer(() => void run(() => saveProfileFields(profileId!, { health_goals: goals })), { skippable: true })}
          </>
        )}

        {step === 'doctor' && (
          <>
            {header(t('onboarding.doctorTitle'), t('onboarding.doctorIntro'))}
            <input className={`${fieldClass} mt-6`} value={doctor} maxLength={120} placeholder={t('onboarding.doctorPlaceholder')} onChange={(e) => setDoctor(e.target.value)} />
            {footer(() => void run(() => saveProfileFields(profileId!, { physician_name: doctor.trim() || null })), { skippable: true })}
          </>
        )}

        {step === 'alerts' && (
          <>
            {header(t('onboarding.alertsTitle'), t('onboarding.alertsIntro'))}
            <div className="mt-6 rounded-2xl border border-line bg-surface p-4 text-sm">
              <p className="flex items-center gap-2 font-medium"><Bell className="size-5 text-brand-700" aria-hidden /> {t('settings.push')}</p>
              <p className="mt-1 text-muted">{push ? t(`settings.pushState.${push}`) : t('auth.loading')}</p>
              {push === 'off' && session && (
                <button type="button" onClick={async () => setPush(await enablePush(session.user.id))} className="mt-3 min-h-11 rounded-xl bg-brand-700 px-4 font-medium text-white">{t('settings.enablePush')}</button>
              )}
            </div>
            {footer(() => go(1), { skippable: push !== 'on' })}
          </>
        )}

        {step === 'start' && (
          <>
            {header(t('onboarding.startTitle'), t('onboarding.startIntro'))}
            <div className="mt-6 grid gap-3">
              {[
                { to: '/records/scan', icon: Camera, label: t('onboarding.startScanReport'), hint: t('onboarding.startScanReportHint') },
                { to: '/medications/new', icon: Pill, label: t('onboarding.startAddMedicine'), hint: t('onboarding.startAddMedicineHint') },
                { to: '/records/scan', icon: FileText, label: t('onboarding.startScanPrescription'), hint: t('onboarding.startScanPrescriptionHint') },
              ].map((a) => (
                <button key={a.label} type="button" disabled={saving} onClick={() => void finish(a.to)}
                  className="flex min-h-16 items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-3 text-start disabled:opacity-60">
                  <a.icon className="size-6 shrink-0 text-brand-700" aria-hidden />
                  <span><span className="block font-medium">{a.label}</span><span className="block text-xs text-muted">{a.hint}</span></span>
                </button>
              ))}
            </div>
            <button type="button" disabled={saving} onClick={() => void finish('/')} className="mt-4 min-h-12 w-full rounded-xl px-4 font-medium text-muted">{t('onboarding.startLater')}</button>
          </>
        )}
      </main>
    </div>
  )
}
