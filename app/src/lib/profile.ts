import { supabase } from './supabase'

export interface ProfileDetails {
  id: string
  display_name: string | null
  date_of_birth: string | null
  sex: string | null
  country: 'EG' | 'US'
  time_zone: string
  height_cm: number | null
  weight_kg: number | null
  pregnancy_status: string | null
  smoking_status: string | null
  no_known_conditions: boolean
  no_known_allergies: boolean
  health_goals: string[]
  physician_name: string | null
  onboarding_step: number
}

export interface HealthLists {
  conditions: string[]
  allergies: string[]
  family: string[]
}

const PROFILE_SELECT = 'id, display_name, date_of_birth, sex, country, time_zone, height_cm, weight_kg, pregnancy_status, smoking_status, no_known_conditions, no_known_allergies, health_goals, physician_name, onboarding_step'

export async function loadProfileDetails(): Promise<{ profile: ProfileDetails | null; lists: HealthLists }> {
  const empty = { conditions: [], allergies: [], family: [] }
  if (!supabase) return { profile: null, lists: empty }
  const [{ data: profile }, { data: conditions }, { data: allergies }] = await Promise.all([
    supabase.from('health_profiles').select(PROFILE_SELECT).eq('is_demo', false).maybeSingle(),
    supabase.from('medical_conditions').select('name, is_family_history').eq('status', 'confirmed'),
    supabase.from('allergies').select('substance').eq('status', 'confirmed'),
  ])
  return {
    profile: (profile as ProfileDetails | null) ?? null,
    lists: {
      conditions: (conditions ?? []).filter((c) => !c.is_family_history).map((c) => c.name),
      family: (conditions ?? []).filter((c) => c.is_family_history).map((c) => c.name),
      allergies: (allergies ?? []).map((a) => a.substance),
    },
  }
}

export async function saveProfileFields(profileId: string, patch: Partial<Omit<ProfileDetails, 'id'>> & { onboarding_completed_at?: string }) {
  if (!supabase) return false
  const { error } = await supabase.from('health_profiles').update(patch).eq('id', profileId)
  return !error
}

const norm = (s: string) => s.trim().toLowerCase()

/**
 * Makes the user's own entries match the chosen names: adds new ones, removes
 * unchosen ones that the user entered. Entries that came from a document or
 * the advisor are never removed here.
 */
async function syncNames(
  table: 'medical_conditions' | 'allergies',
  column: 'name' | 'substance',
  profileId: string,
  chosen: string[],
  family?: boolean,
) {
  if (!supabase) return false
  let q = supabase.from(table).select(`id, ${column}, source`).eq('status', 'confirmed')
  if (table === 'medical_conditions') q = q.eq('is_family_history', !!family)
  const { data } = await q
  const existing = (data ?? []) as unknown as { id: string; source: string; name?: string; substance?: string }[]
  const have = new Set(existing.map((r) => norm((r[column] as string) ?? '')))
  const want = new Set(chosen.map(norm).filter(Boolean))

  const toAdd = [...new Map(chosen.filter((c) => c.trim() && !have.has(norm(c))).map((c) => [norm(c), c.trim()])).values()]
  const toRemove = existing.filter((r) => r.source === 'user_entered' && !want.has(norm((r[column] as string) ?? ''))).map((r) => r.id)

  if (toAdd.length) {
    const rows = toAdd.map((v) => ({
      profile_id: profileId, status: 'confirmed', source: 'user_entered', [column]: v,
      ...(table === 'medical_conditions' ? { is_family_history: !!family } : {}),
    }))
    const { error } = await supabase.from(table).insert(rows)
    if (error) return false
  }
  if (toRemove.length) {
    const { error } = await supabase.from(table).delete().in('id', toRemove)
    if (error) return false
  }
  return true
}

export const saveConditions = (profileId: string, names: string[]) => syncNames('medical_conditions', 'name', profileId, names, false)
export const saveFamilyHistory = (profileId: string, names: string[]) => syncNames('medical_conditions', 'name', profileId, names, true)
export const saveAllergies = (profileId: string, names: string[]) => syncNames('allergies', 'substance', profileId, names)
