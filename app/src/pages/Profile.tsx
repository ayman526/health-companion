import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { loadProfileDetails, saveAllergies, saveConditions, saveFamilyHistory, saveProfileFields } from '../lib/profile'
import { todayIn } from '../lib/medications'
import { ALLERGY_OPTIONS, CONDITION_OPTIONS, FAMILY_OPTIONS, ageOn, askPregnancy, bmi } from '../domain/profileOptions'
import { parseNumber } from '../domain/numbers'
import { AboutFields, ChipGroup, GoalsField, PregnancyField, SmokingField, fieldClass, type AboutValue } from '../components/ProfileFields'
import { PageHeader } from '../components/ui'
import { PregnancyCelebration } from '../components/PregnancyCelebration'
import { dueMonthOptions } from '../domain/pregnancy'
import { formatMonth } from '../lib/format'

function Section({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

export function ProfilePage() {
  const { t, i18n } = useTranslation()
  const { profile, refreshProfile } = useAuth()
  const today = todayIn(profile?.time_zone ?? 'Africa/Cairo')
  const [loaded, setLoaded] = useState(false)
  const [about, setAbout] = useState<AboutValue>({ display_name: '', date_of_birth: '', sex: '', country: 'EG', height_cm: '', weight_kg: '' })
  const [pregnancy, setPregnancy] = useState('')
  const [dueMonth, setDueMonth] = useState('')
  // What's saved, so the celebration only plays when it changes to pregnant.
  const [savedPregnancy, setSavedPregnancy] = useState('')
  const [celebrating, setCelebrating] = useState(false)
  const [conditions, setConditions] = useState<string[]>([])
  const [noConditions, setNoConditions] = useState(false)
  const [allergies, setAllergies] = useState<string[]>([])
  const [noAllergies, setNoAllergies] = useState(false)
  const [smoking, setSmoking] = useState('')
  const [family, setFamily] = useState<string[]>([])
  const [goals, setGoals] = useState<string[]>([])
  const [doctor, setDoctor] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'underage'>('idle')

  useEffect(() => {
    void loadProfileDetails().then(({ profile: p, lists }) => {
      if (p) {
        setAbout({
          display_name: p.display_name ?? '', date_of_birth: p.date_of_birth ?? '', sex: p.sex ?? '', country: p.country,
          height_cm: p.height_cm ? String(p.height_cm) : '', weight_kg: p.weight_kg ? String(p.weight_kg) : '',
        })
        setPregnancy(p.pregnancy_status ?? '')
        setSavedPregnancy(p.pregnancy_status ?? '')
        setDueMonth(p.due_month ?? '')
        setSmoking(p.smoking_status ?? '')
        setNoConditions(p.no_known_conditions)
        setNoAllergies(p.no_known_allergies)
        setGoals(p.health_goals ?? [])
        setDoctor(p.physician_name ?? '')
      }
      setConditions(lists.conditions)
      setAllergies(lists.allergies)
      setFamily(lists.family)
      setLoaded(true)
      // Arriving from a "tell us…" card (e.g. /profile#family): go to that question.
      const target = location.hash.slice(1)
      if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    })
  }, [])

  async function save() {
    if (!profile) return
    const age = ageOn(about.date_of_birth || null, today)
    if (age != null && age < 18) return setStatus('underage')
    setStatus('saving')
    const showPregnancy = askPregnancy(about.sex || null, about.date_of_birth || null, today)
    const ok = (await saveProfileFields(profile.id, {
      display_name: about.display_name.trim() || null, date_of_birth: about.date_of_birth || null, sex: about.sex || null,
      country: about.country, height_cm: parseNumber(about.height_cm), weight_kg: parseNumber(about.weight_kg),
      pregnancy_status: showPregnancy ? pregnancy || null : null,
      due_month: showPregnancy && pregnancy === 'pregnant' ? dueMonth || null : null, smoking_status: smoking || null,
      no_known_conditions: noConditions, no_known_allergies: noAllergies, health_goals: goals, physician_name: doctor.trim() || null,
    }))
      && (await saveConditions(profile.id, noConditions ? [] : conditions))
      && (await saveAllergies(profile.id, noAllergies ? [] : allergies))
      && (await saveFamilyHistory(profile.id, family))
    setStatus(ok ? 'saved' : 'error')
    if (ok) {
      setSavedPregnancy(showPregnancy ? pregnancy : '')
      await refreshProfile()
    }
  }

  function changePregnancy(value: string) {
    setPregnancy(value)
    if (value === 'pregnant' && savedPregnancy !== 'pregnant') setCelebrating(true)
  }

  // The celebration saves right away, so the due month isn't lost if the page is left.
  async function finishCelebration(due: string | null) {
    if (!profile) return false
    const ok = await saveProfileFields(profile.id, { pregnancy_status: 'pregnant', due_month: due })
    if (!ok) return false
    setSavedPregnancy('pregnant')
    setDueMonth(due ?? '')
    setCelebrating(false)
    return true
  }

  const dueOptions = dueMonthOptions(today)
  if (dueMonth && !dueOptions.includes(dueMonth)) dueOptions.unshift(dueMonth)

  const index = bmi(parseNumber(about.height_cm), parseNumber(about.weight_kg))

  if (!loaded) return <p className="text-sm text-muted">{t('auth.loading')}</p>
  return (
    <>
      <PageHeader title={profile && profile.relationship !== 'self' ? t('family.profileOf', { name: profile.display_name || t(`family.relationships.${profile.relationship}`) }) : t('profile.title')} subtitle={t('profile.subtitle')} />
      <div className="flex flex-col gap-4">
        <Section title={t('onboarding.profileTitle')}>
          <AboutFields value={about} onChange={setAbout} />
          {index != null && <p className="mt-3 text-sm">{t('profile.bmi')}: <span className="ltr-value sensitive font-semibold">{index}</span></p>}
        </Section>
        {askPregnancy(about.sex || null, about.date_of_birth || null, today) && (
          <Section id="pregnancy" title={t('onboarding.pregnancyTitle')} hint={t('onboarding.pregnancyIntro')}>
            <PregnancyField value={pregnancy} onChange={changePregnancy} />
            {pregnancy === 'pregnant' && (
              <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
                {t('pregnancy.dueMonth')}
                <select className={fieldClass} value={dueMonth} onChange={(e) => setDueMonth(e.target.value)}>
                  <option value="">{t('pregnancy.dueNotSure')}</option>
                  {dueOptions.map((m) => <option key={m} value={m}>{formatMonth(m, i18n.language)}</option>)}
                </select>
              </label>
            )}
          </Section>
        )}
        <Section id="health" title={t('profileFields.conditionsLabel')}>
          <ChipGroup options={CONDITION_OPTIONS} i18nPrefix="profileFields.conditions" value={conditions} onChange={setConditions} none={noConditions} onNone={setNoConditions} />
        </Section>
        <Section title={t('profileFields.allergiesLabel')}>
          <ChipGroup options={ALLERGY_OPTIONS} i18nPrefix="profileFields.allergies" value={allergies} onChange={setAllergies} none={noAllergies} onNone={setNoAllergies} />
        </Section>
        <Section title={t('profileFields.smokingLabel')}>
          <SmokingField value={smoking} onChange={setSmoking} />
        </Section>
        <Section id="family" title={t('onboarding.familyTitle')} hint={t('onboarding.familyIntro')}>
          <ChipGroup options={FAMILY_OPTIONS} i18nPrefix="profileFields.family" value={family} onChange={setFamily} />
        </Section>
        <Section title={t('onboarding.goalsTitle')}>
          <GoalsField value={goals} onChange={setGoals} />
        </Section>
        <Section id="doctor" title={t('onboarding.doctorTitle')}>
          <input className={fieldClass} value={doctor} maxLength={120} placeholder={t('onboarding.doctorPlaceholder')} onChange={(e) => setDoctor(e.target.value)} />
        </Section>
        <p className="text-xs text-muted">{t('profile.fromDocuments')}</p>
        <div className="sticky bottom-20 flex flex-col gap-2 rounded-2xl bg-canvas/95 py-2 backdrop-blur">
          <button type="button" disabled={status === 'saving'} onClick={() => void save()} className="min-h-12 rounded-xl bg-brand-700 font-medium text-white disabled:opacity-60">
            {status === 'saving' ? t('onboarding.saving') : t('profile.save')}
          </button>
          {status === 'saved' && <p role="status" className="text-center text-sm text-status-ok">{t('settings.saved')}</p>}
          {status === 'error' && <p role="alert" className="text-center text-sm text-status-urgent">{t('review.saveError')}</p>}
          {status === 'underage' && <p role="alert" className="text-center text-sm text-status-urgent">{t('onboarding.mustBeAdult')}</p>}
        </div>
      </div>
      {celebrating && (
        <PregnancyCelebration
          today={today}
          name={profile && profile.relationship !== 'self' ? profile.display_name ?? undefined : undefined}
          onDone={finishCelebration}
        />
      )}
    </>
  )
}
