import { supabase } from './supabase'
import { track } from './usage'

export interface Visit {
  id: string
  title: string
  clinician: string | null
  location: string | null
  starts_at: string
  notes: string | null
  followup_done_at: string | null
}

const SELECT = 'id, title, clinician, location, starts_at, notes, followup_done_at'

export async function loadVisits(): Promise<Visit[]> {
  if (!supabase) return []
  const { data } = await supabase.from('appointments').select(SELECT).order('starts_at', { ascending: false }).limit(100)
  return (data ?? []) as Visit[]
}

export async function loadVisit(id: string): Promise<Visit | null> {
  if (!supabase) return null
  const { data } = await supabase.from('appointments').select(SELECT).eq('id', id).maybeSingle()
  return (data as Visit | null) ?? null
}

/**
 * Saves a doctor visit with two reminders: the evening before ("prepare your
 * visit summary") and a few hours after ("what did the doctor change?").
 * Notifications only say that; never the doctor's name or the reason.
 */
export async function addVisit(profileId: string, v: { title: string; clinician: string; location: string; startsAt: string }, timeZone: string, texts: { prep: string; followup: string }): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('appointments').insert({
    profile_id: profileId, title: v.title.trim().slice(0, 200), clinician: v.clinician.trim() || null, location: v.location.trim() || null, starts_at: v.startsAt,
  }).select('id').single()
  if (error) return null
  const start = new Date(v.startsAt)
  const prep = new Date(start)
  prep.setDate(prep.getDate() - 1)
  prep.setHours(18, 0, 0, 0)
  const after = new Date(start.getTime() + 3 * 3600_000)
  const rows = [
    prep > new Date() && { kind: 'visit_prep', title: texts.prep, due_at: prep.toISOString() },
    { kind: 'visit_followup', title: texts.followup, due_at: after.toISOString() },
  ].filter(Boolean) as { kind: string; title: string; due_at: string }[]
  await supabase.from('reminders').insert(rows.map((r) => ({
    profile_id: profileId, appointment_id: data.id, status: 'active', repeat_rule: 'none', time_zone: timeZone, next_fire_at: r.due_at, ...r,
  })))
  track('visit_added')
  return data.id
}

export async function deleteVisit(id: string): Promise<boolean> {
  if (!supabase) return false
  return !(await supabase.from('appointments').delete().eq('id', id)).error // its reminders go with it
}

/** Marks the after-visit update as done, with any notes, and closes its reminder. */
export async function finishFollowup(id: string, notes: string): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.from('appointments').update({ notes: notes.trim() || null, followup_done_at: new Date().toISOString() }).eq('id', id)
  if (error) return false
  await supabase.from('reminders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('appointment_id', id).eq('kind', 'visit_followup')
  track('visit_followup_done')
  return true
}
