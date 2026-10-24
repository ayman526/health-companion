import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pencil } from 'lucide-react'
import { SourceChip } from '../components/TrustChips'
import { supabase } from '../lib/supabase'
import { formatDate, formatNumber } from '../lib/format'
import { loadConfirmedResults, loadCorrections, type Correction } from '../lib/labData'
import { LAB_TESTS, getTest } from '../domain/labs/catalog'
import { compare, type Comparison, type SeriesPoint } from '../domain/labs/compare'
import { groupHistories, testFor, type StoredResult } from '../domain/labs/history'
import { liverElevationGrade, measurementStatus, type MeasurementStatus } from '../domain/labs/rules'
import { StatusBadge, TrendLabel } from '../components/LabStatus'
import { PageHeader } from '../components/ui'
import { TestInfoPanel } from '../components/TestInfoPanel'
import { normalizeNumberInput, parseNumber } from '../domain/numbers'

/** Qualitative results such as "Positive" / "Reactive" / "إيجابي". */
const isPositiveText = (s: string | null) => !!s && /positive|reactive|detected|إيجابي|ايجابي/i.test(s) && !/non[- ]?reactive|not detected|negative|سلبي/i.test(s)

interface View {
  row: StoredResult
  historyKey: string | null
  /** Unrecognized test tracked by its printed name and unit. */
  byNameOnly: boolean
  point: SeriesPoint | null
  status: MeasurementStatus | null
  comparison: Comparison | null
  liver: ReturnType<typeof liverElevationGrade>
}

const inputBase = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'
const numOrNull = (s: string) => parseNumber(s)
const badNumber = (s: string) => s.trim() !== '' && numOrNull(s) == null

