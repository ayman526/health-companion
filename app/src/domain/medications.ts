// Medication schedule helpers. Pure functions; nothing here decides a dose.
// Prescription text is turned into a *proposed* schedule only where the
// directions state it explicitly; the user always confirms it (SPEC §9).

import { normalizeNumberInput, parseNumber } from './numbers'

export type Frequency = 'daily' | 'weekly' | 'every_n_days' | 'as_needed'
export type Timing = '' | 'before_meals' | 'after_meals' | 'with_meals' | 'empty_stomach' | 'bedtime' | 'morning' | 'evening'

export interface ScheduleForm {
  dose_amount: string
  dose_unit: string
  frequency: Frequency
  every_n_days: string
  days_of_week: number[]
  times_of_day: string[] // "HH:MM"
  valid_from: string // YYYY-MM-DD
  valid_to: string // '' = no end date
  supply_ends_on: string
  reminders_enabled: boolean
}

export interface ExtractedMedication {
  name_as_written?: string
  name_as_printed?: string // older extractions
  active_ingredient?: string
  strength?: string
  formulation?: string
  route?: string
  directions_as_written?: string
  dose?: string // older extractions
  frequency?: string // older extractions
  dose_amount?: string
  dose_unit?: string
  times_per_day?: string
  every_n_days?: string
  as_needed?: boolean
  duration_days?: string
  timing?: Timing
  uncertain_fields?: string[]
}

/** Clock times to start from for N doses a day. Only a starting point: the user sets their own times. */
export function suggestTimes(timesPerDay: number, timing: Timing = ''): string[] {
  if (timesPerDay <= 1) {
    if (timing === 'bedtime') return ['22:00']
    if (timing === 'evening') return ['20:00']
    return ['09:00']
  }
  const presets: Record<number, string[]> = {
    2: ['09:00', '21:00'],
    3: ['08:00', '14:00', '20:00'],
    4: ['08:00', '12:00', '16:00', '20:00'],
  }
  return presets[timesPerDay] ?? Array.from({ length: Math.min(timesPerDay, 6) }, (_, i) => `${String(6 + i * 3).padStart(2, '0')}:00`)
}

const posInt = (s?: string) => {
  const n = parseNumber(s)
  return n != null && Number.isInteger(n) && n > 0 ? n : null
}
const posNum = (s?: string) => {
  const n = parseNumber(s)
  return n != null && n > 0 ? n : null
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Proposed schedule from a prescription line. Fields not stated explicitly stay
 * empty for the user to fill in. Returns the fields the user must check.
 */
export function proposeSchedule(m: ExtractedMedication, startDate: string): { form: ScheduleForm; check: string[] } {
  const check = new Set(m.uncertain_fields ?? [])
  const perDay = posInt(m.times_per_day)
  const everyN = posInt(m.every_n_days)
  const days = posInt(m.duration_days)

  let frequency: Frequency = 'daily'
  if (m.as_needed) frequency = 'as_needed'
  else if (everyN === 7) frequency = 'weekly'
  else if (everyN && everyN > 1) frequency = 'every_n_days'

  if (!m.as_needed && !perDay && !everyN) check.add('times_per_day')
  if (!posNum(m.dose_amount)) check.add('dose_amount')
  if (frequency === 'weekly') check.add('days_of_week')

  const form: ScheduleForm = {
    dose_amount: posNum(m.dose_amount) ? String(posNum(m.dose_amount)) : '',
    dose_unit: m.dose_unit ?? '',
    frequency,
    every_n_days: frequency === 'every_n_days' && everyN ? String(everyN) : '',
    days_of_week: frequency === 'weekly' ? [new Date(`${startDate}T00:00:00Z`).getUTCDay()] : [],
    times_of_day: frequency === 'as_needed' ? [] : suggestTimes(perDay ?? 1, m.timing ?? ''),
    valid_from: startDate,
    valid_to: days ? addDays(startDate, days - 1) : '',
    supply_ends_on: '',
    reminders_enabled: frequency !== 'as_needed',
  }
  // Clock times are always the user's choice.
  if (frequency !== 'as_needed') check.add('times_of_day')
  return { form, check: [...check] }
}

export function validateSchedule(f: ScheduleForm): string[] {
  const problems: string[] = []
  if (!posNum(f.dose_amount)) problems.push('dose_amount')
  if (!f.valid_from) problems.push('valid_from')
  if (f.valid_to && f.valid_to < f.valid_from) problems.push('valid_to')
  if (f.frequency !== 'as_needed' && f.times_of_day.filter(Boolean).length === 0) problems.push('times_of_day')
  if (f.frequency === 'weekly' && f.days_of_week.length === 0) problems.push('days_of_week')
  if (f.frequency === 'every_n_days' && !(posInt(f.every_n_days) && posInt(f.every_n_days)! >= 2)) problems.push('every_n_days')
  return problems
}

/** Payload for save_medication / change_regimen. */
/**
 * Splits a unit that also carries the amount ("1 قرص", "2 tablets") into
 * amount and unit, so the amount isn't shown twice. Keeps a typed amount.
 */
export function splitDoseUnit(amount: string, unit: string): { amount: string; unit: string } {
  const m = normalizeNumberInput(unit.trim()).match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (!m) return { amount, unit: unit.trim() }
  return { amount: amount.trim() || m[1].replace(',', '.'), unit: m[2].trim() }
}

/** "1 قرص", "2 drops" - never repeating the number. */
export function formatDose(amount: number | string | null, unit: string | null): string {
  if (amount == null || amount === '') return ''
  const split = splitDoseUnit(String(amount), unit ?? '')
  return `${split.amount} ${split.unit}`.trim()
}

export function schedulePayload(f: ScheduleForm, timeZone: string) {
  const asNeeded = f.frequency === 'as_needed'
  const dose = splitDoseUnit(f.dose_amount, f.dose_unit)
  return {
    dose_amount: posNum(dose.amount),
    dose_unit: dose.unit || null,
    frequency: f.frequency,
    every_n_days: f.frequency === 'every_n_days' ? posInt(f.every_n_days) : null,
    days_of_week: f.frequency === 'weekly' ? [...f.days_of_week].sort() : null,
    times_of_day: asNeeded ? [] : [...new Set(f.times_of_day.filter(Boolean))].sort(),
    time_zone: timeZone,
    valid_to: f.valid_to || null,
    supply_ends_on: f.supply_ends_on || null,
    reminders_enabled: !asNeeded && f.reminders_enabled,
  }
}

export interface DoseLog {
  scheduled_for: string
  status: 'pending' | 'taken' | 'skipped' | 'snoozed' | 'not_recorded'
}

/** Self-reported adherence over past doses. "Not recorded" is never counted as missed. */
export function adherenceSummary(logs: DoseLog[], now = new Date()) {
  const past = logs.filter((l) => new Date(l.scheduled_for) <= now)
  const count = (s: DoseLog['status']) => past.filter((l) => l.status === s).length
  const taken = count('taken')
  const skipped = count('skipped')
  const notRecorded = count('not_recorded') + count('pending') + count('snoozed')
  const recorded = taken + skipped
  return { taken, skipped, notRecorded, total: past.length, takenOfRecorded: recorded ? Math.round((taken / recorded) * 100) : null }
}
