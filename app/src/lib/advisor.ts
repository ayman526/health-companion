import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { bmi } from '../domain/profileOptions'
import { loadConfirmedResults } from './labData'
import { loadMedications } from './medications'
import { groupHistories } from '../domain/labs/history'
import { buildAdvisorContext, type AdvisorMedication, type Ref } from '../domain/advisorContext'
import type { AdvisorAnswer } from '../../../supabase/functions/advisor/validate'

export type { AdvisorAnswer }

export interface Citation extends Partial<Ref> {
  id: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  answer?: AdvisorAnswer
  citations?: Citation[]
  safety_flags?: string[]
  created_at: string
}

export interface Conversation {
  id: string
  title: string | null
  updated_at: string
}

function ageFrom(dob: string | null, today: string): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

const freqText = (s: { frequency: string; every_n_days: number | null; days_of_week: number[] | null; times_of_day: string[] }) =>
  s.frequency === 'as_needed' ? 'as needed'
  : s.frequency === 'weekly' ? `weekly on days ${(s.days_of_week ?? []).join(',')} (0=Sunday)`
  : s.frequency === 'every_n_days' ? `every ${s.every_n_days} days`
  : `${s.times_of_day.length} time(s) a day`

/** Loads the user's records and extracts what this question needs. */
export async function contextFor(question: string, profileId: string, today: string) {
  if (!supabase) throw new Error('no_backend')
  const [rows, meds, profile, conditions, allergies, followUps, life] = await Promise.all([
    loadConfirmedResults(),
    loadMedications(),
    supabase.from('health_profiles').select('date_of_birth, sex, country, pregnancy_status, smoking_status, height_cm, weight_kg, health_goals, no_known_conditions, no_known_allergies').eq('id', profileId).maybeSingle(),
    supabase.from('medical_conditions').select('name, is_family_history, family_relation').eq('status', 'confirmed'),
    supabase.from('allergies').select('substance, reaction').eq('status', 'confirmed'),
    supabase.from('follow_up_plans').select('description, due_date').eq('status', 'confirmed').is('completed_at', null),
    supabase.from('lifestyle_events').select('category, title, started_on, ended_on').order('started_on'),
  ])
  const reports = new Map<string, { id: string; date: string; lab: string | null }>()
  for (const r of rows) {
    if (r.laboratory_reports.collected_at) reports.set(r.report_id, { id: r.report_id, date: r.laboratory_reports.collected_at, lab: r.laboratory_reports.lab_name ?? null })
  }
  const medications: AdvisorMedication[] = meds.map((m) => ({
    id: m.id, name: m.brand_name, ingredient: m.active_ingredient, strength: m.strength, active: m.is_active,
    regimens: m.medication_schedules.map((s) => ({
      from: s.valid_from, to: s.valid_to, dose: s.dose_amount ? `${s.dose_amount} ${s.dose_unit ?? ''}`.trim() : '', frequency: freqText(s),
    })),
  }))
  const p = profile.data
  return buildAdvisorContext({
    question,
    today,
    person: {
      age: ageFrom(p?.date_of_birth ?? null, today), sex: p?.sex ?? null, country: p?.country ?? 'EG',
      // Only what the person chose to share; "prefer not to say" is left out.
      pregnancy: p?.pregnancy_status && p.pregnancy_status !== 'prefer_not_to_say' ? p.pregnancy_status : null,
      smoking: p?.smoking_status && p.smoking_status !== 'prefer_not_to_say' ? p.smoking_status : null,
      height_cm: p?.height_cm ?? null, weight_kg: p?.weight_kg ?? null, bmi: bmi(p?.height_cm, p?.weight_kg),
      goals: p?.health_goals ?? [], no_known_conditions: !!p?.no_known_conditions, no_known_allergies: !!p?.no_known_allergies,
    },
    histories: [...groupHistories(rows).values()],
    medications,
    conditions: (conditions.data ?? []).map((c) => (c.is_family_history ? `family history: ${c.name}${c.family_relation ? ` (${c.family_relation})` : ''}` : c.name)),
    allergies: (allergies.data ?? []).map((a) => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`),
    followUps: (followUps.data ?? []).map((f) => ({ text: f.description, due: f.due_date })),
    reports: [...reports.values()].sort((a, b) => a.date.localeCompare(b.date)),
    lifeChanges: life.data ?? [],
  })
}

export type AskResult =
  | { ok: true; conversationId: string; message: ChatMessage; emergency: string[] }
  | { ok: false; error: string; conversationId: string | null; emergency: string[] }

export async function ask(question: string, conversationId: string | null, profileId: string, today: string): Promise<AskResult> {
  if (!supabase) return { ok: false, error: 'no_backend', conversationId, emergency: [] }
  const { context, refs } = await contextFor(question, profileId, today)
  const { data, error } = await supabase.functions.invoke('advisor', { body: { conversation_id: conversationId, question, context, refs } })
  if (error) {
    let body: { error?: string; conversation_id?: string; emergency?: string[] } = {}
    if (error instanceof FunctionsHttpError) {
      try {
        body = await error.context.json()
      } catch {
        // keep the generic error
      }
    }
    return { ok: false, error: body.error ?? 'ai_unavailable', conversationId: body.conversation_id ?? conversationId, emergency: body.emergency ?? [] }
  }
  const m = data.message
  return {
    ok: true,
    conversationId: data.conversation_id,
    emergency: data.emergency ?? [],
    message: { id: m.id, role: 'assistant', answer: m.answer, citations: m.citations, safety_flags: m.safety_flags, created_at: m.created_at },
  }
}

export async function loadConversations(): Promise<Conversation[]> {
  if (!supabase) return []
  const { data } = await supabase.from('ai_conversations').select('id, title, updated_at').order('updated_at', { ascending: false }).limit(30)
  return (data ?? []) as Conversation[]
}

export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!supabase) return []
  const { data } = await supabase.from('ai_messages').select('id, role, content, citations, safety_flags, created_at')
    .eq('conversation_id', conversationId).in('role', ['user', 'assistant']).order('created_at')
  return (data ?? []).map((m) => {
    if (m.role === 'user') return { id: m.id, role: 'user', text: m.content, created_at: m.created_at }
    let answer: AdvisorAnswer | undefined
    try {
      answer = JSON.parse(m.content)
    } catch {
      answer = undefined
    }
    return { id: m.id, role: 'assistant', answer, text: answer ? undefined : m.content, citations: m.citations as Citation[], safety_flags: m.safety_flags, created_at: m.created_at }
  })
}

export async function sendFeedback(profileId: string, messageId: string, kind: 'helpful' | 'not_helpful' | 'inaccurate' | 'unsafe', comment?: string) {
  if (!supabase) return false
  const { error } = await supabase.from('ai_feedback').insert({ profile_id: profileId, message_id: messageId, kind, comment: comment?.slice(0, 1000) || null })
  return !error
}
