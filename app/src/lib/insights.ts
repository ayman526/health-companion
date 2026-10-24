import i18n from '../i18n'
import { supabase } from './supabase'
import { formatDate, formatNumber } from './format'
import { loadHistories } from './labData'
import { generateInsights, RULES_VERSION, type InsightCandidate, type InsightLevel } from '../domain/insights'
import { getTest } from '../domain/labs/catalog'

export type InsightStatus = 'active' | 'acknowledged' | 'dismissed' | 'superseded'

export interface Insight extends InsightCandidate {
  id: string
  status: InsightStatus
}

const EMERGENCY: Record<string, string> = { EG: '123', US: '911' }

/** Renders an insight's text in the given language from its template and stored values. */
export function renderInsight(c: Pick<InsightCandidate, 'template' | 'params'>, lang: string, country = 'EG') {
  const t = i18n.getFixedT(lang)
  const p = c.params
  const num = (v: string | number | undefined) => (v === '' || v == null ? '' : formatNumber(Number(v), lang))
  const test = getTest(String(p.test))
  const range = p.refLow !== '' && p.refHigh !== '' ? `${num(p.refLow)}–${num(p.refHigh)}` : p.refHigh !== '' ? `< ${num(p.refHigh)}` : p.refLow !== '' ? `> ${num(p.refLow)}` : ''
  const vars = {
    test: test ? test.name[lang === 'ar' ? 'ar' : 'en'] : String(p.testLabel ?? ''),
    value: num(p.value),
    unit: String(p.unit ?? ''),
    date: p.date ? formatDate(String(p.date), lang) : '',
    previousValue: num(p.previousValue),
    previousDate: p.previousDate ? formatDate(String(p.previousDate), lang) : '',
    percent: p.percent !== '' && p.percent != null ? `${Number(p.percent) > 0 ? '+' : ''}${num(p.percent)}%` : '',
    range,
    category: String(p.category ?? ''),
    fold: num(p.fold),
    emergency: EMERGENCY[country] ?? EMERGENCY.EG,
  }
  const k = `insights.rules.${c.template}`
  return {
    title: t(`${k}.title`, vars),
    body: c.template === 'liver_elevation' ? t(`labs.liver.${p.grade}`, vars) : t(`${k}.body`, vars),
    action: t(`${k}.action`, vars),
  }
}

/**
 * Recomputes insights from the confirmed record and reconciles them with the
 * stored ones: new ones are added, ones whose evidence changed or disappeared
 * become "superseded", and the user's dismissals are kept (SPEC §7).
 */
export async function syncInsights(profileId: string): Promise<Insight[]> {
  if (!supabase) return []
  const candidates = generateInsights((await loadHistories()).values())
  const { data: stored } = await supabase.from('ai_insights').select('id, dedupe_key, status')
  const byKey = new Map((stored ?? []).map((s) => [s.dedupe_key as string, s as { id: string; dedupe_key: string; status: InsightStatus }]))
  const current = new Set(candidates.map((c) => c.dedupeKey))

  const stale = (stored ?? []).filter((s) => !current.has(s.dedupe_key) && (s.status === 'active' || s.status === 'acknowledged'))
  if (stale.length) await supabase.from('ai_insights').update({ status: 'superseded' }).in('id', stale.map((s) => s.id))

  const revived = candidates.filter((c) => byKey.get(c.dedupeKey)?.status === 'superseded')
  if (revived.length) await supabase.from('ai_insights').update({ status: 'active' }).in('id', revived.map((c) => byKey.get(c.dedupeKey)!.id))

  const fresh = candidates.filter((c) => !byKey.has(c.dedupeKey))
  if (fresh.length) {
    const { data: inserted } = await supabase
      .from('ai_insights')
      .insert(fresh.map((c) => {
        const en = renderInsight(c, 'en')
        return {
          profile_id: profileId,
          level: c.level,
          status: 'active',
          rule_id: c.ruleId,
          rule_version: RULES_VERSION,
          dedupe_key: c.dedupeKey,
          title: en.title,
          explanation: en.body,
          next_action: en.action,
          evidence: { result_ids: c.resultIds, report_ids: c.reportIds, sources: c.sources, date: c.date },
          test_key: c.testKey,
          template: c.template,
          params: c.params,
        }
      }))
      .select('id, dedupe_key, status')
    for (const s of inserted ?? []) byKey.set(s.dedupe_key, s as { id: string; dedupe_key: string; status: InsightStatus })
  }

  return candidates
    .filter((c) => byKey.has(c.dedupeKey))
    .map((c) => {
      const s = byKey.get(c.dedupeKey)!
      return { ...c, id: s.id, status: s.status === 'superseded' ? 'active' : s.status }
    })
}

export async function setInsightStatus(id: string, status: Extract<InsightStatus, 'active' | 'dismissed'>) {
  if (!supabase) return false
  const { error } = await supabase.from('ai_insights').update({ status }).eq('id', id)
  return !error
}

export const LEVEL_LABEL_KEY: Record<InsightLevel, string> = {
  urgent: 'insights.level.urgent',
  follow_up: 'insights.level.follow_up',
  informational: 'insights.level.informational',
}
