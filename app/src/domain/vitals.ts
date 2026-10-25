// Home readings: blood pressure, blood sugar and weight. Categories follow
// published guidelines (SPEC.md §6 style: deterministic, sourced, no AI).
// One reading never diagnoses anything; the app says so and shows averages.
import type { SourceId } from './labs/sources'

export type VitalKind = 'blood_pressure' | 'glucose' | 'weight' | 'heart_rate' | 'oxygen' | 'temperature'
export type GlucoseContext = 'fasting' | 'before_meal' | 'after_meal' | 'bedtime' | 'random'
export type Level = 'ok' | 'watch' | 'follow_up' | 'urgent'

export interface VitalReading {
  id: string
  kind: VitalKind
  measured_at: string
  systolic: number | null
  diastolic: number | null
  pulse: number | null
  glucose_mg_dl: number | null
  glucose_context: GlucoseContext | null
  weight_kg: number | null
  spo2?: number | null
  temperature_c?: number | null
  note: string | null
}

export interface Assessment {
  category: string // translation key under vitals.categories
  level: Level
  sources: SourceId[]
}

export const MG_PER_MMOL = 18.016
export const mmolToMg = (mmol: number) => Math.round(mmol * MG_PER_MMOL)
export const mgToMmol = (mg: number) => Math.round((mg / MG_PER_MMOL) * 10) / 10

/** ACC/AHA adult categories. Under 18: no category (children use different, age-based tables). */
export function assessBloodPressure(systolic: number, diastolic: number, age: number | null): Assessment | null {
  if (age != null && age < 18) return null
  const sources: SourceId[] = ['aha_bp']
  if (systolic > 180 || diastolic > 120) return { category: 'bp_severe', level: 'urgent', sources }
  if (systolic >= 140 || diastolic >= 90) return { category: 'bp_stage2', level: 'follow_up', sources }
  if (systolic >= 130 || diastolic >= 80) return { category: 'bp_stage1', level: 'watch', sources }
  if (systolic >= 120) return { category: 'bp_elevated', level: 'watch', sources }
  if (systolic < 90 || diastolic < 60) return { category: 'bp_low', level: 'watch', sources }
  return { category: 'bp_normal', level: 'ok', sources }
}

/**
 * ADA targets for people with diabetes (before meals 80–130, after meals <180);
 * without diabetes, fasting 70–99 is typical and 100+ is worth discussing.
 * Low blood sugar thresholds apply to everyone.
 */
export function assessGlucose(mg: number, context: GlucoseContext, hasDiabetes: boolean): Assessment {
  const sources: SourceId[] = hasDiabetes ? ['ada_glucose_targets'] : ['ada2025_dx', 'ada_glucose_targets']
  if (mg < 54) return { category: 'glucose_very_low', level: 'urgent', sources: ['ada_glucose_targets'] }
  if (mg < 70) return { category: 'glucose_low', level: 'follow_up', sources: ['ada_glucose_targets'] }
  if (mg >= 300) return { category: 'glucose_very_high', level: 'follow_up', sources }
  const afterMeal = context === 'after_meal'
  if (hasDiabetes) {
    if (afterMeal) return mg < 180 ? { category: 'glucose_in_target', level: 'ok', sources } : { category: 'glucose_above_target', level: 'watch', sources }
    if (context === 'fasting' || context === 'before_meal') {
      return mg <= 130 ? { category: 'glucose_in_target', level: 'ok', sources } : { category: 'glucose_above_target', level: 'watch', sources }
    }
    return mg < 180 ? { category: 'glucose_in_target', level: 'ok', sources } : { category: 'glucose_above_target', level: 'watch', sources }
  }
  if (context === 'fasting') {
    if (mg < 100) return { category: 'glucose_typical', level: 'ok', sources }
    return { category: mg < 126 ? 'glucose_fasting_raised' : 'glucose_fasting_high', level: mg < 126 ? 'watch' : 'follow_up', sources }
  }
  return mg < 200 ? { category: 'glucose_typical', level: 'ok', sources } : { category: 'glucose_high_random', level: 'follow_up', sources }
}

/** Resting heart rate, adults (AHA): 60–100 is normal; lower can be normal for fit people or on some medicines. */
export function assessHeartRate(bpm: number, age: number | null): Assessment | null {
  if (age != null && age < 18) return null
  const sources: SourceId[] = ['aha_heart_rate']
  if (bpm > 100) return { category: 'hr_high', level: 'watch', sources }
  if (bpm < 60) return { category: 'hr_low', level: 'watch', sources }
  return { category: 'hr_normal', level: 'ok', sources }
}

