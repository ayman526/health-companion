import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { currentSchedule, loadMedications, todayIn, zonedDateTime, type MedicationRow } from '../lib/medications'
import { addDays, schedulePayload, validateSchedule, type ScheduleForm } from '../domain/medications'
import { PageHeader } from '../components/ui'
import { MedicineNameInput } from '../components/MedicineNameInput'
import { SuggestInput } from '../components/SuggestInput'
import { normalizeNumberInput } from '../domain/numbers'
import { usesFor } from '../domain/medicineInfo'
import { formatDate } from '../lib/format'

export interface MedicationPrefill {
  med: { brand_name: string; active_ingredient: string; strength: string; formulation: string; route: string; prescriber: string; instructions: string }
  schedule: ScheduleForm
  check: string[]
  documentId: string | null
  directions: string
  extractionIndex?: number
}

const FORMULATIONS = ['', 'tablet', 'capsule', 'syrup', 'suspension', 'drops', 'injection', 'cream', 'ointment', 'inhaler', 'sachet', 'suppository', 'patch', 'spray', 'other']
const inputClass = 'min-h-11 w-full rounded-lg border bg-surface px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

function emptySchedule(start: string): ScheduleForm {
  return { dose_amount: '', dose_unit: '', frequency: 'daily', every_n_days: '', days_of_week: [], times_of_day: ['09:00'], valid_from: start, valid_to: '', supply_ends_on: '', reminders_enabled: true }
}

