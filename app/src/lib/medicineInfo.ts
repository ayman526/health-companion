import { supabase } from './supabase'

export interface AiMedicineInfo {
  recognized: boolean
  active_ingredient: string | null
  uses_en: string | null
  uses_ar: string | null
}

const sessionCache = new Map<string, AiMedicineInfo | null>()

/** AI-generated "commonly used for" note for a medicine outside the bundled list (cached). */
export async function fetchMedicineInfo(name: string): Promise<AiMedicineInfo | null> {
  const key = name.trim().toLowerCase()
  if (!supabase || key.length < 2) return null
  if (sessionCache.has(key)) return sessionCache.get(key)!
  const { data, error } = await supabase.functions.invoke('medicine-info', { body: { name } })
  const info = error ? null : (data as AiMedicineInfo)
  if (info) sessionCache.set(key, info)
  return info
}
