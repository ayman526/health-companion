import { describe, expect, it } from 'vitest'
import { assessBloodPressure, assessBmi, assessGlucose, assessHeartRate, assessOxygen, assessTemperature, bmi, bpAverage, cToF, fToC, mgToMmol, mmolToMg, type VitalReading } from './vitals'

describe('blood pressure categories (ACC/AHA, adults)', () => {
  it.each([
    [118, 76, 'bp_normal', 'ok'],
    [124, 78, 'bp_elevated', 'watch'],
    [132, 78, 'bp_stage1', 'watch'],
    [126, 84, 'bp_stage1', 'watch'],
    [142, 88, 'bp_stage2', 'follow_up'],
    [138, 92, 'bp_stage2', 'follow_up'],
    [182, 100, 'bp_severe', 'urgent'],
    [170, 121, 'bp_severe', 'urgent'],
    [85, 55, 'bp_low', 'watch'],
  ])('%i/%i is %s', (s, d, category, level) => {
    expect(assessBloodPressure(s, d, 45)).toMatchObject({ category, level })
  })
  it('gives no adult category for children', () => {
    expect(assessBloodPressure(130, 85, 12)).toBeNull()
  })
  it('treats exactly 180/120 as stage 2, not severe', () => {
    expect(assessBloodPressure(180, 120, 60)?.category).toBe('bp_stage2')
  })
})

describe('blood sugar (ADA)', () => {
  it('flags low and very low for everyone', () => {
    expect(assessGlucose(65, 'random', false)).toMatchObject({ category: 'glucose_low', level: 'follow_up' })
    expect(assessGlucose(50, 'fasting', true)).toMatchObject({ category: 'glucose_very_low', level: 'urgent' })
  })
  it('uses diabetes targets before and after meals', () => {
    expect(assessGlucose(125, 'fasting', true).category).toBe('glucose_in_target')
    expect(assessGlucose(140, 'before_meal', true).category).toBe('glucose_above_target')
    expect(assessGlucose(170, 'after_meal', true).category).toBe('glucose_in_target')
    expect(assessGlucose(190, 'after_meal', true).category).toBe('glucose_above_target')
  })
  it('uses general fasting ranges without diabetes', () => {
    expect(assessGlucose(92, 'fasting', false).category).toBe('glucose_typical')
    expect(assessGlucose(110, 'fasting', false).category).toBe('glucose_fasting_raised')
    expect(assessGlucose(130, 'fasting', false).category).toBe('glucose_fasting_high')
  })
  it('converts mmol/L', () => {
    expect(mmolToMg(5.5)).toBe(99)
    expect(mgToMmol(180)).toBe(10)
  })
})

describe('weight', () => {
  it('computes BMI and its WHO category for adults only', () => {
    expect(bmi(80, 180)).toBe(24.7)
    expect(assessBmi(24.7, 40)?.category).toBe('bmi_healthy')
    expect(assessBmi(31, 40)?.category).toBe('bmi_obesity')
    expect(assessBmi(31, 15)).toBeNull()
  })
})

describe('averages', () => {
  const now = Date.parse('2026-10-25T12:00:00Z')
  const r = (daysAgo: number, s: number, d: number): VitalReading => ({
    id: String(daysAgo), kind: 'blood_pressure', measured_at: new Date(now - daysAgo * 86_400_000).toISOString(),
    systolic: s, diastolic: d, pulse: null, glucose_mg_dl: null, glucose_context: null, weight_kg: null, note: null,
  })
  it('averages this week and last week separately', () => {
    const list = [r(1, 140, 90), r(3, 130, 80), r(9, 150, 95)]
    expect(bpAverage(list, 7, now)).toEqual({ systolic: 135, diastolic: 85, count: 2 })
    expect(bpAverage(list, 7, now, 7)).toEqual({ systolic: 150, diastolic: 95, count: 1 })
    expect(bpAverage([], 7, now)).toBeNull()
  })
})

describe('heart rate, oxygen and temperature', () => {
  it('uses the adult resting heart rate range', () => {
    expect(assessHeartRate(72, 40)?.category).toBe('hr_normal')
    expect(assessHeartRate(52, 40)?.category).toBe('hr_low')
    expect(assessHeartRate(110, 40)?.category).toBe('hr_high')
    expect(assessHeartRate(110, 6)).toBeNull()
  })
  it('follows MedlinePlus pulse oximeter thresholds', () => {
    expect(assessOxygen(97)).toMatchObject({ category: 'spo2_normal', level: 'ok' })
    expect(assessOxygen(94)).toMatchObject({ category: 'spo2_borderline', level: 'watch' })
    expect(assessOxygen(92)).toMatchObject({ category: 'spo2_low', level: 'follow_up' })
    expect(assessOxygen(88)).toMatchObject({ category: 'spo2_very_low', level: 'urgent' })
  })
  it('flags fever, very high fever, babies and low temperature', () => {
    expect(assessTemperature(37.2, 30).category).toBe('temp_normal')
    expect(assessTemperature(38.0, 30)).toMatchObject({ category: 'temp_fever', level: 'watch' })
    expect(assessTemperature(40.1, 30).category).toBe('temp_very_high')
    expect(assessTemperature(38.1, 0)).toMatchObject({ category: 'temp_fever_baby', level: 'urgent' })
    expect(assessTemperature(34.6, 70)).toMatchObject({ category: 'temp_low', level: 'urgent' })
  })
  it('converts Fahrenheit', () => {
    expect(cToF(38)).toBe(100.4)
    expect(fToC(100.4)).toBe(38)
  })
})
