import { describe, expect, it } from 'vitest'
import { weeklySummary, type DoseLite } from './weekly'
import type { VitalReading } from './vitals'

const now = Date.parse('2026-10-25T18:00:00Z')
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString()
const bp = (d: number, s: number, di: number): VitalReading => ({ id: `${d}`, kind: 'blood_pressure', measured_at: ago(d), systolic: s, diastolic: di, pulse: null, glucose_mg_dl: null, glucose_context: null, weight_kg: null, note: null })
const w = (d: number, kg: number): VitalReading => ({ ...bp(d, 0, 0), id: `w${d}`, kind: 'weight', systolic: null, diastolic: null, weight_kg: kg })

describe('weekly summary', () => {
  it('counts doses taken out of those due this week, ignoring pending ones', () => {
    const doses: DoseLite[] = [
      { scheduled_for: ago(1), status: 'taken' }, { scheduled_for: ago(2), status: 'taken' },
      { scheduled_for: ago(3), status: 'not_recorded' }, { scheduled_for: ago(0.1), status: 'pending' },
      { scheduled_for: ago(9), status: 'taken' },
    ]
    expect(weeklySummary(doses, [], [], now).doses).toEqual({ taken: 2, due: 3 })
  })
  it('compares blood pressure and weight with last week', () => {
    const s = weeklySummary([], [bp(1, 130, 84), bp(2, 134, 86), bp(9, 140, 90), w(1, 80.4), w(10, 81)], [], now)
    expect(s.bp).toEqual({ systolic: 132, diastolic: 85, change: -8 })
    expect(s.weight).toEqual({ latest: 80.4, change: -0.6 })
  })
  it('summarises check-ins: count, sleep and most frequent symptom', () => {
    const s = weeklySummary([], [], [
      { day: '2026-10-24', mood: 4, sleep_hours: 6, symptoms: ['headache'] },
      { day: '2026-10-23', mood: 3, sleep_hours: 7, symptoms: ['headache', 'tiredness'] },
      { day: '2026-10-10', mood: 2, sleep_hours: 4, symptoms: ['pain'] },
    ], now)
    expect(s).toMatchObject({ checkIns: 2, sleepAvg: 6.5, topSymptom: { key: 'headache', days: 2 }, isEmpty: false })
  })
  it('is empty with no data', () => {
    expect(weeklySummary([], [], [], now).isEmpty).toBe(true)
  })
})
