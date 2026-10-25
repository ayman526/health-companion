import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, Pill } from 'lucide-react'
import { formatDate, formatNumber } from '../lib/format'
import { loadHistories } from '../lib/labData'
import { compare } from '../domain/labs/compare'
import type { TestHistory } from '../domain/labs/history'
import { measurementStatus } from '../domain/labs/rules'
import { StatusBadge, TrendLabel } from '../components/LabStatus'
import { TrendChart } from '../components/TrendChart'
import { PageHeader } from '../components/ui'
import { TestInfoPanel } from '../components/TestInfoPanel'
import { supabase } from '../lib/supabase'
import { loadMedications, todayIn } from '../lib/medications'
import { useAuth } from '../auth/AuthProvider'
import { CATEGORY_ICON, changesBetween, type LifestyleEvent, type PeriodChange } from '../domain/lifestyle'

export function TestHistoryPage() {
  const { testKey } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<TestHistory | null>(null)
  const [changes, setChanges] = useState<PeriodChange[]>([])
  const { profile } = useAuth()

  useEffect(() => {
    void (async () => {
      const h = (await loadHistories()).get(decodeURIComponent(testKey ?? '')) ?? null
      setHistory(h)
      setLoading(false)
      const first = h?.series.points[0]?.collectedAt
      if (!first || !supabase) return
      const [meds, { data: life }] = await Promise.all([loadMedications(), supabase.from('lifestyle_events').select('id, category, title, details, started_on, ended_on')])
      setChanges(changesBetween(first, todayIn(profile?.time_zone ?? 'Africa/Cairo'),
        meds.map((m) => ({ name: m.brand_name, active: m.is_active, regimens: m.medication_schedules.map((r) => ({ from: r.valid_from, to: r.valid_to })) })),
        (life ?? []) as LifestyleEvent[]))
    })()
  }, [testKey, profile?.time_zone])

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (!history) return <p className="text-muted">{t('history.notFound')}</p>

  const { test, series, byNameOnly } = history
  const points = series.points
  const latest = points[points.length - 1]
  const reportOf = new Map(history.rows.map((r) => [r.id, r]))
  const excluded = series.excluded
    .filter((e) => e.reason === 'unit_not_convertible')
    .map((e) => reportOf.get(e.resultId))
    .filter((r) => !!r)

  return (
    <>
      <PageHeader title={byNameOnly ? test.name.en : test.name[lang]} subtitle={byNameOnly ? t('report.byNameOnly') : undefined} />

      {latest ? (
        <>
          <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">{t('history.latest', { date: formatDate(latest.collectedAt, lang) })}</p>
                <p className="text-2xl font-semibold"><span className="ltr-value sensitive">{formatNumber(latest.value, lang)} {latest.unit}</span></p>
              </div>
              <StatusBadge status={measurementStatus(test, latest)} />
            </div>
            <div className="mt-4">
              <TrendChart
                points={points.map((p) => ({ id: p.resultId, date: p.collectedAt, value: p.value, status: measurementStatus(test, p) }))}
                unit={latest.unit}
                refLow={latest.refLow}
                refHigh={latest.refHigh}
                onSelect={(id) => {
                  const p = points.find((x) => x.resultId === id)
                  if (p) navigate(`/records/reports/${p.reportId}`)
                }}
              />
            </div>
            {!byNameOnly && <TestInfoPanel test={test} status={measurementStatus(test, latest)} />}
          </section>

          {changes.length > 0 && (
            <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
              <h2 className="text-sm font-semibold">{t('history.changesTitle')}</h2>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                {changes.map((c, i) => {
                  const Icon = c.category ? CATEGORY_ICON[c.category] : Pill
                  return (
                    <li key={i} className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-brand-700" aria-hidden />
                      <span className="w-24 shrink-0 text-xs text-muted">{formatDate(c.date, lang)}</span>
                      <span>{t(`history.changeKinds.${c.kind}`, { name: c.label })}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-xs text-muted">{t('history.changesNote')}</p>
            </section>
          )}

          <h2 className="mb-2 text-sm font-semibold text-muted">{t('history.allResults', { count: points.length })}</h2>
          <ul className="flex flex-col gap-2">
            {[...points].reverse().map((p, i, arr) => {
              const prev = arr[i + 1]
              const c = prev ? compare(test, prev, p) : null
              return (
                <li key={p.resultId}>
                  <Link to={`/records/reports/${p.reportId}`} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-muted">{formatDate(p.collectedAt, lang)}{reportOf.get(p.resultId)?.laboratory_reports.lab_name ? ` · ${reportOf.get(p.resultId)!.laboratory_reports.lab_name}` : ''}</span>
                      <span className="block font-semibold"><span className="ltr-value sensitive">{formatNumber(p.value, lang)} {p.unit}</span></span>
                      {c && <span className="block text-xs"><TrendLabel trend={c.trend} />{c.percentChange != null && <span className="ltr-value sensitive text-muted"> ({c.percentChange > 0 ? '+' : ''}{formatNumber(c.percentChange, lang, 1)}%)</span>}</span>}
                    </span>
                    <StatusBadge status={measurementStatus(test, p)} />
                    <ChevronRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="text-muted">{t('history.noNumeric')}</p>
      )}

      {excluded.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('history.notCompared')}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {excluded.map((r) => (
              <li key={r!.id}>
                <Link to={`/records/reports/${r!.report_id}`} className="block rounded-xl border border-line bg-surface px-4 py-2">
                  {r!.laboratory_reports.collected_at && formatDate(r!.laboratory_reports.collected_at, lang)} · <span className="ltr-value sensitive">{r!.value_numeric} {r!.unit}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-6 text-xs text-muted">{t('report.sourceNote')}</p>
    </>
  )
}
