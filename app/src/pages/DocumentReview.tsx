import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, CheckCircle2, ExternalLink, Pill, Stethoscope, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { formatDate } from '../lib/format'
import { todayIn, zonedDateTime } from '../lib/medications'
import { deleteDocument } from '../lib/documents'
import { proposeSchedule, type ExtractedMedication } from '../domain/medications'
import type { MedicationPrefill } from './MedicationForm'
import { PageHeader } from '../components/ui'

interface Extracted {
  document_type?: string
  prescription?: { prescriber?: string; prescribed_on?: string }
  medications?: ExtractedMedication[]
  follow_ups?: { instruction_as_written: string; due_date?: string | null; tests_mentioned?: string[] }[]
  diagnoses?: { diagnosis_as_written: string }[]
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

/** Review of a prescription, doctor report or discharge summary: add medicines, follow-ups and diagnoses. */
export function DocumentReviewPage() {
  const { documentId } = useParams()
  const { state } = useLocation() as { state: { added?: number } | null }
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const navigate = useNavigate()
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'

  const [loading, setLoading] = useState(true)
  const [doc, setDoc] = useState<{ status: string; document_type: string | null; title: string | null; url: string | null } | null>(null)
  const [data, setData] = useState<Extracted>({})
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set())
  const [doneFollowUps, setDoneFollowUps] = useState<Set<number>>(new Set())
  const [doneDiagnoses, setDoneDiagnoses] = useState<Set<number>>(new Set())
  const [dates, setDates] = useState<Record<number, string>>({})
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!supabase || !documentId) return
    void (async () => {
      const { data: d } = await supabase.from('medical_documents').select('status, document_type, title, storage_path').eq('id', documentId).maybeSingle()
      if (!d) return setLoading(false)
      const { data: signed } = await supabase.storage.from('medical-documents').createSignedUrl(d.storage_path, 600)
      setDoc({ status: d.status, document_type: d.document_type, title: d.title, url: signed?.signedUrl ?? null })
      const { data: ext } = await supabase.from('document_extractions').select('structured').eq('document_id', documentId).order('created_at', { ascending: false }).limit(1).maybeSingle()
      const structured = (ext?.structured ?? {}) as Extracted
      setData(structured)
      setDates(Object.fromEntries((structured.follow_ups ?? []).map((f, i) => [i, f.due_date && ISO.test(f.due_date) ? f.due_date : ''])))
      const { data: meds } = await supabase.from('medications').select('brand_name').eq('document_id', documentId)
      setAddedNames(new Set((meds ?? []).map((m) => m.brand_name.trim().toLowerCase())))
      const { data: plans } = await supabase.from('follow_up_plans').select('description').eq('document_id', documentId)
      setDoneFollowUps(new Set((structured.follow_ups ?? []).map((f, i) => ((plans ?? []).some((p) => p.description === f.instruction_as_written) ? i : -1)).filter((i) => i >= 0)))
      setLoading(false)
    })()
  }, [documentId, state])

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (!doc) return <p className="text-muted">{t('review.notFound')}</p>

  const meds = data.medications ?? []
  const nameOf = (m: ExtractedMedication) => (m.name_as_written ?? m.name_as_printed ?? '').trim()
  const startDate = data.prescription?.prescribed_on && ISO.test(data.prescription.prescribed_on) ? data.prescription.prescribed_on : todayIn(tz)

  function addMedication(m: ExtractedMedication, index: number) {
    const { form, check } = proposeSchedule(m, startDate)
    const prefill: MedicationPrefill = {
      med: {
        brand_name: nameOf(m), active_ingredient: m.active_ingredient ?? '', strength: m.strength ?? '',
        formulation: m.formulation ?? '', route: m.route ?? '', prescriber: data.prescription?.prescriber ?? '',
        instructions: m.timing ? t(`meds.timing.${m.timing}`) : '',
      },
      schedule: form,
      check,
      documentId: documentId!,
      directions: m.directions_as_written ?? [m.dose, m.frequency].filter(Boolean).join(' '),
      extractionIndex: index,
    }
    navigate('/medications/new', { state: prefill })
  }

  async function addFollowUp(index: number) {
    if (!supabase || !profile || !dates[index]) return
    const f = data.follow_ups![index]
    const { data: plan, error: e1 } = await supabase.from('follow_up_plans').insert({
      profile_id: profile.id, document_id: documentId, status: 'confirmed', source: 'document_extraction',
      is_clinician_instruction: true, description: f.instruction_as_written, due_date: dates[index], test_codes: [],
    }).select('id').single()
    if (e1) return setError(true)
    const due = zonedDateTime(dates[index], '09:00', tz)
    const { error: e2 } = await supabase.from('reminders').insert({
      profile_id: profile.id, kind: 'follow_up', status: 'active', title: f.instruction_as_written.slice(0, 200),
      follow_up_id: plan.id, due_at: due, next_fire_at: due, time_zone: tz, repeat_rule: 'none',
    })
    if (e2) return setError(true)
    setDoneFollowUps((s) => new Set(s).add(index))
  }

  async function addDiagnosis(index: number) {
    if (!supabase || !profile) return
    const { error: e } = await supabase.from('medical_conditions').insert({
      profile_id: profile.id, document_id: documentId, status: 'confirmed', source: 'document_extraction',
      name: data.diagnoses![index].diagnosis_as_written,
    })
    if (e) return setError(true)
    setDoneDiagnoses((s) => new Set(s).add(index))
  }

  async function remove() {
    if (!window.confirm(t('docReview.deleteConfirm'))) return
    if (await deleteDocument(documentId!)) navigate('/medications', { replace: true })
    else setError(true)
  }

  async function finish() {
    if (!supabase) return
    const { error: e } = await supabase.from('medical_documents').update({ status: 'confirmed' }).eq('id', documentId)
    if (e) return setError(true)
    navigate('/medications', { replace: true })
  }

  return (
    <>
      <PageHeader title={t('docReview.title')} subtitle={t('docReview.subtitle')} />
      {doc.url && (
        <a href={doc.url} target="_blank" rel="noreferrer" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
          <ExternalLink className="size-4" aria-hidden /> {t('review.openOriginal')}
        </a>
      )}
      {(data.prescription?.prescriber || data.prescription?.prescribed_on) && (
        <p className="mb-4 text-sm text-muted">
          {data.prescription?.prescriber && t('meds.prescribedBy', { name: data.prescription.prescriber })}
          {data.prescription?.prescribed_on && ISO.test(data.prescription.prescribed_on) && ` · ${formatDate(data.prescription.prescribed_on, lang)}`}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><Pill className="size-4" aria-hidden /> {t('docReview.medicines', { count: meds.length })}</h2>
        {meds.length === 0 ? <p className="text-sm text-muted">{t('docReview.noMedicines')}</p> : (
          <ul className="flex flex-col gap-2">
            {meds.map((m, i) => {
              const added = addedNames.has(nameOf(m).toLowerCase()) || state?.added === i
              return (
                <li key={i} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="font-medium">{nameOf(m)} {m.strength && <span className="ltr-value text-sm font-normal text-muted">{m.strength}</span>}</p>
                  {(m.directions_as_written || m.dose || m.frequency) && (
                    <p className="mt-1 text-sm"><span className="text-muted">{t('meds.asWritten')}: </span>{m.directions_as_written ?? [m.dose, m.frequency].filter(Boolean).join(' ')}</p>
                  )}
                  {(m.uncertain_fields ?? []).length > 0 && <p className="mt-1 text-xs text-status-watch">{t('docReview.unclear')}</p>}
                  {added ? (
                    <p className="mt-3 flex items-center gap-2 text-sm font-medium text-status-ok"><CheckCircle2 className="size-4" aria-hidden /> {t('docReview.added')}</p>
                  ) : (
                    <button type="button" onClick={() => addMedication(m, i)} className="mt-3 min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('docReview.addMedicine')}</button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {(data.follow_ups ?? []).length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><CalendarPlus className="size-4" aria-hidden /> {t('docReview.followUps')}</h2>
          <ul className="flex flex-col gap-2">
            {data.follow_ups!.map((f, i) => (
              <li key={i} className="rounded-2xl border border-line bg-surface p-4 text-sm">
                <p>{f.instruction_as_written}</p>
                {doneFollowUps.has(i) ? (
                  <p className="mt-3 flex items-center gap-2 font-medium text-status-ok"><CheckCircle2 className="size-4" aria-hidden /> {t('docReview.reminderCreated')}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                      {t('docReview.followUpDate')}
                      <input type="date" dir="ltr" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm" value={dates[i] ?? ''} onChange={(e) => setDates({ ...dates, [i]: e.target.value })} />
                    </label>
                    <button type="button" disabled={!dates[i]} onClick={() => void addFollowUp(i)} className="min-h-11 rounded-xl bg-brand-700 px-4 font-medium text-white disabled:opacity-50">{t('docReview.createReminder')}</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('docReview.followUpNote')}</p>
        </section>
      )}

      {(data.diagnoses ?? []).length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted"><Stethoscope className="size-4" aria-hidden /> {t('docReview.diagnoses')}</h2>
          <ul className="flex flex-col gap-2">
            {data.diagnoses!.map((d, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4 text-sm">
                <span>{d.diagnosis_as_written}</span>
                {doneDiagnoses.has(i) ? (
                  <span className="flex items-center gap-1 font-medium text-status-ok"><CheckCircle2 className="size-4" aria-hidden /> {t('docReview.saved')}</span>
                ) : (
                  <button type="button" onClick={() => void addDiagnosis(i)} className="min-h-11 rounded-xl border border-line px-3 font-medium">{t('docReview.saveCondition')}</button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="mb-4 text-sm text-status-urgent">{t('review.saveError')}</p>}
      {doc.status !== 'confirmed' ? (
        <button type="button" onClick={() => void finish()} className="min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white">{t('docReview.done')}</button>
      ) : (
        <Link to="/medications" className="inline-block text-sm font-medium text-brand-700">{t('docReview.backToMeds')}</Link>
      )}
      <button type="button" onClick={() => void remove()} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-status-urgent">
        <Trash2 className="size-4" aria-hidden /> {t('docReview.delete')}
      </button>
      <p className="text-xs text-muted">{t('docReview.deleteNote')}</p>
    </>
  )
}
