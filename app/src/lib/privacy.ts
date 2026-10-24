import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'

const BUCKET = 'medical-documents'

// Everything a person can have in the app, read with their own access rights.
// Shared anonymous tables (medicine notes cache, unknown test names) hold no
// personal data and are not included.
const PROFILE_TABLES = [
  'health_profiles', 'medical_documents', 'document_extractions', 'laboratory_reports', 'laboratory_results',
  'medical_conditions', 'allergies', 'symptoms', 'medications', 'medication_schedules', 'medication_dose_logs',
  'appointments', 'follow_up_plans', 'reminders', 'reminder_deliveries', 'health_events', 'lifestyle_events',
  'suggestion_decisions', 'test_aliases', 'ai_conversations', 'ai_messages', 'ai_feedback', 'ai_insights',
  'usage_counters', 'audit_events',
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

async function listFiles(prefix: string): Promise<string[]> {
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

/** Builds a ZIP of all the person's records (JSON) and original files, in the browser. */
export async function exportMyData(profileId: string, email: string | undefined, onProgress: (p: ExportProgress) => void): Promise<Blob> {
  if (!supabase) throw new Error('no_backend')
  const { zipSync, strToU8 } = await import('fflate')
  const tables: Record<string, unknown[]> = {}
  const names = [...PROFILE_TABLES, ...ACCOUNT_TABLES]
  for (const [i, t] of names.entries()) {
    onProgress({ stage: 'records', done: i, total: names.length })
    tables[t] = await readAll(t)
  }

  const files: Record<string, Uint8Array> = {}
  const paths = await listFiles(profileId)
  for (const [i, path] of paths.entries()) {
    onProgress({ stage: 'files', done: i, total: paths.length })
    const { data, error } = await supabase.storage.from(BUCKET).download(path)
    if (error) throw error
    files[`files/${path.slice(profileId.length + 1)}`] = new Uint8Array(await data.arrayBuffer())
  }

  onProgress({ stage: 'zip', done: 0, total: 1 })
  const data = { exported_at: new Date().toISOString(), format_version: 1, account: { email: email ?? null }, tables }
  const readme = [
    'Health Companion: your data',
    '',
    'data.json  All your records, one list per table, exactly as stored.',
    'files/     The original documents and photos you uploaded.',
    '',
    'Keep this file somewhere safe: it contains your health information.',
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
