// Per-feature AI settings from the ai_settings table (model, backup model,
// monthly limit, on/off), so the team can change them in the Supabase Table
// Editor without a deploy. Cached for a minute per function instance. Missing
// rows, unknown models and read errors fall back to the defaults in code.

import { createClient } from 'npm:@supabase/supabase-js@2.50.0'

export const MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'] as const
export type Model = (typeof MODELS)[number]
export type Feature = 'scan' | 'advisor' | 'voice' | 'monitor_photo' | 'medicine_info' | 'library'

export interface AiSetting {
  model: Model
  backupModel: Model | null
  monthlyLimit: number | null
  enabled: boolean
}

const TTL_MS = 60_000
let cache: { at: number; rows: Map<string, Record<string, unknown>> } | null = null

const isModel = (m: unknown): m is Model => typeof m === 'string' && (MODELS as readonly string[]).includes(m)

async function loadRows(): Promise<Map<string, Record<string, unknown>>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const { data, error } = await admin.from('ai_settings').select('feature, model, backup_model, monthly_limit, enabled')
  if (error) {
    console.error(JSON.stringify({ event: 'ai_settings_unavailable' }))
    return cache?.rows ?? new Map()
  }
  cache = { at: Date.now(), rows: new Map((data ?? []).map((r) => [r.feature as string, r])) }
  return cache.rows
}

export async function aiSetting(feature: Feature, defaults: AiSetting): Promise<AiSetting> {
  const row = (await loadRows()).get(feature)
  if (!row) return defaults
  if (row.model != null && !isModel(row.model)) console.error(JSON.stringify({ event: 'ai_settings_invalid', feature, field: 'model' }))
  const limit = row.monthly_limit
  return {
    model: isModel(row.model) ? row.model : defaults.model,
    // An empty backup turns the second look off; an unknown one keeps the default.
    backupModel: row.backup_model == null || row.backup_model === '' ? null : isModel(row.backup_model) ? row.backup_model : defaults.backupModel,
    monthlyLimit: typeof limit === 'number' && Number.isInteger(limit) && limit >= 0 ? limit : defaults.monthlyLimit,
    enabled: row.enabled !== false,
  }
}

// Haiku has no server-side fallback model; the others fall back when overloaded.
export const fallbackOptions = (model: Model) =>
  model === 'claude-haiku-5-5' ? {} : { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
