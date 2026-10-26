import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowDownRight, ArrowLeft, ArrowUpRight, ChevronDown, Minus, Siren } from 'lucide-react'
import { formatDate, formatNumber } from '../lib/format'
import { loadConfirmedResults } from '../lib/labData'
import { LAB_TESTS } from '../domain/labs/catalog'
import { compare, type Comparison } from '../domain/labs/compare'
import { groupHistories, type StoredResult } from '../domain/labs/history'
import { measurementStatus, type MeasurementStatus } from '../domain/labs/rules'
import { PageHeader } from '../components/ui'
import { Sheet } from '../components/Sheet'

interface ReportOption {
  id: string
  date: string
  lab: string | null
}

type Level = 'critical' | 'attention' | 'other'
type Filter = 'all' | 'attention' | 'improved' | 'stable'

const CATALOG_ORDER = new Map(LAB_TESTS.map((t, i) => [t.code, i]))
const selectClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm'
const LEVEL_ORDER: Record<Level, number> = { critical: 0, attention: 1, other: 2 }

// What matters first: critical values (red, rare), then results outside the
// range or moving the wrong way (amber), then everything else in report order.
function levelOf(status: MeasurementStatus | null, c: Comparison | null): Level {
  if (status === 'urgent') return 'critical'
  if (status === 'high' || status === 'low' || c?.trend === 'worsening') return 'attention'
  return 'other'
}

/**
 * Two reports in one compact table: one row per test (before → after and an
 * arrow), the results that need a look on top. Changes are calculated by the
 * app from the two reports, not by AI.
 */
