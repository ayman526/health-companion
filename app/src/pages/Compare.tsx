import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDate, formatNumber } from '../lib/format'
import { loadConfirmedResults } from '../lib/labData'
import { LAB_TESTS } from '../domain/labs/catalog'
import { compare } from '../domain/labs/compare'
import { groupHistories, type StoredResult } from '../domain/labs/history'
import { measurementStatus } from '../domain/labs/rules'
import { StatusBadge, TrendLabel } from '../components/LabStatus'
import { PageHeader } from '../components/ui'

interface ReportOption {
  id: string
  date: string
  lab: string | null
}

const CATALOG_ORDER = new Map(LAB_TESTS.map((t, i) => [t.code, i]))
const selectClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm'

export function ComparePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<StoredResult[]>([])
  const [a, setA] = useState('')
  const [b, setB] = useState('')

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
      out.push({ h, older, newer, c: older && newer ? compare(h.test, older, newer) : null })
    }
    return out.sort((x, y) => (CATALOG_ORDER.get(x.h.test.code) ?? 999) - (CATALOG_ORDER.get(y.h.test.code) ?? 999) || x.h.test.name.en.localeCompare(y.h.test.name.en))
  }, [histories, a, b])

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (reports.length < 2) return (<><PageHeader title={t('compare.title')} /><p className="text-muted">{t('compare.needTwo')}</p></>)

  const label = (r: ReportOption) => `${formatDate(r.date, lang)}${r.lab ? ` · ${r.lab}` : ''}`

  return (
    <>
      <PageHeader title={t('compare.title')} subtitle={t('compare.subtitle')} />
      <div className="mb-4 grid grid-cols-2 gap-3">
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
      </div>

      {a === b ? (
        <p className="text-muted">{t('compare.pickDifferent')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lines.map(({ h, older, newer, c }) => (
            <li key={h.key} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/records/tests/${encodeURIComponent(h.key)}`} className="font-medium text-ink underline-offset-2 hover:underline">
                  {h.byNameOnly ? h.test.name.en : h.test.name[lang]}
                </Link>
                {newer && <StatusBadge status={measurementStatus(h.test, newer)} />}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                {[older, newer].map((p, i) => (
                  <div key={i}>
                    <p className="text-xs text-muted">{p ? formatDate(p.collectedAt, lang) : '—'}</p>
                    <p className="font-semibold"><span className="ltr-value sensitive">{p ? `${formatNumber(p.value, lang)} ${p.unit}` : t('compare.notInReport')}</span></p>
                  </div>
                ))}
              </div>
              {c && (
                <p className="mt-2 text-sm">
                  <TrendLabel trend={c.trend} />{' · '}
                  <span className="ltr-value sensitive text-muted">
                    {c.absoluteChange > 0 ? '+' : ''}{formatNumber(c.absoluteChange, lang)} {c.current.unit}
                    {c.percentChange != null && ` (${c.percentChange > 0 ? '+' : ''}${formatNumber(c.percentChange, lang, 1)}%)`}
                  </span>
                </p>
              )}
              {c && h.byNameOnly && <p className="mt-1 text-xs text-muted">{t('report.byNameOnly')}</p>}
            </li>
          ))}
        </ul>
      )}
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
