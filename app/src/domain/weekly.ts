// The weekly summary: plain counts and averages from the person's own data,
// this week compared with last week. No AI, no judgement words beyond up/down.
import { average, bpAverage, type VitalReading } from './vitals'

export interface DoseLite { scheduled_for: string; status: 'pending' | 'taken' | 'skipped' | 'snoozed' | 'not_recorded' }
export interface CheckInLite { day: string; mood: number | null; sleep_hours: number | null; symptoms: string[] }

export interface WeeklySummary {
  doses: { taken: number; due: number } | null
  bp: { systolic: number; diastolic: number; change: number | null } | null
  fastingGlucose: { value: number; change: number | null } | null
  weight: { latest: number; change: number | null } | null
  checkIns: number
  sleepAvg: number | null
  topSymptom: { key: string; days: number } | null
  isEmpty: boolean
}

const DAY = 86_400_000

export function weeklySummary(doses: DoseLite[], vitals: VitalReading[], checkIns: CheckInLite[], now = Date.now()): WeeklySummary {
  const weekAgo = now - 7 * DAY
  const past = doses.filter((d) => { const t = Date.parse(d.scheduled_for); return t >= weekAgo && t < now && d.status !== 'pending' && d.status !== 'snoozed' })
  const doseStats = past.length ? { taken: past.filter((d) => d.status === 'taken').length, due: past.length } : null

  const bp = bpAverage(vitals, 7, now)
  const bpPrev = bpAverage(vitals, 7, now, 7)
  const glucose = vitals.filter((r) => r.kind === 'glucose' && r.glucose_context === 'fasting')
  const g = average(glucose, (r) => r.glucose_mg_dl, 7, now)
  const gPrev = average(glucose, (r) => r.glucose_mg_dl, 7, now, 7)
  const weights = vitals.filter((r) => r.kind === 'weight').sort((a, b) => b.measured_at.localeCompare(a.measured_at))
  const latestW = weights.find((r) => Date.parse(r.measured_at) >= weekAgo)
  const prevW = weights.find((r) => Date.parse(r.measured_at) < weekAgo)

  const weekDays = checkIns.filter((c) => Date.parse(`${c.day}T12:00:00Z`) >= weekAgo)
  const sleeps = weekDays.map((c) => c.sleep_hours).filter((h): h is number => h != null)
  const counts = new Map<string, number>()
  for (const c of weekDays) for (const s of c.symptoms) counts.set(s, (counts.get(s) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]

  const summary: WeeklySummary = {
    doses: doseStats,
    bp: bp ? { systolic: bp.systolic, diastolic: bp.diastolic, change: bpPrev ? bp.systolic - bpPrev.systolic : null } : null,
    fastingGlucose: g ? { value: g.value, change: gPrev ? g.value - gPrev.value : null } : null,
    weight: latestW ? { latest: latestW.weight_kg!, change: prevW ? Math.round((latestW.weight_kg! - prevW.weight_kg!) * 10) / 10 : null } : null,
    checkIns: weekDays.length,
    sleepAvg: sleeps.length ? Math.round((sleeps.reduce((a, b) => a + b, 0) / sleeps.length) * 10) / 10 : null,
    topSymptom: top ? { key: top[0], days: top[1] } : null,
    isEmpty: false,
  }
  summary.isEmpty = !summary.doses && !summary.bp && !summary.fastingGlucose && !summary.weight && summary.checkIns === 0
  return summary
}
