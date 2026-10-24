import { getTest, nameOnlyTest, type LabTest } from './catalog'
import { buildSeries, type LabResultInput, type Series } from './compare'

/** A laboratory_results row as loaded with its report (see lib/labData.ts). */
export interface StoredResult {
  id: string
  report_id: string
  document_id: string | null
  test_code: string | null
  reported_name: string
  status: 'draft' | 'confirmed' | 'discarded'
  value_numeric: number | null
  value_comparator: LabResultInput['comparator']
  value_text: string | null
  unit: string | null
  ref_low: number | null
  ref_high: number | null
  ref_text: string | null
  lab_flag: string | null
  laboratory_reports: { collected_at: string | null; lab_name?: string | null }
}

/** Catalog test, or a name+unit stand-in for results the catalog doesn't know. */
export function testFor(r: Pick<StoredResult, 'test_code' | 'reported_name' | 'unit' | 'value_numeric'>): { test: LabTest; byNameOnly: boolean } | null {
  const known = r.test_code ? getTest(r.test_code) : undefined
  if (known) return { test: known, byNameOnly: false }
  if (r.value_numeric == null) return null
  return { test: nameOnlyTest(r.reported_name, r.unit), byNameOnly: true }
}

export function toInput(r: StoredResult): LabResultInput {
  return {
    id: r.id, reportId: r.report_id, documentId: r.document_id, testCode: testFor(r)?.test.code ?? null,
    status: r.status, collectedAt: r.laboratory_reports.collected_at, value: r.value_numeric,
    comparator: r.value_comparator, unit: r.unit, refLow: r.ref_low, refHigh: r.ref_high, labFlag: r.lab_flag,
  }
}

export interface TestHistory {
  /** Catalog code, or "name:<printed name>|<unit>" for unrecognized tests. */
  key: string
  test: LabTest
  byNameOnly: boolean
  series: Series
  rows: StoredResult[]
}

/** Groups confirmed results into one comparable history per test. */
export function groupHistories(rows: StoredResult[]): Map<string, TestHistory> {
  const inputs = rows.map(toInput)
  const groups = new Map<string, { test: LabTest; byNameOnly: boolean; rows: StoredResult[] }>()
  for (const r of rows) {
    const match = testFor(r)
    if (!match) continue
    const g = groups.get(match.test.code) ?? { ...match, rows: [] }
    g.rows.push(r)
    groups.set(match.test.code, g)
  }
  const out = new Map<string, TestHistory>()
  for (const [key, g] of groups) {
    out.set(key, { key, test: g.test, byNameOnly: g.byNameOnly, rows: g.rows, series: buildSeries(g.test, inputs) })
  }
  return out
}
