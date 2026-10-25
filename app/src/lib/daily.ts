// Daily health data: home readings (blood pressure, blood sugar, weight),
// daily check-ins, and the reminders that prompt for them.
import { supabase } from './supabase'
import { zonedDateTime } from './medications'
import type { GlucoseContext, VitalKind, VitalReading } from '../domain/vitals'

const VITAL_SELECT = 'id, kind, measured_at, systolic, diastolic, pulse, glucose_mg_dl, glucose_context, weight_kg, note'

/** Readings from the last `days` days, newest first. */
export async function loadVitals(days = 120): Promise<VitalReading[]> {
  if (!supabase) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data } = await supabase.from('vital_readings').select(VITAL_SELECT).gte('measured_at', since).order('measured_at', { ascending: false }).limit(1000)
  return (data ?? []) as VitalReading[]
}

export type NewReading =
  | { kind: 'blood_pressure'; systolic: number; diastolic: number; pulse: number | null }
  | { kind: 'glucose'; glucose_mg_dl: number; glucose_context: GlucoseContext }
  | { kind: 'weight'; weight_kg: number }

export async function addVital(profileId: string, reading: NewReading, measuredAt: string, note: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('vital_readings').insert({ profile_id: profileId, measured_at: measuredAt, note: note.trim() || null, ...reading })
  return !error
}

export async function deleteVital(id: string): Promise<boolean> {
  if (!supabase) return false
  return !(await supabase.from('vital_readings').delete().eq('id', id)).error
}

export interface CheckIn {
  day: string
  mood: number | null
  sleep_hours: number | null
  symptoms: string[]
  note: string | null
}

export async function loadCheckIns(days = 60): Promise<CheckIn[]> {
  if (!supabase) return []
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const { data } = await supabase.from('daily_checkins').select('day, mood, sleep_hours, symptoms, note').gte('day', since).order('day', { ascending: false })
  return (data ?? []) as CheckIn[]
}

export async function saveCheckIn(profileId: string, c: CheckIn): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('daily_checkins').upsert({ profile_id: profileId, ...c }, { onConflict: 'profile_id,day' })
  return !error
}

/** The repeating reminder of a given kind (reading check or weekly summary), if set. */
export async function findRepeatingReminder(kind: 'vital_check' | 'weekly_summary') {
  if (!supabase) return null
  const { data } = await supabase.from('reminders').select('id, due_at, time_zone').eq('kind', kind).eq('status', 'active').limit(1).maybeSingle()
  return data
}

/**
 * Turns a repeating reminder on (daily for readings, weekly on Sunday for the summary) or off.
 * Notifications say only "Time to log today's reading" / "Your weekly summary is ready".
 */
export async function setRepeatingReminder(profileId: string, kind: 'vital_check' | 'weekly_summary', on: boolean, title: string, time: string, timeZone: string): Promise<boolean> {
  if (!supabase) return false
  const existing = await findRepeatingReminder(kind)
  if (!on) return existing ? !(await supabase.from('reminders').update({ status: 'cancelled' }).eq('id', existing.id)).error : true
  const now = new Date()
  const date = new Date(now)
  if (kind === 'weekly_summary') date.setDate(now.getDate() + ((7 - now.getDay()) % 7)) // next Sunday (today if Sunday)
  let due = zonedDateTime(date.toISOString().slice(0, 10), time, timeZone)
  if (Date.parse(due) <= now.getTime()) {
    date.setDate(date.getDate() + (kind === 'weekly_summary' ? 7 : 1))
    due = zonedDateTime(date.toISOString().slice(0, 10), time, timeZone)
  }
  const fields = { kind, title, due_at: due, next_fire_at: due, time_zone: timeZone, repeat_rule: kind === 'weekly_summary' ? 'weekly' : 'daily', status: 'active' as const }
  const { error } = existing
    ? await supabase.from('reminders').update({ ...fields, snoozed_until: null, last_notified_at: null }).eq('id', existing.id)
    : await supabase.from('reminders').insert({ profile_id: profileId, ...fields })
  return !error
}

export type { VitalKind }
