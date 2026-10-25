import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HeartPulse } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { loadVitals } from '../../lib/daily'
import { formatNumber } from '../../lib/format'
import { weeklySummary, type DoseLite, type WeeklySummary } from '../../domain/weekly'
import type { VitalReading } from '../../domain/vitals'

/** A tiny line of the last readings, oldest to newest; decoration only (values are in the tile). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-6" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${20 - ((v - min) / span) * 16}`).join(' ')
  return (
    <svg viewBox="0 0 100 22" preserveAspectRatio="none" className="h-6 w-full" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--color-brand-700)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Tile({ to, label, value, unit, foot, children }: { to: string; label: string; value: string; unit?: string; foot: string; children?: React.ReactNode }) {
  return (
    <Link to={to} className="flex flex-col rounded-2xl border border-line bg-surface p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-0.5 text-lg font-semibold"><span className="ltr-value sensitive">{value}</span>{unit && <span className="text-xs font-normal text-muted"> {unit}</span>}</span>
      <span className="sensitive my-1 block">{children}</span>
      <span className="text-xs text-muted"><span className="sensitive">{foot}</span></span>
    </Link>
  )
}

const arrow = (n: number) => (n > 0 ? '↑' : n < 0 ? '↓' : '→')

/** "This week": up to four tiles, only for what the person actually tracks. */
export function WeekTiles({ profileId, max = 4 }: { profileId: string; max?: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [vitals, setVitals] = useState<VitalReading[]>([])

  useEffect(() => {
    if (!supabase) return
    const since = new Date(Date.now() - 8 * 86_400_000).toISOString()
    void Promise.all([
      supabase.from('medication_dose_logs').select('scheduled_for, status').gte('scheduled_for', since),
      loadVitals(15),
    ]).then(([doses, v]) => {
      setVitals(v)
      setSummary(weeklySummary((doses.data ?? []) as DoseLite[], v, []))
    })
  }, [profileId])

  if (!summary) return null
  const series = (pick: (r: VitalReading) => number | null, filter: (r: VitalReading) => boolean) =>
    vitals.filter(filter).map(pick).filter((v): v is number => v != null).slice(0, 10).reverse()
  const change = (n: number | null, unit: string) => (n == null ? t('home.thisWeekOnly') : t('home.vsLastWeek', { change: `${arrow(n)} ${formatNumber(Math.abs(n), lang, 1)}${unit}` }))

  const tiles = [
    summary.bp && (
      <Tile key="bp" to="/vitals?kind=blood_pressure" label={t('vitals.kinds.blood_pressure')} value={`${summary.bp.systolic}/${summary.bp.diastolic}`} foot={change(summary.bp.change, '')}>
        <Sparkline values={series((r) => r.systolic, (r) => r.kind === 'blood_pressure')} />
      </Tile>
    ),
    summary.fastingGlucose && (
      <Tile key="glucose" to="/vitals?kind=glucose" label={t('home.fastingSugar')} value={String(summary.fastingGlucose.value)} unit="mg/dL" foot={change(summary.fastingGlucose.change, '')}>
        <Sparkline values={series((r) => r.glucose_mg_dl, (r) => r.kind === 'glucose' && r.glucose_context === 'fasting')} />
      </Tile>
    ),
    summary.doses && (
      <Tile key="doses" to="/medications" label={t('weekly.doses')} value={`${summary.doses.taken}/${summary.doses.due}`} foot={t('home.dosesTaken')}>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line">
          <span className="block h-full rounded-full bg-brand-700" style={{ width: `${Math.round((summary.doses.taken / summary.doses.due) * 100)}%` }} />
        </span>
      </Tile>
    ),
    summary.weight && (
      <Tile key="weight" to="/vitals?kind=weight" label={t('vitals.kinds.weight')} value={formatNumber(summary.weight.latest, lang, 1)} unit="kg" foot={change(summary.weight.change, ' kg')}>
        <Sparkline values={series((r) => r.weight_kg, (r) => r.kind === 'weight')} />
      </Tile>
    ),
  ].filter(Boolean).slice(0, max)

  return (
    <section>
      <h2 className="mb-2 font-semibold">{t('weekly.title')}</h2>
      {tiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">{tiles}</div>
      ) : (
        <Link to="/vitals" className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
          <HeartPulse className="size-5 shrink-0 text-brand-700" aria-hidden /> {t('home.weekEmpty')}
        </Link>
      )}
    </section>
  )
}
