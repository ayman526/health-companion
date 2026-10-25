import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Camera, ChevronRight, Columns2, FileText, FolderHeart, LineChart, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { startExtraction } from '../lib/documents'
import { formatDate, formatNumber } from '../lib/format'
import { loadHistories } from '../lib/labData'
import type { TestHistory } from '../domain/labs/history'
import { measurementStatus } from '../domain/labs/rules'
import { StatusBadge } from '../components/LabStatus'
import { EmptyState, PageHeader } from '../components/ui'

interface ReportItem {
  id: string
  document_id: string | null
  status: string
  lab_name: string | null
  collected_at: string | null
  created_at: string
  laboratory_results: { count: number }[]
}
interface DocItem {
  id: string
  status: string
  title: string | null
  failure_reason: string | null
  created_at: string
}

export function RecordsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<ReportItem[]>([])
  const [docs, setDocs] = useState<DocItem[]>([])
  const [tests, setTests] = useState<TestHistory[]>([])

  const reload = useCallback(async () => {
    if (!supabase) return
    const [{ data: reps }, { data: ds }] = await Promise.all([
      supabase
        .from('laboratory_reports')
        .select('id, document_id, status, lab_name, collected_at, created_at, laboratory_results(count)')
        .in('status', ['draft', 'confirmed'])
        .neq('laboratory_results.status', 'discarded')
        .order('collected_at', { ascending: false, nullsFirst: true }),
      supabase
        .from('medical_documents')
        .select('id, status, title, failure_reason, created_at')
        .in('status', ['uploaded', 'processing', 'needs_review', 'failed'])
        .order('created_at', { ascending: false }),
    ])
    setTests([...(await loadHistories()).values()].filter((h) => h.series.points.length > 0))
    setReports((reps ?? []) as ReportItem[])
    setDocs((ds ?? []) as DocItem[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const drafts = reports.filter((r) => r.status === 'draft')
  const confirmed = reports.filter((r) => r.status === 'confirmed')
  const draftDocIds = new Set(drafts.map((r) => r.document_id))
  // Documents waiting without a draft lab report: still processing, failed, or a non-lab document.
  const pendingDocs = docs.filter((d) => !draftDocIds.has(d.id))

  return (
    <>
      <PageHeader title={t('records.title')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link to="/records/scan" className="flex min-h-14 items-center gap-3 rounded-2xl bg-brand-700 px-4 font-medium text-white">
          <Camera className="size-5" aria-hidden /> {t('actions.scan')}
        </Link>
        {reports.filter((r) => r.status === 'confirmed').length >= 2 && (
          <Link to="/records/compare" className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 font-medium">
            <Columns2 className="size-5 text-brand-700" aria-hidden /> {t('compare.title')}
          </Link>
        )}
      </div>

      {loading ? (
        <p role="status" className="text-muted">{t('auth.loading')}</p>
      ) : drafts.length + confirmed.length + pendingDocs.length === 0 ? (
        <EmptyState icon={FolderHeart} text={t('records.empty')} />
      ) : (
        <div className="flex flex-col gap-6">
          {(drafts.length > 0 || pendingDocs.length > 0) && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('records.needsReview')}</h2>
              <ul className="flex flex-col gap-2">
                {drafts.map((r) => (
                  <li key={r.id}>
                    <Link to={`/records/review/${r.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-status-watch bg-status-watch-bg px-4 text-status-watch">
                      <FileText className="size-5 shrink-0" aria-hidden />
                      <span className="flex-1">
                        <span className="block font-medium">{r.lab_name || t('records.labReport')}</span>
                        <span className="text-xs">{t('records.resultsToReview', { count: r.laboratory_results[0]?.count ?? 0 })}</span>
                      </span>
                      <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                    </Link>
                  </li>
                ))}
                {pendingDocs.map((d) => d.status === 'needs_review' ? (
                  <li key={d.id}>
                    <Link to={`/records/documents/${d.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-status-watch bg-status-watch-bg px-4 text-status-watch">
                      <FileText className="size-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-start font-medium">{d.title || t('records.document')}</span>
                        <span className="text-xs">{t('records.docStatus.needs_review')}</span>
                      </span>
                      <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                    </Link>
                  </li>
                ) : (
                  <li key={d.id} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4">
                    {d.status === 'processing' || d.status === 'uploaded' ? <Loader2 className="size-5 shrink-0 animate-spin text-muted" aria-hidden /> : <FileText className="size-5 shrink-0 text-muted" aria-hidden />}
                    <span className="min-w-0 flex-1">
                      <span dir="auto" className="block truncate text-start text-sm font-medium">{d.title || t('records.document')}</span>
                      <span className="block text-xs text-muted">
                        {d.status === 'failed' ? t(`scan.failure.${d.failure_reason ?? 'ai_unavailable'}`, t('scan.failure.ai_unavailable')) : t(`records.docStatus.${d.status}`)}
                      </span>
                      {d.status === 'failed' && (
                        <span className="mt-1 flex gap-3">
                          <button type="button" onClick={async () => { await startExtraction(d.id); await reload() }} className="min-h-9 text-xs font-medium text-brand-700">{t('records.retry')}</button>
                          <button type="button" onClick={async () => { if (supabase && !(await supabase.rpc('discard_document', { p_document_id: d.id })).error) await reload() }} className="min-h-9 text-xs font-medium text-muted">{t('records.remove')}</button>
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tests.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                <LineChart className="size-4" aria-hidden /> {t('records.tests')}
              </h2>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {tests
                  .sort((a, b) => b.series.points[b.series.points.length - 1].collectedAt.localeCompare(a.series.points[a.series.points.length - 1].collectedAt) || a.test.name.en.localeCompare(b.test.name.en))
                  .map((h) => {
                    const latest = h.series.points[h.series.points.length - 1]
                    return (
                      <li key={h.key}>
                        <Link to={`/records/tests/${encodeURIComponent(h.key)}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{h.byNameOnly ? h.test.name.en : h.test.name[lang === 'ar' ? 'ar' : 'en']}</span>
                            <span className="block text-xs text-muted">
                              <span className="ltr-value sensitive">{formatNumber(latest.value, lang)} {latest.unit}</span> · {formatDate(latest.collectedAt, lang)}
                              {h.series.points.length > 1 && ` · ${t('records.resultCount', { count: h.series.points.length })}`}
                            </span>
                          </span>
                          <StatusBadge status={measurementStatus(h.test, latest)} />
                          <ChevronRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
              </ul>
            </section>
          )}
          {confirmed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('records.labReports')}</h2>
              <ul className="flex flex-col gap-2">
                {confirmed.map((r) => (
                  <li key={r.id}>
                    <Link to={`/records/reports/${r.id}`} className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4">
                      <FileText className="size-5 shrink-0 text-brand-700" aria-hidden />
                      <span className="flex-1">
                        <span className="block font-medium">{r.lab_name || t('records.labReport')}</span>
                        <span className="text-xs text-muted">
                          {r.collected_at && formatDate(r.collected_at, lang)} · {t('records.resultCount', { count: r.laboratory_results[0]?.count ?? 0 })}
                        </span>
                      </span>
                      <ChevronRight className="size-4 text-muted rtl:-scale-x-100" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  )
}
