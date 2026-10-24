import { supabase } from './supabase'
import { loadConfirmedResults } from './labData'
import { loadMedications, zonedDateTime } from './medications'
import { suggestCheckups, type CheckupSuggestion } from '../domain/testSuggestions'

export async function loadSuggestions(today: string): Promise<CheckupSuggestion[]> {
  if (!supabase) return []
  const [rows, meds, conditions, reminders, decisions] = await Promise.all([
    loadConfirmedResults(),
    loadMedications(),
    supabase.from('medical_conditions').select('name').eq('status', 'confirmed').eq('is_family_history', false),
    supabase.from('reminders').select('test_codes').eq('status', 'active'),
    supabase.from('suggestion_decisions').select('suggestion_key'),
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
  })
}

/** Turns a suggestion into a lab-test reminder on the date the user chose. */
export async function acceptSuggestion(profileId: string, s: CheckupSuggestion, title: string, date: string, timeZone: string): Promise<boolean> {
  if (!supabase) return false
  const due = zonedDateTime(date, '09:00', timeZone)
  const { error } = await supabase.from('reminders').insert({
    profile_id: profileId, kind: 'lab_test', status: 'active', title: title.slice(0, 200), test_codes: s.testCodes,
    due_at: due, next_fire_at: due, time_zone: timeZone, repeat_rule: 'none',
  })
  if (error) return false
  await supabase.from('suggestion_decisions').upsert({ profile_id: profileId, suggestion_key: s.key, decision: 'accepted' })
  return true
}

export async function dismissSuggestion(profileId: string, s: CheckupSuggestion): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('suggestion_decisions').upsert({ profile_id: profileId, suggestion_key: s.key, decision: 'dismissed' })
  return !error
}
