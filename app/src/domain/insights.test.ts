import { describe, expect, it } from 'vitest'
import { generateInsights } from './insights'
import { groupHistories, type StoredResult } from './labs/history'

// Fictional demo scenario (SPEC.md §12). Not real patient data.
let seq = 0
function row(test_code: string | null, reported_name: string, value: number, unit: string, date: string, ref: { low?: number; high?: number } = {}): StoredResult {
  return {
    id: `r${++seq}`, report_id: `rep-${date}`, document_id: null, test_code, reported_name, status: 'confirmed',
    value_numeric: value, value_comparator: null, value_text: null, unit, ref_low: ref.low ?? null, ref_high: ref.high ?? null,
    ref_text: null, lab_flag: null, laboratory_reports: { collected_at: date },
  }
}

const may = '2026-05-10'
const oct = '2026-10-12'
const demo = [
  row('ldl_c', 'LDL', 279, 'mg/dL', may, { high: 130 }),
  row('ldl_c', 'LDL', 63, 'mg/dL', oct, { high: 130 }),
  row('total_cholesterol', 'Cholesterol', 341, 'mg/dL', may, { high: 200 }),
  row('total_cholesterol', 'Cholesterol', 119, 'mg/dL', oct, { high: 200 }),
  row('alt', 'ALT', 23, 'U/L', may, { high: 41 }),
  row('alt', 'ALT', 50, 'U/L', oct, { high: 41 }),
  row('ast', 'AST', 26, 'U/L', may, { high: 40 }),
  row('ast', 'AST', 34, 'U/L', oct, { high: 40 }),
]

describe('insights from the demo scenario', () => {
  const insights = generateInsights(groupHistories(demo).values())
  const ids = insights.map((i) => `${i.ruleId}:${i.params.test}`)

  it('flags the ALT borderline elevation for follow-up, not as urgent', () => {
    const alt = insights.find((i) => i.ruleId === 'liver_borderline')!
    expect(alt.level).toBe('follow_up')
    expect(alt.params.fold).toBe(1.22)
    expect(alt.sources).toEqual(['acg2017_liver'])
    expect(insights.some((i) => i.level === 'urgent')).toBe(false)
  })

  it('reports the LDL and cholesterol improvement as a change, with both dates', () => {
    const ldl = insights.find((i) => i.ruleId === 'trend_improving' && i.params.test === 'ldl_c')!
    expect(ldl.kind).toBe('change')
    expect(ldl.params).toMatchObject({ previousValue: 279, value: 63, previousDate: may, date: oct, change: -216 })
    expect(ldl.reportIds).toEqual([`rep-${may}`, `rep-${oct}`])
    expect(ids).toContain('trend_improving:total_cholesterol')
  })

  it('says nothing about AST, which changed but stayed within range', () => {
    expect(insights.filter((i) => i.params.test === 'ast')).toEqual([])
  })

  it('orders follow-ups before informational items', () => {
    expect(insights[0].level).toBe('follow_up')
  })
})

describe('insight identity', () => {
  it('is stable for unchanged data and changes when a value is corrected', () => {
    const a = generateInsights(groupHistories(demo).values()).map((i) => i.dedupeKey)
    const b = generateInsights(groupHistories(demo).values()).map((i) => i.dedupeKey)
    expect(b).toEqual(a)

    const corrected = demo.map((r) => (r.test_code === 'alt' && r.value_numeric === 50 ? { ...r, value_numeric: 30 } : r))
    const c = generateInsights(groupHistories(corrected).values())
    expect(c.some((i) => i.params.test === 'alt')).toBe(false)
  })

  it('only the latest result raises an insight', () => {
    const rows = [row('alt', 'ALT', 90, 'U/L', may, { high: 41 }), row('alt', 'ALT', 30, 'U/L', oct, { high: 41 })]
    const ins = generateInsights(groupHistories(rows).values())
    expect(ins.map((i) => i.ruleId)).toEqual(['trend_improving'])
  })

  it('unrecognized tests get a plain out-of-range note, never a trend verdict', () => {
    const rows = [row(null, 'Lipoprotein (a)', 30, 'mg/dL', may, { high: 30 }), row(null, 'Lipoprotein (a)', 80, 'mg/dL', oct, { high: 30 })]
    const ins = generateInsights(groupHistories(rows).values())
    expect(ins.map((i) => [i.ruleId, i.level])).toEqual([['outside_range_high', 'informational']])
  })

  it('critical values are urgent', () => {
    const ins = generateInsights(groupHistories([row('potassium', 'K', 6.8, 'mmol/L', oct, { low: 3.5, high: 5.1 })]).values())
    expect(ins[0]).toMatchObject({ ruleId: 'critical_value', level: 'urgent' })
  })
})