export function ComparePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StoredResult[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [picking, setPicking] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    void loadConfirmedResults().then((all) => {
      setRows(all)
      const reports = optionsFrom(all)
      if (reports.length >= 2) {
        setA(reports[1].id)
        setB(reports[0].id)
      }
      setLoading(false)
    })
  }, [])

  const reports = useMemo(() => optionsFrom(rows), [rows])
  const histories = useMemo(() => groupHistories(rows), [rows])

  const lines = useMemo(() => {
    const out = []
    for (const h of histories.values()) {
      const pa = h.series.points.find((p) => p.reportId === a) ?? null
      const pb = h.series.points.find((p) => p.reportId === b) ?? null
      if (!pa && !pb) continue
      // Older report first, so the change reads forward in time.
      const [older, newer] = pa && pb && pa.collectedAt > pb.collectedAt ? [pb, pa] : [pa, pb]
      const c = older && newer ? compare(h.test, older, newer) : null
      const status = newer ? measurementStatus(h.test, newer) : null
      out.push({ h, older, newer, c, status, level: levelOf(status, c) })
    }
    return out.sort((x, y) => LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]
      || (CATALOG_ORDER.get(x.h.test.code) ?? 999) - (CATALOG_ORDER.get(y.h.test.code) ?? 999)
      || x.h.test.name.en.localeCompare(y.h.test.name.en))
  }, [histories, a, b])

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (reports.length < 2) return (<><PageHeader title={t('compare.title')} /><p className="text-muted">{t('compare.needTwo')}</p></>)

  const label = (r: ReportOption) => `${formatDate(r.date, lang)}${r.lab ? ` · ${r.lab}` : ''}`
  const [olderId, newerId] = (reports.find((r) => r.id === a)?.date ?? '') > (reports.find((r) => r.id === b)?.date ?? '') ? [b, a] : [a, b]
  const olderR = reports.find((r) => r.id === olderId)
  const newerR = reports.find((r) => r.id === newerId)
  // Column headers: just the month, plus the year when the two reports are in different years.
  const sameYear = olderR?.date.slice(0, 4) === newerR?.date.slice(0, 4)
  const column = (r?: ReportOption) => (r ? new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', sameYear ? { month: 'short' } : { month: 'short', year: '2-digit' }).format(new Date(r.date)) : '')

  const counts = {
    critical: lines.filter((l) => l.level === 'critical').length,
    attention: lines.filter((l) => l.level !== 'other').length,
    improved: lines.filter((l) => l.c?.trend === 'improving').length,
    stable: lines.filter((l) => l.level === 'other' && (l.c?.trend === 'stable' || l.c?.trend === 'changed_within_range')).length,
  }
  const shown = lines.filter((l) => filter === 'all' ? true
    : filter === 'attention' ? l.level !== 'other'
    : filter === 'improved' ? l.c?.trend === 'improving'
    : l.level === 'other' && (l.c?.trend === 'stable' || l.c?.trend === 'changed_within_range'))
  const firstOther = shown.findIndex((l) => l.level === 'other')
  const toggle = (f: Filter) => setFilter(filter === f ? 'all' : f)
  const chip = (on: boolean) => `inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-medium ${on ? 'ring-2 ring-brand-600' : ''}`

  return (
    <>
      <PageHeader title={t('compare.title')} />

      <button type="button" onClick={() => setPicking(true)} className="mb-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm">
        <span className="text-muted">{olderR ? formatDate(olderR.date, lang) : ''}</span>
        <ArrowLeft className="size-4 shrink-0 text-muted ltr:rotate-180" aria-hidden />
        <span className="font-semibold">{newerR ? formatDate(newerR.date, lang) : ''}</span>
        <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
      </button>

      {a === b ? (
        <p className="text-muted">{t('compare.pickDifferent')}</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t('compare.filter')}>
            {counts.critical > 0 && (
              <button type="button" aria-pressed={filter === 'attention'} onClick={() => toggle('attention')} className={`${chip(filter === 'attention')} bg-status-urgent-bg text-status-urgent`}>
                <Siren className="size-3.5" aria-hidden /> {t('compare.critical', { count: counts.critical })}
              </button>
            )}
            {counts.attention - counts.critical > 0 && (
              <button type="button" aria-pressed={filter === 'attention'} onClick={() => toggle('attention')} className={`${chip(filter === 'attention')} bg-status-watch-bg text-status-watch`}>
                <AlertTriangle className="size-3.5" aria-hidden /> {t('compare.attention', { count: counts.attention - counts.critical })}
              </button>
            )}
            {counts.improved > 0 && (
              <button type="button" aria-pressed={filter === 'improved'} onClick={() => toggle('improved')} className={`${chip(filter === 'improved')} border border-line text-status-ok`}>{t('compare.improved', { count: counts.improved })}</button>
            )}
            {counts.stable > 0 && (
              <button type="button" aria-pressed={filter === 'stable'} onClick={() => toggle('stable')} className={`${chip(filter === 'stable')} border border-line text-muted`}>{t('compare.stable', { count: counts.stable })}</button>
            )}
          </div>

          <div className="rounded-2xl border border-line bg-surface px-4">
            <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_3.25rem_3.25rem_1.25rem] items-center gap-2 border-b border-line py-2 text-xs text-muted">
              <span />
              <span>{t('compare.test')}</span>
              <span className="text-center">{column(olderR)}</span>
              <span className="text-center">{column(newerR)}</span>
              <span />
            </div>
            {shown.map((l, i) => {
              const { h, older, newer, c, level } = l
              const tone = level === 'critical' ? 'text-status-urgent' : level === 'attention' ? 'text-status-watch' : ''
              const arrowTone = level === 'critical' ? 'text-status-urgent' : c?.trend === 'improving' ? 'text-status-ok' : c?.trend === 'worsening' ? 'text-status-watch' : 'text-muted'
              const Arrow = !c || c.trend === 'stable' || c.absoluteChange === 0 ? Minus : c.absoluteChange > 0 ? ArrowUpRight : ArrowDownRight
              return (
                <div key={h.key}>
                  {i === firstOther && firstOther > 0 && (
                    <p className="flex items-center gap-2 py-2 text-xs text-muted before:flex-1 before:border-t before:border-line after:flex-1 after:border-t after:border-line">{t('compare.otherResults')}</p>
                  )}
                  <Link to={`/records/tests/${encodeURIComponent(h.key)}`} className="grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_3.25rem_3.25rem_1.25rem] items-center gap-2 border-b border-line py-2 last:border-0">
                    <span className={tone}>
                      {level === 'critical' ? <Siren className="size-4" aria-label={t('compare.criticalLabel')} />
                        : level === 'attention' ? <AlertTriangle className="size-4" aria-label={t('compare.attentionLabel')} /> : null}
                    </span>
                    <span className={`line-clamp-2 min-w-0 text-sm leading-snug ${level === 'other' ? '' : 'font-semibold'}`}>{h.byNameOnly ? h.test.name.en : h.test.name[lang]}</span>
                    <span className="ltr-value sensitive text-center text-sm text-muted">{older ? formatNumber(older.value, lang) : '—'}</span>
                    <span className={`ltr-value sensitive text-center text-sm ${level === 'other' ? '' : `font-semibold ${tone}`}`}>{newer ? formatNumber(newer.value, lang) : '—'}</span>
                    <Arrow className={`size-4 rtl:-scale-x-100 ${arrowTone}`} aria-label={c ? t(`labs.trend.${c.trend}`) : t('compare.notInReport')} />
                  </Link>
                  {level === 'critical' && (
                    <p className="mb-2 rounded-xl bg-status-urgent-bg px-3 py-2 text-xs font-medium text-status-urgent">{t('compare.criticalNote')}</p>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-muted">{t('compare.footnote')}</p>
        </>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title={t('compare.pickTitle')}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('compare.reportA')}
            <select className={selectClass} value={a} onChange={(e) => setA(e.target.value)}>
              {reports.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('compare.reportB')}
            <select className={selectClass} value={b} onChange={(e) => setB(e.target.value)}>
              {reports.map((r) => <option key={r.id} value={r.id}>{label(r)}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setPicking(false)} className="min-h-12 rounded-xl bg-brand-700 font-medium text-white">{t('checkin.done')}</button>
        </div>
      </Sheet>
    </>
  )
}

function optionsFrom(rows: StoredResult[]): ReportOption[] {
  const map = new Map<string, ReportOption>()
  for (const r of rows) {
    if (r.laboratory_reports.collected_at && !map.has(r.report_id)) {
      map.set(r.report_id, { id: r.report_id, date: r.laboratory_reports.collected_at, lab: r.laboratory_reports.lab_name ?? null })
    }
  }
  return [...map.values()].sort((x, y) => y.date.localeCompare(x.date))
}