/** Add a medication (manually or from a prescription), or change the dose of an existing one. */
export function MedicationFormPage() {
  const { medicationId } = useParams()
  const changing = !!medicationId
  const { state } = useLocation() as { state: MedicationPrefill | null }
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const today = todayIn(tz)

  const [med, setMed] = useState(state?.med ?? { brand_name: '', active_ingredient: '', strength: '', formulation: '', route: '', prescriber: '', instructions: '' })
  const [form, setForm] = useState<ScheduleForm>(state?.schedule ?? emptySchedule(today))
  const [check] = useState<Set<string>>(new Set(state?.check ?? []))
  const [existing, setExisting] = useState<MedicationRow | null>(null)
  const [own, setOwn] = useState<{ name: string; generic: string }[]>([])
  const [doctors, setDoctors] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (changing) return
    void loadMedications().then((list) => {
      setOwn(list.map((m) => ({ name: m.brand_name, generic: m.active_ingredient ?? '' })))
      // Doctors the user named before, most recent first.
      setDoctors([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((m) => m.prescriber ?? '').filter(Boolean))
    })
    if (supabase) void supabase.from('health_profiles').select('physician_name').eq('id', profile?.id ?? '').maybeSingle()
      .then(({ data }) => data?.physician_name && setDoctors((d) => [...d, data.physician_name!]))
  }, [changing])

  useEffect(() => {
    if (!changing) return
    void loadMedications().then((list) => {
      const m = list.find((x) => x.id === medicationId) ?? null
      setExisting(m)
      const s = m && currentSchedule(m)
      if (s) {
        setForm({
          dose_amount: s.dose_amount == null ? '' : String(s.dose_amount), dose_unit: s.dose_unit ?? '', frequency: s.frequency,
          every_n_days: s.every_n_days ? String(s.every_n_days) : '', days_of_week: s.days_of_week ?? [], times_of_day: s.times_of_day.map((x) => x.slice(0, 5)),
          valid_from: today, valid_to: '', supply_ends_on: s.supply_ends_on ?? '', reminders_enabled: s.reminders_enabled,
        })
      }
    })
  }, [changing, medicationId, today])

  const problems = [...validateSchedule(form), ...(!changing && !med.brand_name.trim() ? ['brand_name'] : [])]
  const highlight = (field: string) => `${inputClass} ${check.has(field) && !confirmed ? 'border-status-watch bg-status-watch-bg' : 'border-line'}`
  const set = (patch: Partial<ScheduleForm>) => setForm((f) => ({ ...f, ...patch }))

  async function save() {
    if (!supabase || !profile || problems.length || !confirmed) return
    setSaving(true)
    setError(false)
    const payload = schedulePayload(form, tz)
    let medId = medicationId ?? null
    if (changing) {
      const { error: e } = await supabase.rpc('change_regimen', { p_medication_id: medicationId, p_schedule: payload, p_effective: form.valid_from })
      if (e) return (setSaving(false), setError(true))
    } else {
      const { data, error: e } = await supabase.rpc('save_medication', {
        p_profile_id: profile.id, p_med: med, p_schedule: payload, p_valid_from: form.valid_from, p_document_id: state?.documentId ?? null,
      })
      if (e) return (setSaving(false), setError(true))
      medId = data as string
    }
    // Renewal reminder 3 days before the supply runs out (the user entered that date).
    if (form.supply_ends_on) {
      const due = zonedDateTime(addDays(form.supply_ends_on, -3), '10:00', tz)
      await supabase.from('reminders').insert({
        profile_id: profile.id, kind: 'prescription_renewal', status: 'active',
        title: t('meds.renewalTitle', { name: changing ? existing?.brand_name : med.brand_name }),
        due_at: due, time_zone: tz, next_fire_at: due, repeat_rule: 'none',
      })
    }
    setSaving(false)
    if (state?.documentId) navigate(`/records/documents/${state.documentId}`, { replace: true, state: { added: state.extractionIndex } })
    else navigate(`/medications/${medId}`, { replace: true })
  }

  const field = (key: keyof typeof med, label: string, opts: { dir?: 'ltr' } = {}) => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input dir={opts.dir} className={highlight(key === 'brand_name' ? 'name_as_written' : key)} value={med[key]} onChange={(e) => setMed({ ...med, [key]: e.target.value })} />
    </label>
  )

  return (
    <>
      <PageHeader title={changing ? t('meds.changeTitle', { name: existing?.brand_name ?? '' }) : t('meds.addTitle')} subtitle={changing ? t('meds.changeSubtitle') : t('meds.addSubtitle')} />

      {state?.directions && (
        <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
          <span className="text-muted">{t('meds.asWritten')}: </span><span className="font-medium">{state.directions}</span>
        </p>
      )}
      {check.size > 0 && !confirmed && (
        <p className="mb-4 flex gap-2 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">
          <AlertTriangle className="size-5 shrink-0" aria-hidden /> {t('meds.checkHighlighted')}
        </p>
      )}

      {!changing && (
        <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
          <MedicineNameInput
            label={`${t('meds.name')} *`}
            className={highlight('name_as_written')}
            value={med.brand_name}
            own={own}
            onChange={(brand_name) => setMed({ ...med, brand_name })}
            // Picking fills the name and, if empty, the active ingredient. Never a dose.
            onPick={(sug) => setMed({ ...med, brand_name: sug.name, active_ingredient: med.active_ingredient || sug.generic || sug.name })}
          />
          {usesFor(med.brand_name, med.active_ingredient, i18n.language) && (
            <p className="text-xs text-muted sm:col-span-2">
              <span className="font-medium">{t('meds.uses.title')}: </span>{usesFor(med.brand_name, med.active_ingredient, i18n.language)}
            </p>
          )}
          {field('strength', t('meds.strength'), { dir: 'ltr' })}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('meds.formulation')}
            <select className={`${inputClass} border-line`} value={med.formulation} onChange={(e) => setMed({ ...med, formulation: e.target.value })}>
              {FORMULATIONS.map((f) => <option key={f} value={f}>{f ? t(`meds.forms.${f}`) : '—'}</option>)}
            </select>
          </label>
          {field('active_ingredient', t('meds.ingredient'))}
          <SuggestInput
            label={t('meds.prescriber')}
            className={`${inputClass} border-line`}
            value={med.prescriber}
            options={doctors}
            placeholder={doctors.length ? t('meds.prescriberHint') : undefined}
            onChange={(prescriber) => setMed({ ...med, prescriber })}
          />
          {field('instructions', t('meds.instructions'))}
        </section>
      )}

      <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('meds.doseAmount')} *
            <input dir="ltr" inputMode="decimal" className={highlight('dose_amount')} value={form.dose_amount} onChange={(e) => set({ dose_amount: normalizeNumberInput(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('meds.doseUnit')}
            <input className={`${inputClass} border-line`} placeholder={t('meds.doseUnitHint')} value={form.dose_unit} onChange={(e) => set({ dose_unit: e.target.value })} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('meds.frequency')}
          <select className={highlight('times_per_day')} value={form.frequency} onChange={(e) => {
            const frequency = e.target.value as ScheduleForm['frequency']
            set({ frequency, times_of_day: frequency === 'as_needed' ? [] : form.times_of_day.length ? form.times_of_day : ['09:00'], reminders_enabled: frequency !== 'as_needed' })
          }}>
            {(['daily', 'weekly', 'every_n_days', 'as_needed'] as const).map((f) => <option key={f} value={f}>{t(`meds.freq.${f}`)}</option>)}
          </select>
        </label>
        {form.frequency === 'every_n_days' && (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('meds.everyNDays')}
            <input dir="ltr" inputMode="numeric" className={highlight('every_n_days')} value={form.every_n_days} onChange={(e) => set({ every_n_days: normalizeNumberInput(e.target.value) })} />
          </label>
        )}
        {form.frequency === 'weekly' && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">{t('meds.daysOfWeek')}</legend>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                const on = form.days_of_week.includes(d)
                return (
                  <button key={d} type="button" aria-pressed={on} onClick={() => set({ days_of_week: on ? form.days_of_week.filter((x) => x !== d) : [...form.days_of_week, d] })}
                    className={`min-h-11 min-w-11 rounded-full border px-3 text-sm ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-surface'}`}>
                    {new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d)))}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )}
        {form.frequency !== 'as_needed' && (
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-muted">{t('meds.times')} *</legend>
            <div className="flex flex-wrap items-center gap-2">
              {form.times_of_day.map((time, i) => (
                <span key={i} className="flex items-center gap-1">
                  <input type="time" dir="ltr" className={`${highlight('times_of_day')} w-32`} value={time}
                    onChange={(e) => set({ times_of_day: form.times_of_day.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {form.times_of_day.length > 1 && (
                    <button type="button" aria-label={t('meds.removeTime')} onClick={() => set({ times_of_day: form.times_of_day.filter((_, j) => j !== i) })} className="grid min-h-11 min-w-11 place-items-center text-muted">
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </span>
              ))}
              {form.times_of_day.length < 6 && (
                <button type="button" onClick={() => set({ times_of_day: [...form.times_of_day, '12:00'] })} className="flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700">
                  <Plus className="size-4" aria-hidden /> {t('meds.addTime')}
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">{t('meds.timesHint', { tz })}</p>
          </fieldset>
        )}
        {changing && existing && currentSchedule(existing) && (
          <p className="text-xs text-muted">{t('meds.correctHint', { date: formatDate(currentSchedule(existing)!.valid_from, i18n.language) })}</p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {changing ? t('meds.effectiveFrom') : t('meds.startDate')} *
            <input type="date" dir="ltr" className={`${inputClass} border-line`} value={form.valid_from} onChange={(e) => set({ valid_from: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('meds.endDate')}
            <input type="date" dir="ltr" className={highlight('duration_days')} value={form.valid_to} onChange={(e) => set({ valid_to: e.target.value })} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('meds.supplyEnds')}
          <input type="date" dir="ltr" className={`${inputClass} border-line`} value={form.supply_ends_on} onChange={(e) => set({ supply_ends_on: e.target.value })} />
          <span className="font-normal">{t('meds.supplyHint')}</span>
        </label>
        {form.frequency !== 'as_needed' && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-brand-700" checked={form.reminders_enabled} onChange={(e) => set({ reminders_enabled: e.target.checked })} />
            {t('meds.remindMe')}
          </label>
        )}
      </section>

      <label className="mb-4 flex items-start gap-2 rounded-2xl border border-line bg-surface p-4 text-sm font-medium">
        <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {t('meds.confirmChecked')}
      </label>
      <p className="mb-4 text-xs text-muted">{t('meds.neverInfer')}</p>
      {error && <p role="alert" className="mb-4 text-sm text-status-urgent">{t('review.saveError')}</p>}

      <div className="flex gap-3">
        <button type="button" onClick={() => navigate(-1)} className="min-h-12 flex-1 rounded-xl border border-line bg-surface font-medium">{t('report.cancel')}</button>
        <button type="button" disabled={saving || problems.length > 0 || !confirmed} onClick={() => void save()} className="min-h-12 flex-[2] rounded-xl bg-brand-700 font-medium text-white disabled:opacity-50">
          {saving ? t('onboarding.saving') : t('meds.save')}
        </button>
      </div>
    </>
  )
}
