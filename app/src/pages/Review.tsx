import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { LAB_TESTS, getTest, learnedKey, matchTest, unitFits, type MatchSource } from '../domain/labs/catalog'
import { draftStatus } from '../domain/labs/rules'
import { StatusBadge } from '../components/LabStatus'
import { PageHeader } from '../components/ui'
import { normalizeNumberInput, parseNumber } from '../domain/numbers'

interface ReportRow {
  id: string
  document_id: string | null
  status: string
  lab_name: string | null
  collected_at: string | null
  reported_at: string | null
  collected_date_is_fallback: boolean
  notes: string | null
}

type Source = MatchSource | 'manual' | null

interface DraftResult {
  key: string
  id: string | null
  test_code: string
  source: Source
  /** AI suggestion rejected because its unit doesn't fit that test. */
  rejectedSuggestion: string | null
  reported_name: string
  value: string
  value_comparator: string
  value_text: string
  unit: string
  ref_low: string
  ref_high: string
  ref_text: string
  lab_flag: string
  needs_confirmation: string[]
  checked: boolean
  expanded: boolean
}

const COMPARATORS = ['', '<', '<=', '>', '>=']

let keySeq = 0
const newKey = () => `row-${++keySeq}`

function emptyRow(): DraftResult {
  return {
    key: newKey(), id: null, test_code: '', source: null, rejectedSuggestion: null, reported_name: '', value: '',
    value_comparator: '', value_text: '', unit: '', ref_low: '', ref_high: '', ref_text: '', lab_flag: '',
    needs_confirmation: [], checked: true, expanded: true,
  }
}

const num = (s: string) => parseNumber(s)
const isBadNumber = (s: string) => s.trim() !== '' && num(s) == null

function unitProblem(r: DraftResult) {
  const test = r.test_code ? getTest(r.test_code) : undefined
  return !!test && r.value.trim() !== '' && !unitFits(test, r.unit)
}

/** A row the user doesn't need to look at: read clearly, matched, valid. */
function isClear(r: DraftResult) {
  return (
    r.needs_confirmation.length === 0 && !!r.test_code && !unitProblem(r) &&
    !isBadNumber(r.value) && !isBadNumber(r.ref_low) && !isBadNumber(r.ref_high) &&
    (r.value.trim() !== '' || r.value_text.trim() !== '') && r.reported_name.trim() !== ''
  )
}

const inputBase = 'min-h-11 w-full rounded-lg border bg-surface px-3 text-sm outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100'