function ResultEditor({ row, onDone }: { row: StoredResult; onDone: (changed: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [testCode, setTestCode] = useState(row.test_code ?? '')
  const [value, setValue] = useState(row.value_numeric == null ? '' : String(row.value_numeric))
  const [unit, setUnit] = useState(row.unit ?? '')
  const [refLow, setRefLow] = useState(row.ref_low == null ? '' : String(row.ref_low))
  const [refHigh, setRefHigh] = useState(row.ref_high == null ? '' : String(row.ref_high))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const invalid = badNumber(value) || badNumber(refLow) || badNumber(refHigh) || (row.value_numeric != null && value.trim() === '')

  async function save(patch: Record<string, unknown>) {
    if (!supabase) return
    setSaving(true)
    setError(false)
    const { error: rpcError } = await supabase.rpc('correct_lab_result', { p_result_id: row.id, p_patch: patch })
    setSaving(false)
    if (rpcError) return setError(true)
    onDone(true)
  }

  return (
    <div className="mt-3 rounded-xl bg-canvas p-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted">
        {t('review.matchedTest')}
        <select className={inputBase} value={testCode} onChange={(e) => setTestCode(e.target.value)}>
          <option value="">{t('review.notMatched')}</option>
          {LAB_TESTS.map((lt) => <option key={lt.code} value={lt.code}>{lt.name[lang]}</option>)}
        </select>
      </label>
      {row.value_numeric != null && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.value')}
            <input dir="ltr" inputMode="decimal" className={inputBase} value={value} onChange={(e) => setValue(normalizeNumberInput(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.unit')}
            <input dir="ltr" className={inputBase} value={unit} onChange={(e) => setUnit(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.refLow')}
            <input dir="ltr" inputMode="decimal" className={inputBase} value={refLow} onChange={(e) => setRefLow(normalizeNumberInput(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.refHigh')}
            <input dir="ltr" inputMode="decimal" className={inputBase} value={refHigh} onChange={(e) => setRefHigh(normalizeNumberInput(e.target.value))} />
          </label>
        </div>
      )}
      <p className="mt-2 text-xs text-muted">{t('report.correctionNote')}</p>
      {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('review.saveError')}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || invalid}
          onClick={() => void save({
            test_code: testCode,
            ...(row.value_numeric != null ? { value_numeric: numOrNull(value), unit, ref_low: numOrNull(refLow), ref_high: numOrNull(refHigh) } : {}),
          })}
          className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? t('onboarding.saving') : t('report.saveCorrection')}
        </button>
        <button type="button" onClick={() => onDone(false)} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium">
          {t('report.cancel')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => window.confirm(t('report.removeConfirm')) && void save({ remove: true })}
          className="ms-auto min-h-11 px-2 text-sm font-medium text-status-urgent"
        >
          {t('report.removeResult')}
        </button>
      </div>
    </div>
  )
}

export function ReportDetailPage() {
  const { reportId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<{ lab_name: string | null; collected_at: string; document_id: string | null } | null>(null)
  const [views, setViews] = useState<View[]>([])
  const [corrections, setCorrections] = useState<Map<string, Correction[]>>(new Map())
  const [docUrl, setDocUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editingReport, setEditingReport] = useState(false)
  const [reportForm, setReportForm] = useState({ lab_name: '', collected_at: '' })
  const [reportError, setReportError] = useState(false)

  const load = useCallback(async () => {
    if (!supabase || !reportId) return
    const { data: rep } = await supabase.from('laboratory_reports').select('lab_name, collected_at, document_id, status').eq('id', reportId).maybeSingle()
    if (!rep || rep.status !== 'confirmed') {
      setReport(null)
      return setLoading(false)
    }
    setReport(rep)
    setReportForm({ lab_name: rep.lab_name ?? '', collected_at: rep.collected_at })

    // Whole confirmed history, computed on read: corrections apply everywhere immediately.
    const all = await loadConfirmedResults()
    const histories = groupHistories(all)
    const rows = all.filter((r) => r.report_id === reportId)
    setViews(
      rows.map((row) => {
        const match = testFor(row)
        const history = match ? histories.get(match.test.code) : undefined
        if (!match || !history) return { row, historyKey: null, byNameOnly: false, point: null, status: null, comparison: null, liver: null }
        const points = history.series.points
        const idx = points.findIndex((p) => p.resultId === row.id)
        const point = idx >= 0 ? points[idx] : null
        return {
          row,
          historyKey: history.key,
          byNameOnly: match.byNameOnly,
          point,
          status: point ? measurementStatus(match.test, point) : null,
          comparison: point && idx > 0 ? compare(match.test, points[idx - 1], point) : null,
          liver: point ? liverElevationGrade(match.test, point) : null,
        }
      }),
    )
    setCorrections(await loadCorrections(rows.map((r) => r.id)))

    if (rep.document_id) {
      const { data: doc } = await supabase.from('medical_documents').select('storage_path').eq('id', rep.document_id).maybeSingle()
      if (doc) {
        const { data: signed } = await supabase.storage.from('medical-documents').createSignedUrl(doc.storage_path, 600)
        setDocUrl(signed?.signedUrl ?? null)
      }
    }
    setLoading(false)
  }, [reportId])

  useEffect(() => {
    void load()
  }, [load])

  async function saveReport() {
    if (!supabase || !reportId || !reportForm.collected_at) return
    setReportError(false)
    const { error } = await supabase.rpc('correct_lab_report', { p_report_id: reportId, p_patch: reportForm })
    if (error) return setReportError(true)
    setEditingReport(false)
    await load()
  }

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (!report) return <p className="text-muted">{t('review.notFound')}</p>

  return (
    <>
      <PageHeader title={report.lab_name || t('records.labReport')} subtitle={t('report.collectedOn', { date: formatDate(report.collected_at, lang) })} />
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {report.document_id
          ? <SourceChip kind="document" detail={docUrl ? t('review.openOriginal') : undefined} href={docUrl ?? undefined} />
          : <SourceChip kind="user" />}
        <button type="button" onClick={() => setEditingReport((v) => !v)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
          <Pencil className="size-4" aria-hidden /> {t('report.editDetails')}
        </button>
      </div>

      {editingReport && (
        <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('review.labName')}
            <input className={inputBase} value={reportForm.lab_name} onChange={(e) => setReportForm({ ...reportForm, lab_name: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t('review.collectedAt')}
            <input type="date" dir="ltr" className={inputBase} value={reportForm.collected_at} onChange={(e) => setReportForm({ ...reportForm, collected_at: e.target.value })} />
          </label>
          {reportError && <p role="alert" className="text-sm text-status-urgent sm:col-span-2">{t('review.saveError')}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={!reportForm.collected_at} onClick={() => void saveReport()} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50">{t('report.saveCorrection')}</button>
            <button type="button" onClick={() => setEditingReport(false)} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium">{t('report.cancel')}</button>
          </div>
        </section>
      )}

      <p className="mb-4 text-xs text-muted">{t('report.sourceNote')}</p>

      <ul className="flex flex-col gap-3">
        {views.map(({ row, historyKey, byNameOnly, point, status, comparison, liver }) => {
          const test = row.test_code ? getTest(row.test_code) : undefined
          const name = test ? test.name[lang === 'ar' ? 'ar' : 'en'] : row.reported_name
          const value = row.value_numeric != null
            ? `${row.value_comparator ?? ''}${formatNumber(row.value_numeric, lang)} ${row.unit ?? ''}`
            : row.value_text
          const fixes = corrections.get(row.id) ?? []
          return (
            <li key={row.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{name}</p>
                  {test && name !== row.reported_name && <p className="text-xs text-muted">{t('report.asPrinted')}: {row.reported_name}</p>}
                </div>
                {status && <StatusBadge status={status} />}
              </div>
              <p className="mt-2 text-lg font-semibold"><span className="ltr-value">{value}</span></p>
              {(row.ref_text || row.ref_low != null || row.ref_high != null) && (
                <p className="text-xs text-muted">
                  {t('report.range')}: <span className="ltr-value">{row.ref_text || `${row.ref_low ?? ''} – ${row.ref_high ?? ''}`}</span>
                </p>
              )}
              {fixes.length > 0 && (
                <p className="mt-1 text-xs text-status-info">
                  {t('report.corrected', { date: formatDate(fixes[0].at, lang) })}{' '}
                  {fixes[0].oldValue != null && <span className="ltr-value">({t('report.was')} {fixes[0].oldValue} {fixes[0].oldUnit ?? ''})</span>}
                </p>
              )}
              {liver && <p className="mt-2 text-sm text-status-watch">{t(`labs.liver.${liver.grade}`, { fold: formatNumber(liver.foldUln, lang) })}</p>}
              {comparison && (
                <p className="mt-2 text-sm">
                  <TrendLabel trend={comparison.trend} />{' · '}
                  <span className="text-muted">
                    {t('report.vsPrevious', { date: formatDate(comparison.previous.collectedAt, lang) })}{' '}
                    <span className="ltr-value">
                      {formatNumber(comparison.previous.value, lang)} → {formatNumber(comparison.current.value, lang)} {comparison.current.unit}
                      {comparison.percentChange != null && ` (${comparison.percentChange > 0 ? '+' : ''}${formatNumber(comparison.percentChange, lang, 1)}%)`}
                    </span>
                  </span>
                </p>
              )}
              {comparison && byNameOnly && <p className="mt-1 text-xs text-muted">{t('report.byNameOnly')}</p>}
              {test && !point && <p className="mt-2 text-xs text-muted">{t('report.notComparable')}</p>}
              {!test && !comparison && <p className="mt-2 text-xs text-muted">{t('report.unrecognized')}</p>}
              {test && <TestInfoPanel test={test} status={status} positive={isPositiveText(row.value_text)} />}

              {editing === row.id ? (
                <ResultEditor row={row} onDone={(changed) => { setEditing(null); if (changed) void load() }} />
              ) : (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button type="button" onClick={() => setEditing(row.id)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-ink">
                    <Pencil className="size-4" aria-hidden /> {t('report.correct')}
                  </button>
                  {historyKey && (
                    <Link to={`/records/tests/${encodeURIComponent(historyKey)}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700">
                      {t('report.history')} <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
                    </Link>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      <Link to="/records" className="mt-6 inline-block text-sm font-medium text-brand-700">{t('report.back')}</Link>
    </>
  )
}
