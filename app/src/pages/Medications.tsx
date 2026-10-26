import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, FileText, Pill, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { deleteDocument } from '../lib/documents'
import { photoUrls } from '../lib/medicationPhotos'
import { currentSchedule, loadMedications, type MedicationRow } from '../lib/medications'
import { useScheduleText } from '../components/ScheduleSummary'
import { EmptyState, PageHeader } from '../components/ui'
import { PushPrompt } from '../components/PushPrompt'

export function MedicationsPage() {
  const { t, i18n } = useTranslation()
  const describe = useScheduleText()
  const [loading, setLoading] = useState(true)
  const [meds, setMeds] = useState<MedicationRow[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})
  const [prescriptions, setPrescriptions] = useState<{ id: string; title: string | null; created_at: string }[]>([])

  useEffect(() => {
    void (async () => {
      const list = await loadMedications()
      setMeds(list)
      setPhotos(await photoUrls(list.map((m) => m.photo_path).filter((p): p is string => !!p)))
      if (supabase) {
        const { data } = await supabase
          .from('medical_documents')
          .select('id, title, created_at')
          .eq('status', 'needs_review')
          .in('document_type', ['prescription', 'doctor_report', 'discharge_summary'])
          .order('created_at', { ascending: false })
        setPrescriptions(data ?? [])
      }
      setLoading(false)
    })()
  }, [])

  const active = meds.filter((m) => m.is_active)
  const past = meds.filter((m) => !m.is_active)

  return (
    <>
      <PageHeader title={t('medications.title')} />
      <PushPrompt className="mb-4" />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Link to="/medications/new" className="flex min-h-14 items-center gap-3 rounded-2xl bg-brand-700 px-4 font-medium text-white">
          <Plus className="size-5" aria-hidden /> {t('actions.addMedication')}
        </Link>
        <Link to="/records/scan" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 font-medium">
          <FileText className="size-5 text-brand-700" aria-hidden /> {t('meds.scanPrescription')}
        </Link>
      </div>

      {prescriptions.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-status-watch">{t('meds.prescriptionsToReview')}</h2>
          <ul className="flex flex-col gap-2">
            {prescriptions.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Link to={`/records/documents/${p.id}`} className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl border border-status-watch bg-status-watch-bg px-4 text-status-watch">
                  <FileText className="size-5 shrink-0" aria-hidden />
                  <span className="flex-1">
                    <span className="block font-medium">{p.title || t('records.document')}</span>
                    <span className="text-xs">{formatDate(p.created_at, i18n.language)}</span>
                  </span>
                  <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                </Link>
                <button
                  type="button"
                  aria-label={t('docReview.delete')}
                  onClick={async () => {
                    if (window.confirm(t('docReview.deleteConfirm')) && (await deleteDocument(p.id))) setPrescriptions((list) => list.filter((x) => x.id !== p.id))
                  }}
                  className="grid min-h-14 min-w-12 place-items-center rounded-2xl border border-line bg-surface text-muted hover:text-status-urgent"
                >
                  <Trash2 className="size-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {active.length >= 2 && (
        <p className="mb-4 flex gap-2 rounded-xl bg-status-info-bg px-4 py-3 text-sm text-status-info">
          <ShieldAlert className="size-5 shrink-0" aria-hidden /> {t('meds.pharmacistReview')}
        </p>
      )}

      {loading ? (
        <p role="status" className="text-muted">{t('auth.loading')}</p>
      ) : meds.length === 0 ? (
        <EmptyState icon={Pill} text={t('medications.empty')} />
      ) : (
        <div className="flex flex-col gap-6">
          {[{ list: active, title: t('meds.current') }, { list: past, title: t('meds.past') }].map(({ list, title }) => list.length > 0 && (
            <section key={title}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{title}</h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {list.map((m) => {
                  const s = currentSchedule(m)
                  return (
                    <li key={m.id}>
                      <Link to={`/medications/${m.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2">
                        {m.photo_path && photos[m.photo_path] ? (
                          <img src={photos[m.photo_path]} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-canvas"><Pill className={`size-5 ${m.is_active ? 'text-brand-700' : 'text-muted'}`} aria-hidden /></span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="sensitive block truncate font-medium">{m.brand_name} {m.strength && <span className="ltr-value text-sm font-normal text-muted">{m.strength}</span>}</span>
                          {s && <span className="block text-xs text-muted">{describe(s)}</span>}
                          {!m.is_active && s?.valid_to && <span className="block text-xs text-muted">{t('meds.stoppedOn', { date: formatDate(s.valid_to, i18n.language) })}</span>}
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t('meds.disclaimer')}</p>
    </>
  )
}