export function ReviewPage() {
  const { reportId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'

  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportRow | null>(null)
  const [docUrl, setDocUrl] = useState<{ url: string; isImage: boolean } | null>(null)
  const [labName, setLabName] = useState('')
  const [collectedAt, setCollectedAt] = useState('')
  const [reportedAt, setReportedAt] = useState('')
  const [dateChecked, setDateChecked] = useState(true)
  const [rows, setRows] = useState<DraftResult[]>([])
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !reportId) return
    void (async () => {
      const { data: rep } = await supabase.from('laboratory_reports').select('*').eq('id', reportId).maybeSingle()
      if (!rep) {
        setLoading(false)
        return
      }
      setReport(rep as ReportRow)
      setLabName(rep.lab_name ?? '')
      setCollectedAt(rep.collected_at ?? '')
      setReportedAt(rep.reported_at ?? '')
      setDateChecked(!(rep.collected_date_is_fallback || rep.notes === 'date_uncertain'))

      const [{ data: res }, { data: aliases }] = await Promise.all([
        supabase
          .from('laboratory_results')
          .select('id, test_code, reported_name, value_numeric, value_comparator, value_text, unit, ref_low, ref_high, ref_text, lab_flag, needs_confirmation')
          .eq('report_id', reportId)
          .eq('status', 'draft')
          .order('created_at'),
        supabase.from('test_aliases').select('alias_key, test_code'),
      ])
      const learned = new Map((aliases ?? []).map((a) => [a.alias_key, a.test_code]))

      const loaded = (res ?? []).map((r): DraftResult => {
        // Deterministic match first (learned names, catalog); then the AI suggestion if its unit fits.
        const det = matchTest(r.reported_name, null, learned)
        const suggested = r.test_code ? getTest(r.test_code) : undefined
        const suggestionFits = !!suggested && (r.value_numeric == null || unitFits(suggested, r.unit))
        const code = det?.code ?? (suggestionFits ? suggested.code : '')
        const row: DraftResult = {
          key: newKey(),
          id: r.id,
          test_code: code,
          source: det?.source ?? (suggestionFits ? 'ai_suggested' : null),
          rejectedSuggestion: !det && suggested && !suggestionFits ? suggested.code : null,
          reported_name: r.reported_name,
          value: r.value_numeric == null ? '' : String(r.value_numeric),
          value_comparator: r.value_comparator ?? '',
          value_text: r.value_text ?? '',
          unit: r.unit ?? '',
          ref_low: r.ref_low == null ? '' : String(r.ref_low),
          ref_high: r.ref_high == null ? '' : String(r.ref_high),
          ref_text: r.ref_text ?? '',
          lab_flag: r.lab_flag ?? '',
          needs_confirmation: r.needs_confirmation ?? [],
          checked: (r.needs_confirmation ?? []).length === 0,
          expanded: false,
        }
        return { ...row, expanded: !isClear(row) }
      })
      setRows(loaded.length ? loaded : [emptyRow()])

      if (rep.document_id) {
        const { data: doc } = await supabase.from('medical_documents').select('storage_path, mime_type').eq('id', rep.document_id).maybeSingle()
        if (doc) {
          const { data: signed } = await supabase.storage.from('medical-documents').createSignedUrl(doc.storage_path, 600)
          if (signed) setDocUrl({ url: signed.signedUrl, isImage: doc.mime_type.startsWith('image/') })
        }
      }
      setLoading(false)
    })()
  }, [reportId])

  // Near-duplicate check (SPEC §3 step 5): a confirmed report on the same date with mostly identical values.
  useEffect(() => {
    if (!supabase || !report || !collectedAt) return
    let cancelled = false
    void (async () => {
      const { data } = await supabase
        .from('laboratory_results')
        .select('report_id, reported_name, value_numeric, unit, laboratory_reports!inner(collected_at, status)')
        .eq('status', 'confirmed')
        .eq('laboratory_reports.collected_at', collectedAt)
        .eq('laboratory_reports.status', 'confirmed')
      if (cancelled || !data?.length) return setDuplicateOf(null)
      const mine = rows.filter((r) => r.value !== '')
      const byReport = new Map<string, Set<string>>()
      for (const r of data) {
        const k = `${r.reported_name.toLowerCase()}|${r.value_numeric}|${(r.unit ?? '').toLowerCase()}`
        if (!byReport.has(r.report_id)) byReport.set(r.report_id, new Set())
        byReport.get(r.report_id)!.add(k)
      }
      for (const [otherId, keys] of byReport) {
        const same = mine.filter((r) => keys.has(`${r.reported_name.toLowerCase()}|${num(r.value)}|${r.unit.toLowerCase()}`)).length
        if (mine.length > 0 && same / mine.length >= 0.8) return setDuplicateOf(otherId)
      }
      setDuplicateOf(null)
    })()
    return () => {
      cancelled = true
    }
  }, [report, collectedAt, rows])

  const update = (key: string, patch: Partial<DraftResult>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const problems = useMemo(() => {
    const list: string[] = []
    if (!collectedAt) list.push(t('review.problems.date'))
    if (!dateChecked) list.push(t('review.problems.dateCheck'))
    if (rows.length === 0) list.push(t('review.problems.noRows'))
    if (rows.some((r) => !r.reported_name.trim())) list.push(t('review.problems.name'))
    if (rows.some((r) => r.value.trim() === '' && r.value_text.trim() === '')) list.push(t('review.problems.value'))
    if (rows.some((r) => isBadNumber(r.value) || isBadNumber(r.ref_low) || isBadNumber(r.ref_high))) list.push(t('review.problems.number'))
    if (rows.some((r) => !r.checked)) list.push(t('review.problems.unchecked'))
    return list
  }, [collectedAt, dateChecked, rows, t])

  async function confirm() {
    if (!supabase || !reportId || problems.length) return
    setSaving(true)
    setError(null)
    const payload = rows.map((r) => {
      const test = r.test_code ? getTest(r.test_code) : undefined
      return {
        id: r.id,
        test_code: r.test_code || null,
        loinc: test?.loinc[0] ?? null,
        reported_name: r.reported_name.trim(),
        value_numeric: num(r.value),
        value_comparator: r.value_comparator || null,
        value_text: r.value.trim() === '' ? r.value_text.trim() : null,
        unit: r.unit.trim() || null,
        ref_low: num(r.ref_low),
        ref_high: num(r.ref_high),
        ref_text: r.ref_text.trim() || null,
        lab_flag: r.lab_flag || null,
        // Remember matches the user made by hand, for their next reports.
        learn_alias: r.source === 'manual' && r.test_code ? learnedKey(r.reported_name) : null,
        // Unrecognized names are counted anonymously (name only) to grow the catalog.
        name_key: r.test_code ? null : learnedKey(r.reported_name),
      }
    })
    const { error: rpcError } = await supabase.rpc('confirm_lab_report', {
      p_report_id: reportId,
      p_report: {
        lab_name: labName.trim(),
        collected_at: collectedAt,
        reported_at: reportedAt || null,
        collected_date_is_fallback: report?.collected_date_is_fallback && collectedAt === report.collected_at,
      },
      p_results: payload,
    })
    setSaving(false)
    if (rpcError) return setError(t('review.saveError'))
    navigate(`/records/reports/${reportId}`, { replace: true })
  }

  async function discard() {
    if (!supabase || !report || !window.confirm(t('review.discardConfirm'))) return
    const { error: rpcError } = report.document_id
      ? await supabase.rpc('discard_document', { p_document_id: report.document_id })
      : await supabase.rpc('discard_report', { p_report_id: report.id })
    if (rpcError) return setError(t('review.saveError'))
    navigate('/records', { replace: true })
  }

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (!report || report.status !== 'draft') return <p className="text-muted">{t('review.notFound')}</p>

  const attention = rows.filter((r) => !isClear(r))
  const clear = rows.filter(isClear)

  function statusOf(r: DraftResult) {
    const test = r.test_code ? getTest(r.test_code) : undefined
    return draftStatus(test, {
      value: num(r.value), comparator: r.value_comparator || null, unit: r.unit,
      refLow: num(r.ref_low), refHigh: num(r.ref_high), labFlag: r.lab_flag || null,
    })
  }

  function testName(r: DraftResult) {
    const test = r.test_code ? getTest(r.test_code) : undefined
    return test ? test.name[lang] : r.reported_name
  }

  function renderEditor(r: DraftResult) {
    const flagged = new Set(r.needs_confirmation)
    const test = r.test_code ? getTest(r.test_code) : undefined
    const status = statusOf(r)
    const field = (name: string) => `${inputBase} ${flagged.has(name) && !r.checked ? 'border-status-watch bg-status-watch-bg' : 'border-line'}`
    return (
      <section key={r.key} className="rounded-2xl border border-line bg-surface p-4">
        {flagged.size > 0 && (
          <p className="mb-3 flex gap-2 text-sm text-status-watch">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {t('review.checkFields', { fields: [...flagged].map((f) => t(`review.fieldNames.${f}`, f)).join(lang === 'ar' ? '، ' : ', ') })}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.reportedName')}
            <input
              className={field('reported_name')}
              value={r.reported_name}
              onChange={(e) => {
                const det = r.source === 'manual' ? null : matchTest(e.target.value)
                update(r.key, det ? { reported_name: e.target.value, test_code: det.code, source: det.source } : { reported_name: e.target.value })
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            <span>
              {t('review.matchedTest')}
              {r.source && r.test_code && <span className="ms-2 font-normal">· {t(`review.matchSource.${r.source}`)}</span>}
            </span>
            <select
              className={`${inputBase} ${r.test_code ? 'border-line' : 'border-status-watch'}`}
              value={r.test_code}
              onChange={(e) => update(r.key, { test_code: e.target.value, source: 'manual', rejectedSuggestion: null })}
            >
              <option value="">{t('review.notMatched')}</option>
              {LAB_TESTS.map((lt) => <option key={lt.code} value={lt.code}>{lt.name[lang]}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-[5rem_1fr_1fr] gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.comparator')}
            <select dir="ltr" className={`${inputBase} border-line`} value={r.value_comparator} onChange={(e) => update(r.key, { value_comparator: e.target.value })}>
              {COMPARATORS.map((c) => <option key={c} value={c}>{c || '='}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.value')}
            <input dir="ltr" inputMode="decimal" className={field('value_numeric')} value={r.value} placeholder={r.value_text} onChange={(e) => update(r.key, { value: normalizeNumberInput(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.unit')}
            <input dir="ltr" className={field('unit')} value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} />
          </label>
        </div>
        {r.value === '' && r.value_text && <p className="mt-1 text-xs text-muted">{t('review.textResult', { text: r.value_text })}</p>}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.refLow')}
            <input dir="ltr" inputMode="decimal" className={field('ref_low')} value={r.ref_low} onChange={(e) => update(r.key, { ref_low: normalizeNumberInput(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('review.refHigh')}
            <input dir="ltr" inputMode="decimal" className={field('ref_high')} value={r.ref_high} onChange={(e) => update(r.key, { ref_high: normalizeNumberInput(e.target.value) })} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
          {status && <StatusBadge status={status} />}
          {r.ref_text && <span>{t('review.rangeAsPrinted')}: <span className="ltr-value sensitive">{r.ref_text}</span></span>}
          {r.lab_flag && <span>· {t('review.labMarked', { flag: t(`review.flags.${r.lab_flag}`) })}</span>}
        </div>
        {unitProblem(r) && test && <p className="mt-2 text-xs text-status-watch">{t('review.unitNotComparable', { unit: test.canonicalUnit })}</p>}
        {r.rejectedSuggestion && <p className="mt-2 text-xs text-status-watch">{t('review.aiMatchUnit', { test: getTest(r.rejectedSuggestion)?.name[lang] ?? '' })}</p>}
        {!r.test_code && <p className="mt-2 text-xs text-muted">{t('review.unmatchedHint')}</p>}

        <div className="mt-3 flex items-center justify-between gap-3">
          {flagged.size > 0 ? (
            <label className="flex items-start gap-2 text-sm font-medium text-status-watch">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={r.checked} onChange={(e) => update(r.key, { checked: e.target.checked })} />
              {t('review.checkedAgainstDoc')}
            </label>
          ) : isClear(r) ? (
            <button type="button" onClick={() => update(r.key, { expanded: false })} className="min-h-11 text-sm font-medium text-brand-700">{t('review.collapse')}</button>
          ) : <span />}
          <button type="button" aria-label={t('review.removeRow')} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
      </section>
    )
  }

  return (
    <>
      <PageHeader title={t('review.title')} subtitle={t('review.subtitle')} />

      {docUrl && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-3">
          {docUrl.isImage && <img src={docUrl.url} alt={t('review.original')} className="mb-2 max-h-72 w-full rounded-lg object-contain" />}
          <a href={docUrl.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
            <ExternalLink className="size-4" aria-hidden /> {t('review.openOriginal')}
          </a>
        </div>
      )}

      {duplicateOf && <p className="mb-4 rounded-xl bg-status-info-bg px-4 py-3 text-sm text-status-info">{t('review.duplicate')}</p>}

      <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('review.labName')}
          <input className={`${inputBase} border-line`} value={labName} onChange={(e) => setLabName(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('review.collectedAt')} *
          <input type="date" dir="ltr" className={`${inputBase} ${!collectedAt || !dateChecked ? 'border-status-watch' : 'border-line'}`} value={collectedAt} onChange={(e) => setCollectedAt(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t('review.reportedAt')}
          <input type="date" dir="ltr" className={`${inputBase} border-line`} value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} />
        </label>
        {(report.collected_date_is_fallback || report.notes === 'date_uncertain') && (
          <label className="flex items-start gap-2 text-sm sm:col-span-3">
            <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={dateChecked} onChange={(e) => setDateChecked(e.target.checked)} />
            {report.collected_date_is_fallback ? t('review.dateFallback') : t('review.dateUncertain')}
          </label>
        )}
      </section>

      {attention.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 text-sm font-semibold text-status-watch">{t('review.needsCheck', { count: attention.length })}</h2>
          <div className="flex flex-col gap-3">{attention.map(renderEditor)}</div>
        </>
      )}

      {clear.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-status-ok">
            <CheckCircle2 className="size-4" aria-hidden /> {t('review.readClearly', { count: clear.length })}
          </h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {clear.map((r) => {
              if (r.expanded) return <li key={r.key} className="p-2">{renderEditor(r)}</li>
              const status = statusOf(r)
              return (
                <li key={r.key}>
                  <button type="button" onClick={() => update(r.key, { expanded: true })} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-start" aria-label={t('review.edit')}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{testName(r)}</span>
                      <span className="block text-xs text-muted">
                        <span className="ltr-value sensitive">{r.value_comparator}{r.value || r.value_text} {r.unit}</span>
                        {r.ref_text && <> · <span className="ltr-value sensitive">{r.ref_text}</span></>}
                      </span>
                    </span>
                    {status && status !== 'no_range' && <StatusBadge status={status} />}
                    <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
        <Plus className="size-4" aria-hidden /> {t('review.addRow')}
      </button>

      {problems.length > 0 && (
        <ul className="mt-6 list-disc ps-5 text-sm text-muted">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
      {error && <p role="alert" className="mt-4 text-sm text-status-urgent">{error}</p>}

      <div className="sticky bottom-20 mt-6 flex gap-3 bg-canvas py-2 md:bottom-0">
        <button type="button" onClick={() => void discard()} className="min-h-12 flex-1 rounded-xl border border-line bg-surface font-medium">
          {t('review.discard')}
        </button>
        <button type="button" disabled={problems.length > 0 || saving} onClick={() => void confirm()} className="min-h-12 flex-[2] rounded-xl bg-brand-700 font-medium text-white disabled:opacity-50">
          {saving ? t('onboarding.saving') : t('review.confirm')}
        </button>
      </div>
    </>
  )
}
