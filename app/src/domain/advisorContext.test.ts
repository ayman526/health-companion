import { describe, expect, it } from 'vitest'
import { buildAdvisorContext, relevantTests, type AdvisorInput } from './advisorContext'
import { groupHistories, type StoredResult } from './labs/history'

// Fictional demo scenario. Not real patient data.
let seq = 0
function row(test_code: string, value: number, unit: string, date: string, report: string, high?: number): StoredResult {
  return {
    id: `r${++seq}`, report_id: report, document_id: null, test_code, reported_name: test_code, status: 'confirmed',
    value_numeric: value, value_comparator: null, value_text: null, unit, ref_low: null, ref_high: high ?? null, ref_text: null,
    lab_flag: null, laboratory_reports: { collected_at: date },
  }
}
const histories = [...groupHistories([
  row('ldl_c', 279, 'mg/dL', '2026-05-10', 'rep-may', 130), row('ldl_c', 63, 'mg/dL', '2026-10-12', 'rep-oct', 130),
  row('alt', 23, 'U/L', '2026-05-10', 'rep-may', 41), row('alt', 50, 'U/L', '2026-10-12', 'rep-oct', 41),
  row('tsh', 2.1, 'mIU/L', '2026-10-12', 'rep-oct', 4.5),
]).values()]

const input = (question: string): AdvisorInput => ({
  question, today: '2026-10-24', person: { age: 52, sex: null, country: 'EG' }, histories,
  medications: [{ id: 'med-1', name: 'Fictostatin', ingredient: 'Atorvastatin', strength: '20 mg', active: true, regimens: [{ from: '2026-06-01', to: null, dose: '1 tablet', frequency: 'daily' }] }],
  conditions: [], allergies: [], followUps: [],
  reports: [{ id: 'rep-may', date: '2026-05-10', lab: 'Fictional Lab' }, { id: 'rep-oct', date: '2026-10-12', lab: 'Fictional Lab' }],
})

describe('advisor context', () => {
  it('includes only the tests a question is about', () => {
    expect([...relevantTests('How has my cholesterol changed since May?', histories).keys]).toEqual(['ldl_c'])
    expect([...relevantTests('ازاي الكبد عندي؟', histories).keys]).toEqual(['alt'])
    expect([...relevantTests('Summarize my health progress', histories).keys]).toEqual([])
    const { context } = buildAdvisorContext(input('How has my LDL changed?'))
    expect(context.tests.map((t) => t.name)).toEqual(['LDL cholesterol'])
    expect(context.other_tests_on_record).toEqual(expect.arrayContaining(['ALT', 'TSH']))
  })

  it('gives the app-computed change with dates and report citations', () => {
    const { context, refs } = buildAdvisorContext(input('How has my cholesterol changed since May?'))
    const ldl = context.tests[0]
    expect(ldl.latest_change).toMatchObject({ from: 279, to: 63, change: -216, percent: -77.4, trend: 'improving', beyond_normal_day_to_day_variation: true })
    expect(ldl.results.map((r) => r.report)).toEqual(['R1', 'R2'])
    expect(refs.R2).toEqual({ kind: 'report', target: 'rep-oct', label: '2026-10-12 · Fictional Lab' })
    expect(refs.T1).toMatchObject({ kind: 'test', target: 'ldl_c' })
  })

  it('flags the ALT borderline elevation with its multiple of the upper limit', () => {
    const { context } = buildAdvisorContext(input('Compare my liver results'))
    expect(context.tests[0]).toMatchObject({ name: 'ALT', guideline_flags: ['liver_borderline'], times_upper_limit: 1.22 })
  })

  it('includes life changes with their dates', () => {
    const { context } = buildAdvisorContext({ ...input('Did running help my cholesterol?'), lifeChanges: [{ category: 'exercise', title: 'Started running', started_on: '2026-06-03', ended_on: null }] })
    expect(context.life_changes).toEqual([{ category: 'exercise', change: 'Started running', from: '2026-06-03', to: null }])
  })

  it('general questions get every test briefly; medications are always included', () => {
    const { context, refs } = buildAdvisorContext(input('Summarize my health progress'))
    expect(context.tests.length).toBe(3)
    expect(context.medications[0]).toMatchObject({ id: 'M1', name: 'Fictostatin', currently_taking: true })
    expect(refs.M1).toEqual({ kind: 'medication', target: 'med-1', label: 'Fictostatin' })
  })
})
