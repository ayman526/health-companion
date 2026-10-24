import { supabase } from './supabase'
import type { Frequency } from '../domain/medications'

export interface ScheduleRow {
  id: string
  medication_id: string
  status: string
  dose_amount: number | null
  dose_unit: string | null
  frequency: Frequency
  every_n_days: number | null
  days_of_week: number[] | null
  times_of_day: string[]
  time_zone: string
  valid_from: string
  valid_to: string | null
  supply_ends_on: string | null
  reminders_enabled: boolean
}

export interface MedicationRow {
  id: string
  brand_name: string
  active_ingredient: string | null
  strength: string | null
  formulation: string | null
  route: string | null
  prescriber: string | null
  instructions: string | null
  is_active: boolean
  document_id: string | null
  photo_path: string | null
  source: string
  created_at: string
  medication_schedules: ScheduleRow[]
}

export const MED_SELECT = 'id, brand_name, active_ingredient, strength, formulation, route, prescriber, instructions, is_active, document_id, photo_path, source, created_at, medication_schedules(*)'

export async function loadMedications(): Promise<MedicationRow[]> {
  if (!supabase) return []
  const { data } = await supabase.from('medications').select(MED_SELECT).eq('status', 'confirmed').order('brand_name')
  return ((data ?? []) as MedicationRow[]).map((m) => ({
    ...m,
    medication_schedules: m.medication_schedules.filter((s) => s.status === 'confirmed').sort((a, b) => a.valid_from.localeCompare(b.valid_from)),
  }))
}

/** The regimen in effect today (or the latest one for a stopped medication). */
export function currentSchedule(m: MedicationRow): ScheduleRow | undefined {
  const list = m.medication_schedules
  return list.find((s) => s.valid_to == null) ?? list[list.length - 1]
}

export interface TodayDose {
  id: string
  scheduled_for: string
  status: 'pending' | 'taken' | 'skipped' | 'snoozed' | 'not_recorded'
  snoozed_until: string | null
  medication_schedules: { dose_amount: number | null; dose_unit: string | null; medication_id: string; medications: { brand_name: string; strength: string | null; photo_path: string | null } }
}

/** Doses scheduled during the user's local day. */
export async function loadDosesBetween(from: Date, to: Date): Promise<TodayDose[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('medication_dose_logs')
    .select('id, scheduled_for, status, snoozed_until, medication_schedules!inner(dose_amount, dose_unit, medication_id, medications!inner(brand_name, strength, is_active, photo_path))')
    .gte('scheduled_for', from.toISOString())
    .lt('scheduled_for', to.toISOString())
    .order('scheduled_for')
  return (data ?? []) as unknown as TodayDose[]
}

export function localDayBounds(timeZone: string, date = new Date()): { start: Date; end: Date } {
  // Midnight-to-midnight in the user's zone, found by reading the zone's wall clock.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  const wallNow = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  const offset = wallNow - Math.floor(date.getTime() / 60000) * 60000
  const start = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset)
  return { start, end: new Date(start.getTime() + 864e5) }
}

export function localTime(iso: string, timeZone: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export async function logDose(id: string, status: 'taken' | 'skipped' | 'snoozed' | 'pending', snoozeMinutes?: number) {
  if (!supabase) return false
  const { error } = await supabase.rpc('log_dose', { p_dose_id: id, p_status: status, p_snooze_minutes: snoozeMinutes ?? null })
  return !error
}

/** Today's date in a time zone, YYYY-MM-DD. */
export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** A local date + "HH:MM" in a time zone, as an ISO instant. */
export function zonedDateTime(date: string, time: string, timeZone: string): string {
  const { start } = localDayBounds(timeZone, new Date(`${date}T12:00:00Z`))
  const [h, m] = time.split(':').map(Number)
  return new Date(start.getTime() + (h * 60 + m) * 60000).toISOString()
}
