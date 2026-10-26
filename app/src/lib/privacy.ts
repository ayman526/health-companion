import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { withProfile } from './activeProfile'

const BUCKET = 'medical-documents'

// Everything a person can have in the app, read with their own access rights.
// Shared anonymous tables (medicine notes cache, unknown test names) hold no
// personal data and are not included.
const PROFILE_TABLES = [
  'medical_documents', 'document_extractions', 'laboratory_reports', 'laboratory_results',
  'medical_conditions', 'allergies', 'symptoms', 'medications', 'medication_schedules', 'medication_dose_logs',
  'appointments', 'follow_up_plans', 'reminders', 'reminder_deliveries', 'health_events', 'lifestyle_events',
  'suggestion_decisions', 'test_aliases', 'ai_conversations', 'ai_messages', 'ai_feedback', 'ai_insights',
  'usage_counters', 'audit_events', 'vital_readings', 'daily_checkins',
] as const
const ACCOUNT_TABLES = ['user_consents', 'notification_preferences', 'notification_subscriptions'] as const

async function readAll(table: string) {
  const rows: unknown[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select('*').range(from, from + 999)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) return rows
  }
}

export async function listFiles(prefix: string): Promise<string[]> {
  const { data, error } = await supabase!.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  const out: string[] = []
  for (const item of data ?? []) {
    const path = `${prefix}/${item.name}`
    if (item.id) out.push(path)
    else out.push(...(await listFiles(path)))
  }
  return out
}

export interface ExportProgress { stage: 'records' | 'files' | 'zip'; done: number; total: number }

/** Builds a ZIP of all records (JSON) and original files, for you and every family member, in the browser. */
export async function exportMyData(email: string | undefined, onProgress: (p: ExportProgress) => void): Promise<Blob> {
  if (!supabase) throw new Error('no_backend')
  const { zipSync, strToU8 } = await import('fflate')
  // Only records you own: records others shared with you are theirs to export.
  const { data: auth } = await supabase.auth.getUser()
  const { data: people, error } = await supabase.from('health_profiles').select('*').eq('owner_id', auth.user?.id ?? '').order('created_at')
  if (error) throw error

  const account: Record<string, unknown[]> = {}
  for (const t of ACCOUNT_TABLES) account[t] = await readAll(t)

  const profiles: { profile: unknown; tables: Record<string, unknown[]> }[] = []
  const files: Record<string, Uint8Array> = {}
  const total = (people ?? []).length * PROFILE_TABLES.length
  let done = 0
  for (const person of people ?? []) {
    // Each person's records are read with that person selected (see lib/activeProfile.ts).
    const tables: Record<string, unknown[]> = {}
    await withProfile(person.id, async () => {
      for (const t of PROFILE_TABLES) {
        onProgress({ stage: 'records', done: done++, total })
        tables[t] = await readAll(t)
      }
    })
    profiles.push({ profile: person, tables })

    const paths = await listFiles(person.id)
    for (const [i, path] of paths.entries()) {
      onProgress({ stage: 'files', done: i, total: paths.length })
      const { data, error: e } = await supabase.storage.from(BUCKET).download(path)
      if (e) throw e
      files[`files/${path}`] = new Uint8Array(await data.arrayBuffer())
    }
  }

  onProgress({ stage: 'zip', done: 0, total: 1 })
  const data = { exported_at: new Date().toISOString(), format_version: 2, account: { email: email ?? null, ...account }, profiles }
  const readme = [
    'Health Journal: your data',
    '',
    'data.json  All records, exactly as stored: your account settings, then one',
    '           section per person (you and any family members), one list per table.',
    'files/     The original documents and photos, in one folder per person.',
    '',
    'Keep this file somewhere safe: it contains health information.',
  ].join('\n')
  const zip = zipSync({
    'README.txt': strToU8(readme),
    'data.json': strToU8(JSON.stringify(data, null, 2)),
    ...files,
  }, { level: 6 })
  return new Blob([zip], { type: 'application/zip' })
}

/** Permanently deletes the account, all records and all files. */
export async function deleteMyAccount(): Promise<boolean> {
  if (!supabase) return false
  const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } })
  if (error instanceof FunctionsHttpError) console.warn('delete-account', error.context.status)
  return !error
}

export interface ActivityItem { at: string; table: string; action: 'insert' | 'update' | 'delete' }

/** Recent changes to the person's records, from the audit log (no values, just what and when). */
export async function recentActivity(limit = 15): Promise<ActivityItem[]> {
  if (!supabase) return []
  const { data } = await supabase.from('audit_events').select('created_at, table_name, action').order('created_at', { ascending: false }).limit(limit)
  return (data ?? []).map((r) => ({ at: r.created_at, table: r.table_name, action: r.action }))
}

export interface ConsentItem { at: string; type: string; granted: boolean; version: string }

export async function consentHistory(): Promise<ConsentItem[]> {
  if (!supabase) return []
  const { data } = await supabase.from('user_consents').select('created_at, consent_type, granted, version').order('created_at', { ascending: false })
  return (data ?? []).map((r) => ({ at: r.created_at, type: r.consent_type, granted: r.granted, version: r.version }))
}
