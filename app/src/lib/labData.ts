import { supabase } from './supabase'
import { groupHistories, type StoredResult, type TestHistory } from '../domain/labs/history'

export const RESULT_SELECT =
  'id, report_id, document_id, test_code, reported_name, status, value_numeric, value_comparator, value_text, unit, ref_low, ref_high, ref_text, lab_flag, laboratory_reports!inner(collected_at, lab_name, status)'

/** All confirmed results of the signed-in user's profile, with their report dates. */
export async function loadConfirmedResults(): Promise<StoredResult[]> {
  if (!supabase) return []
  const { data } = await supabase
    .from('laboratory_results')
    .select(RESULT_SELECT)
    .eq('status', 'confirmed')
    .eq('laboratory_reports.status', 'confirmed')
    .limit(5000)
  return (data ?? []) as unknown as StoredResult[]
}

export async function loadHistories(): Promise<Map<string, TestHistory>> {
  return groupHistories(await loadConfirmedResults())
}

export interface Correction {
  resultId: string
  at: string
  oldValue: string | null
  oldUnit: string | null
}

/** Edits made after a result was confirmed (from the audit log), newest first per result. */
export async function loadCorrections(resultIds: string[]): Promise<Map<string, Correction[]>> {
  const out = new Map<string, Correction[]>()
  if (!supabase || resultIds.length === 0) return out
  const { data } = await supabase
    .from('audit_events')
    .select('record_id, created_at, old_values, new_values')
    .eq('table_name', 'laboratory_results')
    .eq('action', 'update')
    .eq('old_values->>status', 'confirmed')
    .in('record_id', resultIds)
    .order('created_at', { ascending: false })
  for (const e of data ?? []) {
    const oldV = e.old_values as Record<string, unknown>
    const newV = e.new_values as Record<string, unknown>
    if (oldV.value_numeric === newV.value_numeric && oldV.unit === newV.unit && oldV.test_code === newV.test_code &&
        oldV.ref_low === newV.ref_low && oldV.ref_high === newV.ref_high && oldV.reported_name === newV.reported_name) continue
    const list = out.get(e.record_id) ?? []
    list.push({
      resultId: e.record_id,
      at: e.created_at,
      oldValue: oldV.value_numeric == null ? (oldV.value_text as string | null) : String(oldV.value_numeric),
      oldUnit: (oldV.unit as string | null) ?? null,
    })
    out.set(e.record_id, list)
  }
  return out
}
