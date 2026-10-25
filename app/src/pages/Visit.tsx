import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardList, FlaskConical, Pill, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { deleteVisit, finishFollowup, loadVisit, type Visit } from '../lib/visits'
import { loadMedications, type MedicationRow } from '../lib/medications'
import { formatDate } from '../lib/format'
import { localTime } from '../lib/medications'
import { track } from '../lib/usage'
import { PageHeader } from '../components/ui'

/**
 * One doctor visit. Before it: what to prepare. After it: "What did the doctor
 * change?" - go through current medicines (no change / changed / stopped),
 * add new ones or tests, note anything else.
 */
export function VisitPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { visitId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const [visit, setVisit] = useState<Visit | null | undefined>(undefined)
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [unchanged, setUnchanged] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!visitId) return
    void loadVisit(visitId).then((v) => {
      setVisit(v)
      setNotes(v?.notes ?? '')
      if (v && v.starts_at > new Date().toISOString()) track('visit_prep_opened')
    })
    void loadMedications().then((list) => setMeds(list.filter((m) => m.is_active)))
  }, [visitId])

  if (visit === undefined) return <p className="text-sm text-muted">{t('auth.loading')}</p>
  if (!visit) return <p className="text-sm text-muted">{t('review.notFound')}</p>

  const before = visit.starts_at > new Date().toISOString()
  const done = !!visit.followup_done_at || saved
  const newMedState = { med: { brand_name: '', active_ingredient: '', strength: '', formulation: '', route: '', prescriber: visit.clinician ?? '', instructions: '' } }

  return (
    <>
      <PageHeader title={visit.title} subtitle={`${formatDate(visit.starts_at, lang, tz)} · ${localTime(visit.starts_at, tz, lang)}${visit.clinician ? ` · ${visit.clinician}` : ''}${visit.location ? ` · ${visit.location}` : ''}`} sensitive />

      {before ? (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{t('visits.prepTitle')}</h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {(['summary', 'questions', 'medicines', 'reports'] as const).map((k) => (
              <li key={k} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />{t(`visits.prep.${k}`)}</li>
            ))}
          </ul>
          <Link to="/summary" className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-4 font-medium text-white">
            <ClipboardList className="size-5" aria-hidden /> {t('visits.openSummary')}
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">{t('visits.followupTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('visits.followupIntro')}</p>

          <h3 className="mb-2 mt-4 text-sm font-semibold">{t('visits.medsTitle')}</h3>
          {meds.length === 0 ? <p className="text-sm text-muted">{t('visits.noMeds')}</p> : (
            <ul className="flex flex-col divide-y divide-line">
              {meds.map((m) => (
                <li key={m.id} className="py-2">
                  <p className="flex items-center gap-2">
                    <Pill className="size-4 shrink-0 text-brand-700" aria-hidden />
                    <span className="sensitive min-w-0 flex-1 truncate text-sm font-medium">{m.brand_name}{m.strength ? ` ${m.strength}` : ''}</span>
                  </p>
                  <span className="ms-6 mt-1.5 flex flex-wrap gap-1.5">
                    <button type="button" aria-pressed={unchanged.has(m.id)} onClick={() => setUnchanged(new Set(unchanged).add(m.id))}
                      className={`min-h-9 rounded-full border px-3 text-xs font-medium ${unchanged.has(m.id) ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>{t('visits.noChange')}</button>
                    <Link to={`/medications/${m.id}/change`} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-medium">{t('visits.changed')}</Link>
                    <Link to={`/medications/${m.id}`} className="inline-flex min-h-9 items-center rounded-full border border-line px-3 text-xs font-medium">{t('visits.stopped')}</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/medications/new" state={newMedState} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium">
              <Plus className="size-4" aria-hidden /> {t('visits.newMedicine')}
            </Link>
            <Link to="/reminders" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium">
              <FlaskConical className="size-4" aria-hidden /> {t('visits.newTest')}
            </Link>
            <Link to="/visits" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3 text-sm font-medium">
              <Plus className="size-4" aria-hidden /> {t('visits.nextVisit')}
            </Link>
          </div>

          <label className="mt-4 flex flex-col gap-1 text-sm font-medium">{t('visits.notes')}
            <textarea className="sensitive min-h-24 rounded-xl border border-line bg-surface p-3 font-normal" maxLength={2000} placeholder={t('visits.notesPlaceholder')}
              value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          {done ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-status-ok"><Check className="size-4" aria-hidden /> {t('visits.followupDone')}</p>
          ) : (
            <button type="button" onClick={async () => { if (await finishFollowup(visit.id, notes)) setSaved(true) }}
              className="mt-3 min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white">{t('visits.finish')}</button>
          )}
        </section>
      )}

      <button type="button" onClick={async () => { if (window.confirm(t('visits.deleteConfirm')) && await deleteVisit(visit.id)) navigate('/visits', { replace: true }) }}
        className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted">
        <Trash2 className="size-4" aria-hidden /> {t('visits.delete')}
      </button>
    </>
  )
}
