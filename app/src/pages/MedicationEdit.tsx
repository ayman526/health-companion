import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { loadMedications } from '../lib/medications'
import { MedicineNameInput } from '../components/MedicineNameInput'
import { SuggestInput } from '../components/SuggestInput'
import { usesFor } from '../domain/medicineInfo'
import { PageHeader } from '../components/ui'

const FORMULATIONS = ['', 'tablet', 'capsule', 'syrup', 'suspension', 'drops', 'injection', 'cream', 'ointment', 'inhaler', 'sachet', 'suppository', 'patch', 'spray', 'other']
const inputClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

type Details = { brand_name: string; active_ingredient: string; strength: string; formulation: string; route: string; prescriber: string; instructions: string }

/** Corrects a medicine's details (name, strength, doctor…). Dose and times are changed separately, keeping history. */
export function MedicationEditPage() {
  const { medicationId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [med, setMed] = useState<Details | null>(null)
  const [own, setOwn] = useState<{ name: string; generic: string }[]>([])
  const [doctors, setDoctors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    void loadMedications().then((list) => {
      const m = list.find((x) => x.id === medicationId)
      if (m) {
        setMed({
          brand_name: m.brand_name, active_ingredient: m.active_ingredient ?? '', strength: m.strength ?? '', formulation: m.formulation ?? '',
          route: m.route ?? '', prescriber: m.prescriber ?? '', instructions: m.instructions ?? '',
        })
      }
      setOwn(list.filter((x) => x.id !== medicationId).map((x) => ({ name: x.brand_name, generic: x.active_ingredient ?? '' })))
      setDoctors([...list].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((x) => x.prescriber ?? '').filter(Boolean))
    })
  }, [medicationId])

  if (!med) return <p role="status" className="text-muted">{t('auth.loading')}</p>

  async function save() {
    if (!supabase || !med || !med.brand_name.trim()) return
    setSaving(true)
    setError(false)
    const blankToNull = (v: string) => v.trim() || null
    const { error: e } = await supabase.from('medications').update({
      brand_name: med.brand_name.trim(), active_ingredient: blankToNull(med.active_ingredient), strength: blankToNull(med.strength),
      formulation: blankToNull(med.formulation), route: blankToNull(med.route), prescriber: blankToNull(med.prescriber),
      instructions: blankToNull(med.instructions),
    }).eq('id', medicationId)
    setSaving(false)
    if (e) return setError(true)
    navigate(`/medications/${medicationId}`, { replace: true })
  }

  const text = (key: keyof Details, label: string, dir?: 'ltr') => (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <input dir={dir} className={inputClass} value={med[key]} onChange={(e) => setMed({ ...med, [key]: e.target.value })} />
    </label>
  )
  const uses = usesFor(med.brand_name, med.active_ingredient, i18n.language)

  return (
    <>
      <PageHeader title={t('meds.editTitle')} subtitle={t('meds.editSubtitle')} />
      <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
        <MedicineNameInput
          label={`${t('meds.name')} *`}
          className={inputClass}
          value={med.brand_name}
          own={own}
          onChange={(brand_name) => setMed({ ...med, brand_name })}
          onPick={(sug) => setMed({ ...med, brand_name: sug.name, active_ingredient: med.active_ingredient || sug.generic || sug.name })}
        />
        {text('strength', t('meds.strength'), 'ltr')}
        {uses && <p className="text-xs text-muted sm:col-span-2"><span className="font-medium">{t('meds.uses.title')}: </span>{uses}</p>}
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          {t('meds.formulation')}
          <select className={inputClass} value={med.formulation} onChange={(e) => setMed({ ...med, formulation: e.target.value })}>
            {FORMULATIONS.map((f) => <option key={f} value={f}>{f ? t(`meds.forms.${f}`) : '—'}</option>)}
          </select>
        </label>
        {text('active_ingredient', t('meds.ingredient'))}
        <SuggestInput label={t('meds.prescriber')} className={inputClass} value={med.prescriber} options={doctors}
          placeholder={doctors.length ? t('meds.prescriberHint') : undefined} onChange={(prescriber) => setMed({ ...med, prescriber })} />
        {text('instructions', t('meds.instructions'))}
      </section>
      <p className="mb-4 text-xs text-muted">{t('meds.editNote')}</p>
      {error && <p role="alert" className="mb-4 text-sm text-status-urgent">{t('review.saveError')}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={() => navigate(-1)} className="min-h-12 flex-1 rounded-xl border border-line bg-surface font-medium">{t('report.cancel')}</button>
        <button type="button" disabled={saving || !med.brand_name.trim()} onClick={() => void save()} className="min-h-12 flex-[2] rounded-xl bg-brand-700 font-medium text-white disabled:opacity-50">
          {saving ? t('onboarding.saving') : t('meds.saveChanges')}
        </button>
      </div>
    </>
  )
}
