import { type LabTest, toCanonical } from './catalog'

export interface LabResultInput {
  id: string
  reportId: string
  documentId?: string | null
  testCode: string | null
  status: 'draft' | 'confirmed' | 'discarded'
  collectedAt: string | null // YYYY-MM-DD
  value: number | null
  comparator?: '<' | '<=' | '>' | '>=' | null
  unit: string | null
  refLow?: number | null
  refHigh?: number | null
  labFlag?: string | null
}

export type RangePosition = 'below' | 'within' | 'above' | 'no_range'

export interface SeriesPoint {
  resultId: string
  reportId: string
  documentId: string | null
  collectedAt: string
  value: number
  unit: string
  refLow: number | null
  refHigh: number | null
  rangePosition: RangePosition
  censored: boolean
  labFlag: string | null
}

export type ExclusionReason = 'not_confirmed' | 'different_test' | 'missing_date' | 'no_numeric_value' | 'unit_not_convertible'

export interface Series {
  testCode: string
  unit: string
  points: SeriesPoint[] // oldest first
  excluded: { resultId: string; reason: ExclusionReason }[]
}

export type Trend =
  | 'improving'
  | 'worsening'
  | 'stable'
  | 'changed_within_range'
  | 'changed' // significant, but no reported range to judge direction
  | 'not_comparable'

export interface Comparison {
  previous: SeriesPoint
  current: SeriesPoint
  absoluteChange: number
  percentChange: number | null
  /** Null when the test has no published biological variation: change shown, not judged. */
  rcvPercent: number | null
  significant: boolean | null
  trend: Trend
  reason?: 'censored_value' | 'zero_baseline'
}

function round(n: number, digits = 4) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export function rangePosition(value: number, low: number | null, high: number | null): RangePosition {
  if (low == null && high == null) return 'no_range'
  if (low != null && value < low) return 'below'
  if (high != null && value > high) return 'above'
  return 'within'
}

/**
 * Builds the comparable history for one test from confirmed results only.
 * Values and reference ranges are converted to the canonical unit; anything
 * that cannot be converted is excluded with a reason, never guessed.
 */
export function buildSeries(test: LabTest, results: LabResultInput[]): Series {
  const points: SeriesPoint[] = []
  const excluded: Series['excluded'] = []

  for (const r of results) {
    if (r.testCode !== test.code) {
      excluded.push({ resultId: r.id, reason: 'different_test' })
      continue
    }
    if (r.status !== 'confirmed') {
      excluded.push({ resultId: r.id, reason: 'not_confirmed' })
      continue
    }
    if (!r.collectedAt) {
      excluded.push({ resultId: r.id, reason: 'missing_date' })
      continue
    }
    if (r.value == null) {
      excluded.push({ resultId: r.id, reason: 'no_numeric_value' })
      continue
    }
    const value = toCanonical(test, r.value, r.unit)
    if (value == null) {
      excluded.push({ resultId: r.id, reason: 'unit_not_convertible' })
      continue
    }
    const refLow = r.refLow == null ? null : toCanonical(test, r.refLow, r.unit)
    const refHigh = r.refHigh == null ? null : toCanonical(test, r.refHigh, r.unit)
    points.push({
      resultId: r.id,
      reportId: r.reportId,
      documentId: r.documentId ?? null,
      collectedAt: r.collectedAt,
      value: round(value),
      unit: test.canonicalUnit,
      refLow: refLow == null ? null : round(refLow),
      refHigh: refHigh == null ? null : round(refHigh),
      rangePosition: rangePosition(value, refLow, refHigh),
      censored: r.comparator != null,
      labFlag: r.labFlag ?? null,
    })
  }

  points.sort((a, b) => a.collectedAt.localeCompare(b.collectedAt) || a.resultId.localeCompare(b.resultId))
  return { testCode: test.code, unit: test.canonicalUnit, points, excluded }
}

/**
 * Reference change value (%): the smallest change unlikely to be explained by
 * analytical and normal within-person variation (95%, two-sided).
 * CVa is unknown for the user's lab, so desirable imprecision (CVi / 2) is used.
 */
export function referenceChangeValue(cvi: number, cva = cvi / 2): number {
  return round(1.96 * Math.SQRT2 * Math.sqrt(cva ** 2 + cvi ** 2), 2)
}

function distanceFromRange(p: SeriesPoint): number | null {
  if (p.rangePosition === 'no_range') return null
  if (p.rangePosition === 'below') return p.refLow! - p.value
  if (p.rangePosition === 'above') return p.value - p.refHigh!
  return 0
}

function trendFor(test: LabTest, prev: SeriesPoint, curr: SeriesPoint, change: number): Trend {
  const outside = (p: SeriesPoint) => p.rangePosition === 'above' || p.rangePosition === 'below'

  if (test.direction === 'in_range') {
    const dPrev = distanceFromRange(prev)
    const dCurr = distanceFromRange(curr)
    if (dPrev == null || dCurr == null) return 'changed'
    if (dPrev === 0 && dCurr === 0) return 'changed_within_range'
    if (dCurr < dPrev) return 'improving'
    if (dCurr > dPrev) return 'worsening'
    return 'changed'
  }

  if (prev.rangePosition === 'no_range' && curr.rangePosition === 'no_range') return 'changed'
  if (!outside(prev) && !outside(curr)) return 'changed_within_range'
  const better = test.direction === 'lower_better' ? change < 0 : change > 0
  return better ? 'improving' : 'worsening'
}

export function compare(test: LabTest, prev: SeriesPoint, curr: SeriesPoint): Comparison {
  const absoluteChange = round(curr.value - prev.value)
  const percentChange = prev.value === 0 ? null : round(((curr.value - prev.value) / prev.value) * 100, 1)
  const rcvPercent = test.cvi == null ? null : referenceChangeValue(test.cvi)
  const base = { previous: prev, current: curr, absoluteChange, percentChange, rcvPercent }

  if (prev.censored || curr.censored) {
    return { ...base, significant: false, trend: 'not_comparable', reason: 'censored_value' }
  }
  if (percentChange == null) {
    return { ...base, significant: false, trend: 'not_comparable', reason: 'zero_baseline' }
  }
  if (rcvPercent == null) {
    return { ...base, significant: null, trend: absoluteChange === 0 ? 'stable' : 'changed' }
  }
  const significant = Math.abs(percentChange) > rcvPercent
  if (!significant) return { ...base, significant, trend: 'stable' }
  return { ...base, significant, trend: trendFor(test, prev, curr, absoluteChange) }
}

/** Latest vs previous result, or null when there are fewer than two comparable points. */
export function compareLatest(test: LabTest, series: Series): Comparison | null {
  const n = series.points.length
  if (n < 2) return null
  return compare(test, series.points[n - 2], series.points[n - 1])
}
