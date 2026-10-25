import { supabase } from './supabase'
import { loadConfirmedResults } from './labData'
import { loadMedications, zonedDateTime } from './medications'
import { suggestCheckups, type CheckupSuggestion } from '../domain/testSuggestions'
import { loadProfileDetails } from './profile'
import { ageOn, bmi } from '../domain/profileOptions'
import { track } from './usage'

export async function loadSuggestions(today: string): Promise<CheckupSuggestion[]> {
  if (!supabase) return []
  const [rows, meds, conditions, reminders, decisions, details, lastBp] = await Promise.all([
    loadConfirmedResults(),
    loadMedications(),
    supabase.from('medical_conditions').select('name').eq('status', 'confirmed').eq('is_family_history', false),
    supabase.from('reminders').select('test_codes').eq('status', 'active'),
    supabase.from('suggestion_decisions').select('suggestion_key, decision, done_on'),
    loadProfileDetails(),
    supabase.from('vital_readings').select('measured_at').eq('kind', 'blood_pressure').order('measured_at', { ascending: false }).limit(1),
  ])
  const latest = new Map<string, { date: string; value: number }>()
  for (const r of rows) {
    const date = r.laboratory_reports.collected_at
    if (!r.test_code || r.value_numeric == null || !date) continue
    const cur = latest.get(r.test_code)
    if (!cur || date > cur.date) latest.set(r.test_code, { date, value: r.value_numeric })
  }
  return suggestCheckups({
    today,
    latest,
    medications: meds.map((m) => ({ name: m.brand_name, ingredient: m.active_ingredient, active: m.is_active, regimenStarts: m.medication_schedules.map((s) => s.valid_from) })),
    conditions: (conditions.data ?? []).map((c) => c.name),
    remindedTests: new Set((reminders.data ?? []).flatMap((r) => r.test_codes ?? [])),
    decided: new Set((decisions.data ?? []).map((d) => d.suggestion_key)),
    person: details.profile ? {
      age: ageOn(details.profile.date_of_birth, today), sex: details.profile.sex, smoking: details.profile.smoking_status,
      bmi: bmi(details.profile.height_cm, details.profile.weight_kg),
    } : undefined,
    lastBpReading: lastBp.data?.[0]?.measured_at.slice(0, 10) ?? null,
    done: doneMap(decisions.data ?? []),
  })
}

// "Already done" records use the key done:<rule>:<months|once>, so they never match a suggestion key.
function doneMap(rows: { suggestion_key: string; decision: string; done_on: string | null }[]) {
  const map = new Map<string, { date: string; months: number | null }>()
  for (const r of rows) {
    const [tag, rule, months] = r.suggestion_key.split(':')
    if (tag !== 'done' || r.decision !== 'done' || !r.done_on) continue
    const prev = map.get(rule)
    if (!prev || r.done_on > prev.date) map.set(rule, { date: r.done_on, months: months === 'once' ? null : Number(months) })
  }
  return map
}

/** Records that the person already had this checkup (and, for some, which test), so the next one is timed from then. */
export async function markSuggestionDone(profileId: string, s: CheckupSuggestion, date: string, months: number | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('suggestion_decisions').upsert({
    profile_id: profileId, suggestion_key: `done:${s.rule}:${months ?? 'once'}:${date}`, decision: 'done', done_on: date,
  })
  if (!error) track('checkup_done')
  return !error
}

/** Turns a suggestion into a reminder on the date the user chose. */
export async function acceptSuggestion(profileId: string, s: CheckupSuggestion, title: string, date: string, timeZone: string): Promise<boolean> {
  if (!supabase) return false
  const due = zonedDateTime(date, '09:00', timeZone)
  const { error } = await supabase.from('reminders').insert({
    profile_id: profileId, kind: s.kind === 'screening' || s.kind === 'measure' ? 'follow_up' : 'lab_test', status: 'active', title: title.slice(0, 200), test_codes: s.testCodes,
    due_at: due, next_fire_at: due, time_zone: timeZone, repeat_rule: 'none',
  })
  if (error) return false
  await supabase.from('suggestion_decisions').upsert({ profile_id: profileId, suggestion_key: s.key, decision: 'accepted' })
  track('checkup_accepted')
  return true
}

export async function dismissSuggestion(profileId: string, s: CheckupSuggestion): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('suggestion_decisions').upsert({ profile_id: profileId, suggestion_key: s.key, decision: 'dismissed' })
  return !error
}