/** Blood oxygen from a pulse oximeter (NHS thresholds). */
export function assessOxygen(spo2: number): Assessment {
  const sources: SourceId[] = ['nhs_pulse_oximeter']
  if (spo2 <= 92) return { category: 'spo2_low', level: 'urgent', sources }
  if (spo2 <= 94) return { category: 'spo2_borderline', level: 'follow_up', sources }
  return { category: 'spo2_normal', level: 'ok', sources }
}

/** Body temperature in °C (NHS): fever from 38, very high from 40, below 35 can be hypothermia. */
export function assessTemperature(c: number, age: number | null): Assessment {
  const sources: SourceId[] = ['nhs_fever']
  if (c < 35) return { category: 'temp_low', level: 'urgent', sources }
  if (c >= 38 && age === 0) return { category: 'temp_fever_baby', level: 'urgent', sources }
  if (c >= 40) return { category: 'temp_very_high', level: 'follow_up', sources }
  if (c >= 38) return { category: 'temp_fever', level: 'watch', sources }
  return { category: 'temp_normal', level: 'ok', sources }
}

export const cToF = (c: number) => Math.round((c * 9 / 5 + 32) * 10) / 10
export const fToC = (f: number) => Math.round(((f - 32) * 5 / 9) * 10) / 10

export function bmi(weightKg: number, heightCm: number | null): number | null {
  if (!heightCm) return null
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
}

export function assessBmi(value: number, age: number | null): Assessment | null {
  if (age != null && age < 18) return null
  const sources: SourceId[] = ['who_bmi']
  if (value < 18.5) return { category: 'bmi_under', level: 'watch', sources }
  if (value < 25) return { category: 'bmi_healthy', level: 'ok', sources }
  if (value < 30) return { category: 'bmi_over', level: 'watch', sources }
  return { category: 'bmi_obesity', level: 'watch', sources }
}

const DAY = 86_400_000

/** Average of readings in [now - days, now), rounded; null when there are none. */
export function average(readings: VitalReading[], pick: (r: VitalReading) => number | null, days: number, now = Date.now(), offsetDays = 0) {
  const end = now - offsetDays * DAY
  const start = end - days * DAY
  const values = readings
    .filter((r) => { const t = Date.parse(r.measured_at); return t >= start && t < end })
    .map(pick)
    .filter((v): v is number => v != null)
  if (values.length === 0) return null
  return { value: Math.round(values.reduce((a, b) => a + b, 0) / values.length), count: values.length }
}

/** Blood pressure average over a period, both numbers. */
export function bpAverage(readings: VitalReading[], days: number, now = Date.now(), offsetDays = 0) {
  const bp = readings.filter((r) => r.kind === 'blood_pressure')
  const sys = average(bp, (r) => r.systolic, days, now, offsetDays)
  const dia = average(bp, (r) => r.diastolic, days, now, offsetDays)
  return sys && dia ? { systolic: sys.value, diastolic: dia.value, count: sys.count } : null
}

/** Which glucose context fits the time of day, as a starting suggestion. */
export function suggestedGlucoseContext(hour: number): GlucoseContext {
  if (hour >= 4 && hour < 10) return 'fasting'
  if (hour >= 21 || hour < 4) return 'bedtime'
  return 'before_meal'
}

export interface PersonFacts { age: number | null; heightCm: number | null; hasDiabetes: boolean }

/** Category of one reading for this person, or null when no adult category applies. */
export function assessReading(r: VitalReading, p: PersonFacts): Assessment | null {
  if (r.kind === 'blood_pressure') return assessBloodPressure(r.systolic!, r.diastolic!, p.age)
  if (r.kind === 'glucose') return assessGlucose(r.glucose_mg_dl!, r.glucose_context ?? 'random', p.hasDiabetes)
  if (r.kind === 'heart_rate') return assessHeartRate(r.pulse!, p.age)
  if (r.kind === 'oxygen') return assessOxygen(r.spo2!)
  if (r.kind === 'temperature') return assessTemperature(r.temperature_c!, p.age)
  const index = bmi(r.weight_kg!, p.heightCm)
  return index != null ? assessBmi(index, p.age) : null
}
