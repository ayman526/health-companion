import { type LabTest, toCanonical } from './catalog'
import { rangePosition, type SeriesPoint } from './compare'
import type { SourceId } from './sources'

export type MeasurementStatus = 'urgent' | 'high' | 'low' | 'within_range' | 'no_range'

export interface RuleFinding {
  ruleId: string
  level: 'informational' | 'follow_up' | 'urgent'
  sources: SourceId[]
}

/**
 * Status of one measurement. "urgent" comes only from the lab's own critical
 * flag or from the sourced critical limits, never from the language model.
 */
export function measurementStatus(test: LabTest, p: SeriesPoint): MeasurementStatus {
  if (p.labFlag?.startsWith('critical')) return 'urgent'
  const c = test.critical
  if (c && !p.censored && ((c.low != null && p.value < c.low) || (c.high != null && p.value > c.high))) {
    return 'urgent'
  }
  return positionToStatus(p.rangePosition)
}

function positionToStatus(position: SeriesPoint['rangePosition']): MeasurementStatus {
  if (position === 'above') return 'high'
  if (position === 'below') return 'low'
  return position === 'within' ? 'within_range' : 'no_range'
}

export interface DraftValue {
  value: number | null
  comparator?: string | null
  unit?: string | null
  refLow?: number | null
  refHigh?: number | null
  labFlag?: string | null
}

/**
 * Status of a value that isn't saved yet (review screen). Decided by the app
 * from the printed range, never by the AI. Works for unmatched tests too
 * (range comparison only); matched tests also get the sourced critical limits.
 * Returns null when there is nothing to judge (no number, or a "<5"-style value).
 */
export function draftStatus(test: LabTest | undefined, d: DraftValue): MeasurementStatus | null {
  if (d.labFlag?.startsWith('critical')) return 'urgent'
  if (d.value == null || d.comparator) return null
  if (test) {
    const value = toCanonical(test, d.value, d.unit)
    if (value != null) {
      const low = d.refLow == null ? null : toCanonical(test, d.refLow, d.unit)
      const high = d.refHigh == null ? null : toCanonical(test, d.refHigh, d.unit)
      const c = test.critical
      if (c && ((c.low != null && value < c.low) || (c.high != null && value > c.high))) return 'urgent'
      return positionToStatus(rangePosition(value, low, high))
    }
  }
  // Same unit as the printed range, so a direct comparison is valid.
  return positionToStatus(rangePosition(d.value, d.refLow ?? null, d.refHigh ?? null))
}

export type LiverGrade = 'borderline' | 'mild' | 'moderate' | 'severe' | 'massive'

/** ACG 2017: grade ALT/AST elevation by fold of the lab's reported upper limit. */
export function liverElevationGrade(test: LabTest, p: SeriesPoint): { grade: LiverGrade; foldUln: number } | null {
  if (!test.foldUlnGrading || p.refHigh == null || p.value <= p.refHigh) return null
  const foldUln = Math.round((p.value / p.refHigh) * 100) / 100
  let grade: LiverGrade
  if (p.value > 10000) grade = 'massive'
  else if (foldUln > 15) grade = 'severe'
  else if (foldUln >= 5) grade = 'moderate'
  else if (foldUln >= 2) grade = 'mild'
  else grade = 'borderline'
  return { grade, foldUln }
}

export type GfrCategory = 'G1' | 'G2' | 'G3a' | 'G3b' | 'G4' | 'G5'

export function gfrCategory(egfr: number): GfrCategory {
  if (egfr >= 90) return 'G1'
  if (egfr >= 60) return 'G2'
  if (egfr >= 45) return 'G3a'
  if (egfr >= 30) return 'G3b'
  if (egfr >= 15) return 'G4'
  return 'G5'
}

/** Guideline-based findings for a single confirmed measurement (canonical units). */
export function guidelineFindings(test: LabTest, p: SeriesPoint): RuleFinding[] {
  if (p.censored) return []
  const out: RuleFinding[] = []

  if (measurementStatus(test, p) === 'urgent') {
    out.push({ ruleId: 'critical_value', level: 'urgent', sources: test.critical?.sources ?? [] })
  }
  if (test.code === 'ldl_c' && p.value >= 190) {
    out.push({ ruleId: 'ldl_severe_190', level: 'follow_up', sources: ['aha_acc_2018_chol'] })
  }
  if (test.code === 'hba1c') {
    // A single result is not a diagnosis (ADA requires confirmation).
    if (p.value >= 6.5) out.push({ ruleId: 'hba1c_diabetes_range', level: 'follow_up', sources: ['ada2025_dx'] })
    else if (p.value >= 5.7) out.push({ ruleId: 'hba1c_prediabetes_range', level: 'informational', sources: ['ada2025_dx'] })
  }
  if (test.code === 'egfr') {
    const cat = gfrCategory(p.value)
    if (cat !== 'G1' && cat !== 'G2') out.push({ ruleId: `egfr_${cat}`, level: 'follow_up', sources: ['kdigo_gfr'] })
  }
  const liver = liverElevationGrade(test, p)
  if (liver) {
    out.push({
      ruleId: `liver_${liver.grade}`,
      level: liver.grade === 'severe' || liver.grade === 'massive' ? 'urgent' : 'follow_up',
      sources: ['acg2017_liver'],
    })
  }
  return out
}
