// Insights are generated deterministically from confirmed results and the
// sourced rules (SPEC.md §7). The language model never creates them, and
// never decides that something is urgent.
import { compare } from './labs/compare'
import type { TestHistory } from './labs/history'
import { guidelineFindings, measurementStatus } from './labs/rules'
import { RULES_VERSION, type SourceId } from './labs/sources'

export type InsightLevel = 'informational' | 'follow_up' | 'urgent'

export interface InsightCandidate {
  ruleId: string
  /** i18n template under insights.rules.* */
  template: string
  level: InsightLevel
  /** Attention items go to "Needs your attention"; changes go to "What has changed". */
  kind: 'attention' | 'change'
  /** Same key = same insight. Includes the result id and value, so a correction creates a new key. */
  dedupeKey: string
  testKey: string
  resultIds: string[]
  reportIds: string[]
  sources: SourceId[]
  date: string
  params: Record<string, string | number>
}

const LEVEL_ORDER: Record<InsightLevel, number> = { urgent: 0, follow_up: 1, informational: 2 }

/** Only the latest result of each test can raise an insight; older ones are history. */
export function generateInsights(histories: Iterable<TestHistory>): InsightCandidate[] {
  const out: InsightCandidate[] = []

  for (const h of histories) {
    const points = h.series.points
    if (points.length === 0) continue
    const latest = points[points.length - 1]
    const previous = points.length > 1 ? points[points.length - 2] : null
    const base = {
      testKey: h.key,
      date: latest.collectedAt,
      params: {
        test: h.test.code,
        testLabel: h.test.name.en,
        value: latest.value,
        unit: latest.unit,
        date: latest.collectedAt,
        refLow: latest.refLow ?? '',
        refHigh: latest.refHigh ?? '',
      } as Record<string, string | number>,
    }
    const key = (ruleId: string) => `${ruleId}|${h.key}|${latest.resultId}|${latest.value}`

    // 1. Guideline rules (catalog tests only). They include critical values and liver grades.
    const findings = h.byNameOnly ? [] : guidelineFindings(h.test, latest)
    for (const f of findings) {
      let template = f.ruleId
      const params = { ...base.params }
      if (f.ruleId.startsWith('egfr_')) {
        template = 'egfr_category'
        params.category = f.ruleId.slice(5)
      } else if (f.ruleId.startsWith('liver_')) {
        template = 'liver_elevation'
        params.grade = f.ruleId.slice(6)
        params.fold = latest.refHigh ? Math.round((latest.value / latest.refHigh) * 100) / 100 : ''
      }
      out.push({
        ...base, params, ruleId: f.ruleId, template, level: f.level, kind: 'attention', dedupeKey: key(f.ruleId),
        resultIds: [latest.resultId], reportIds: [latest.reportId], sources: f.sources,
      })
    }

    // 2. Outside the printed range, when no guideline rule already covers it. Informational, not alarming.
    const status = measurementStatus(h.test, latest)
    if (findings.length === 0 && (status === 'high' || status === 'low' || status === 'urgent')) {
      const ruleId = status === 'urgent' ? 'critical_value' : `outside_range_${status}`
      out.push({
        ...base, ruleId, template: ruleId, level: status === 'urgent' ? 'urgent' : 'informational', kind: 'attention',
        dedupeKey: key(ruleId), resultIds: [latest.resultId], reportIds: [latest.reportId], sources: [],
      })
    }

    // 3. A meaningful change since the previous result (beyond normal day-to-day variation).
    if (previous) {
      const c = compare(h.test, previous, latest)
      if (c.trend === 'improving' || c.trend === 'worsening') {
        const ruleId = `trend_${c.trend}`
        out.push({
          ...base,
          params: {
            ...base.params,
            previousValue: previous.value,
            previousDate: previous.collectedAt,
            change: c.absoluteChange,
            percent: c.percentChange ?? '',
          },
          ruleId, template: ruleId, level: c.trend === 'worsening' ? 'follow_up' : 'informational', kind: 'change',
          dedupeKey: key(ruleId), resultIds: [previous.resultId, latest.resultId],
          reportIds: [...new Set([previous.reportId, latest.reportId])], sources: ['eflm_bv'],
        })
      }
    }
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.date.localeCompare(a.date))
}

export { RULES_VERSION }
