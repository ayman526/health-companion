import type { TFunction } from 'i18next'
import { supabase } from './supabase'
import { formatDate } from './format'
import { getTest } from '../domain/labs/catalog'

export type StarterIcon = 'test' | 'report' | 'medicine' | 'visit' | 'general'
export interface Starter { key: string; icon: StarterIcon; text: string }

/**
 * Up to three opening questions built from the person's own records, most
 * useful first: a result needing attention, the latest report, a current
 * medicine, an upcoming visit. General questions fill the rest, so nobody sees
 * a question about records they don't have.
 */
export async function loadStarters(t: TFunction, lang: string): Promise<Starter[]> {
  const out: Starter[] = []
  if (supabase) {
    const [flagged, report, medicine, visit] = await Promise.all([
      supabase.from('ai_insights').select('test_key').eq('status', 'active').eq('kind', 'attention').limit(1).maybeSingle(),
      supabase.from('laboratory_reports').select('collected_at').eq('status', 'confirmed').order('collected_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('medications').select('brand_name, medication_schedules!inner(valid_to)').eq('status', 'confirmed').is('medication_schedules.valid_to', null).limit(1).maybeSingle(),
      supabase.from('appointments').select('starts_at').gt('starts_at', new Date().toISOString()).order('starts_at').limit(1).maybeSingle(),
    ])
    const test = flagged.data?.test_key ? getTest(flagged.data.test_key) : undefined
    if (test) out.push({ key: 'test', icon: 'test', text: t('advisor.starters.test', { test: test.name[lang === 'ar' ? 'ar' : 'en'] }) })
    if (report.data?.collected_at) out.push({ key: 'report', icon: 'report', text: t('advisor.starters.report', { date: formatDate(report.data.collected_at, lang) }) })
    if (medicine.data?.brand_name) out.push({ key: 'medicine', icon: 'medicine', text: t('advisor.starters.medicine', { name: medicine.data.brand_name }) })
    if (visit.data?.starts_at) out.push({ key: 'visit', icon: 'visit', text: t('advisor.starters.visit', { date: formatDate(visit.data.starts_at.slice(0, 10), lang) }) })
  }
  for (const k of ['doctor', 'summary', 'help'] as const) out.push({ key: k, icon: 'general', text: t(`advisor.starters.${k}`) })
  return out.slice(0, 3)
}
