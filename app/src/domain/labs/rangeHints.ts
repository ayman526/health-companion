import { LAB_TESTS, fitsSection, toCanonical, type LabTest } from './catalog'

/**
 * Typical adult reference ranges, in each test's canonical unit. Only used to
 * suggest which test an unrecognized name might be, from the range the lab
 * printed next to it; never to judge a result (the lab's own range does that).
 * 0 as the low end means "below this is fine" ("< 200").
 */
export const TYPICAL_RANGES: Record<string, [number, number]> = {
  total_cholesterol: [0, 200], ldl_c: [0, 130], hdl_c: [40, 60], triglycerides: [0, 150], vldl_c: [5, 40], non_hdl_c: [0, 130],
  chol_hdl_ratio: [0, 5], ldl_hdl_ratio: [0, 3.5],
  glucose_fasting: [70, 100], glucose: [70, 140], glucose_2h_pp: [70, 140], hba1c: [4, 5.7], insulin: [2, 25],
  alt: [7, 40], ast: [8, 40], ggt: [8, 61], alp: [40, 130], bilirubin_total: [0.2, 1.2], bilirubin_direct: [0, 0.3],
  albumin: [3.5, 5.2], total_protein: [6, 8.3], globulin: [2, 3.5], ag_ratio: [1, 2.2],
  creatinine: [0.6, 1.3], egfr: [90, 120], urea: [15, 45], bun: [7, 20], bun_creatinine_ratio: [10, 20], uric_acid: [3.5, 7.2], urine_acr: [0, 30],
  sodium: [135, 145], potassium: [3.5, 5.1], chloride: [98, 107], bicarbonate: [22, 29],
  calcium: [8.6, 10.3], magnesium: [1.7, 2.4], phosphorus: [2.5, 4.5],
  iron: [60, 170], tibc: [250, 450], transferrin_saturation: [20, 50], transferrin: [200, 360], ferritin: [20, 300],
  hemoglobin: [12, 17], rbc: [4, 5.9], hematocrit: [36, 50], mcv: [80, 100], mch: [27, 33], mchc: [32, 36], rdw: [11.5, 14.5],
  platelets: [150, 450], mpv: [7.5, 11.5], pdw: [9, 17], wbc: [4, 11],
  neutrophils_abs: [2, 7], neutrophils_pct: [40, 75], lymphocytes_abs: [1, 3], lymphocytes_pct: [20, 45],
  monocytes_abs: [0.2, 1], monocytes_pct: [2, 10], eosinophils_abs: [0, 0.5], eosinophils_pct: [1, 6], basophils_abs: [0, 0.1], basophils_pct: [0, 2],
  tsh: [0.4, 4.5], free_t4: [0.8, 1.8], free_t3: [2.3, 4.2], total_t3: [80, 200], total_t4: [5, 12],
  vitamin_d_25oh: [30, 100], vitamin_b12: [200, 900], folate: [3, 20],
  crp: [0, 5], hs_crp: [0, 3], esr: [0, 20], aso: [0, 200], rheumatoid_factor: [0, 14],
  inr: [0.8, 1.2], pt: [11, 13.5], aptt: [25, 35], d_dimer: [0, 0.5],
  psa_total: [0, 4], testosterone_total: [300, 1000], prolactin: [4, 25], cortisol: [5, 23],
  fsh: [1.5, 12], lh: [1.5, 9], estradiol: [15, 350], progesterone: [0.2, 25], amh: [1, 10],
  amylase: [30, 110], lipase: [10, 60], ck: [30, 200], ldh: [140, 280], troponin_hs: [0, 14],
  afp: [0, 10], cea: [0, 5], ca125: [0, 35], ca199: [0, 37],
  hcg: [0, 10],
  urine_pus: [0, 5], urine_rbc: [0, 3], urine_sg: [1.005, 1.03], urine_ph: [4.5, 8], stool_pus: [0, 5], stool_rbc: [0, 2],
}

/**
 * How different two ranges are, 0 = the same. The upper ends compare by ratio;
 * the lower ends by where they sit relative to the upper end, so "0 - 41" and
 * "7 - 40" are close while "70 - 100" and "0 - 100" are not.
 */
function rangeDistance(low: number | null, high: number, typical: [number, number]): number {
  if (high <= 0) return Infinity
  const highGap = Math.abs(Math.log(high / typical[1]))
  const lowGap = Math.abs((low ?? 0) / high - typical[0] / typical[1])
  return highGap + lowGap
}

// About a third off on the upper end, or the lower end in a different place, is still a fair guess.
const MAX_DISTANCE = 0.8

/**
 * Tests an unrecognized result might be, from its unit and printed range,
 * best first (at most 3). Needs a unit and at least the upper end of the range;
 * respects the sample the heading names (no blood tests for urine).
 */
export function suggestByRange(row: { unit: string | null | undefined; refLow: number | null; refHigh: number | null; section?: string | null }): string[] {
  if (!row.unit?.trim() || row.refHigh == null) return []
  const scored: { test: LabTest; score: number }[] = []
  for (const test of LAB_TESTS) {
    const typical = TYPICAL_RANGES[test.code]
    if (!typical || test.qualitative || !fitsSection(test.code, row.section)) continue
    const high = toCanonical(test, row.refHigh, row.unit)
    if (high == null) continue
    const low = row.refLow == null ? null : toCanonical(test, row.refLow, row.unit)
    const score = rangeDistance(low, high, typical)
    if (score <= MAX_DISTANCE) scored.push({ test, score })
  }
  return scored.sort((a, b) => a.score - b.score).slice(0, 3).map((s) => s.test.code)
}
