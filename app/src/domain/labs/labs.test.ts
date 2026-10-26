import { describe, expect, it } from 'vitest'
import { LAB_TESTS, getTest, learnedKey, matchTest, nameKeys, nameOnlyTest, normalizeUnit, toCanonical } from './catalog'
import { buildSeries, compareLatest, referenceChangeValue, type LabResultInput } from './compare'
import { draftStatus, guidelineFindings, liverElevationGrade, measurementStatus } from './rules'

// Fictional demo scenario (SPEC.md §12). Not real patient data.
function result(over: Partial<LabResultInput> & Pick<LabResultInput, 'id' | 'testCode' | 'value'>): LabResultInput {
  return {
    reportId: over.collectedAt === '2026-10-12' ? 'report-oct' : 'report-may',
    documentId: null,
    status: 'confirmed',
    collectedAt: '2026-05-10',
    unit: 'mg/dL',
    refLow: null,
    refHigh: null,
    ...over,
  }
}

const may = '2026-05-10'
const oct = '2026-10-12'
const demo: LabResultInput[] = [
  result({ id: 'ldl-may', testCode: 'ldl_c', value: 279, refHigh: 130, collectedAt: may }),
  result({ id: 'ldl-oct', testCode: 'ldl_c', value: 63, refHigh: 130, collectedAt: oct }),
  result({ id: 'tc-may', testCode: 'total_cholesterol', value: 341, refHigh: 200, collectedAt: may }),
  result({ id: 'tc-oct', testCode: 'total_cholesterol', value: 119, refHigh: 200, collectedAt: oct }),
  result({ id: 'alt-may', testCode: 'alt', value: 23, unit: 'U/L', refHigh: 41, collectedAt: may }),
  result({ id: 'alt-oct', testCode: 'alt', value: 50, unit: 'U/L', refHigh: 41, collectedAt: oct }),
  result({ id: 'ast-may', testCode: 'ast', value: 26, unit: 'U/L', refHigh: 40, collectedAt: may }),
  result({ id: 'ast-oct', testCode: 'ast', value: 34, unit: 'U/L', refHigh: 40, collectedAt: oct }),
]

const test = (code: string) => getTest(code)!

describe('demo scenario: cholesterol medication, May → October', () => {
  it('LDL fell substantially and is now within range', () => {
    const c = compareLatest(test('ldl_c'), buildSeries(test('ldl_c'), demo))!
    expect(c.absoluteChange).toBe(-216)
    expect(c.percentChange).toBe(-77.4)
    expect(c.significant).toBe(true)
    expect(c.trend).toBe('improving')
    expect(c.previous.documentId).toBeNull()
    expect([c.previous.reportId, c.current.reportId]).toEqual(['report-may', 'report-oct'])
  })

  it('total cholesterol improved', () => {
    const c = compareLatest(test('total_cholesterol'), buildSeries(test('total_cholesterol'), demo))!
    expect(c.absoluteChange).toBe(-222)
    expect(c.trend).toBe('improving')
  })

  it('ALT rose above the lab limit: borderline elevation, follow-up, not urgent', () => {
    const series = buildSeries(test('alt'), demo)
    const c = compareLatest(test('alt'), series)!
    expect(c.absoluteChange).toBe(27)
    expect(c.trend).toBe('worsening')
    expect(measurementStatus(test('alt'), c.current)).toBe('high')
    expect(liverElevationGrade(test('alt'), c.current)).toEqual({ grade: 'borderline', foldUln: 1.22 })
    const findings = guidelineFindings(test('alt'), c.current)
    expect(findings).toEqual([{ ruleId: 'liver_borderline', level: 'follow_up', sources: ['acg2017_liver'] }])
  })

  it('AST changed but stayed within range: neutral label, no alarm', () => {
    const c = compareLatest(test('ast'), buildSeries(test('ast'), demo))!
    expect(c.significant).toBe(true)
    expect(c.trend).toBe('changed_within_range')
    expect(measurementStatus(test('ast'), c.current)).toBe('within_range')
  })
})

describe('matching and units', () => {
  it('matches English, lab-style and Arabic names; leaves unknown names unmatched', () => {
    const code = (name: string, loinc?: string) => matchTest(name, loinc)?.code ?? null
    expect(code('SGPT (ALT)')).toBe('alt')
    expect(code('LDL-Cholesterol')).toBe('ldl_c')
    expect(code('السكر التراكمي')).toBe('hba1c')
    expect(code('LDL/HDL ratio')).toBe('ldl_hdl_ratio')
    expect(code('Lipoprotein (a)')).toBeNull()
    expect(code('anything', '2093-3')).toBe('total_cholesterol')
  })

  it('matches names the way Egyptian and US lab reports print them', () => {
    const code = (name: string) => matchTest(name)?.code ?? null
    expect(code('Serum Triglycerides')).toBe('triglycerides')
    expect(code('S. Triglycerides')).toBe('triglycerides')
    expect(code('الدهون الثلاثية')).toBe('triglycerides')
    expect(code('الدهون الثلاثيه')).toBe('triglycerides')
    expect(code('Cholesterol, Total')).toBe('total_cholesterol')
    expect(code('LDL Cholesterol (Calculated)')).toBe('ldl_c')
    expect(code('S.G.P.T')).toBe('alt')
    expect(code('S. Creatinine')).toBe('creatinine')
    expect(code('T. Bilirubin')).toBe('bilirubin_total')
    expect(code('Vit. D3')).toBe('vitamin_d_25oh')
    expect(code('25-OH Vitamin D')).toBe('vitamin_d_25oh')
    expect(code('Haemoglobin (Hb)')).toBe('hemoglobin')
    expect(code('W.B.Cs')).toBe('wbc')
    expect(code('Potassium (K)')).toBe('potassium')
  })

  it('no name points to two different tests', () => {
    const owner = new Map<string, string>()
    const clashes: string[] = []
    for (const t of LAB_TESTS) {
      for (const a of [...t.aliases, t.name.en, t.name.ar]) {
        const key = nameKeys(a)[0]
        if (owner.has(key) && owner.get(key) !== t.code) clashes.push(`${key}: ${owner.get(key)} / ${t.code}`)
        owner.set(key, owner.get(key) ?? t.code)
      }
    }
    expect(clashes).toEqual([])
  })

  it('recognizes lipid extras, blood count and common panels', () => {
    const code = (name: string) => matchTest(name)?.code ?? null
    expect(code('VLDL Cholesterol')).toBe('vldl_c')
    expect(code('Non-HDL Cholesterol')).toBe('non_hdl_c')
    expect(code('HDL Risk Factor')).toBe('chol_hdl_ratio')
    expect(code('Cholesterol/HDL Ratio')).toBe('chol_hdl_ratio')
    expect(code('PCV')).toBe('hematocrit')
    expect(code('Neutrophils')).toBe('neutrophils_pct')
    expect(code('Absolute Neutrophil Count')).toBe('neutrophils_abs')
    expect(code('Neutrophils #')).toBe('neutrophils_abs')
    expect(code('Neutrophils %')).toBe('neutrophils_pct')
    expect(code('Neutrophils (count)')).toBe('neutrophils_abs')
    expect(code('S. Uric Acid')).toBe('uric_acid')
    expect(code('Blood Urea')).toBe('urea')
    expect(code('BUN')).toBe('bun')
    expect(code('ESR 1st hour')).toBe('esr')
    expect(code('HCV Ab')).toBe('hcv_ab')
    expect(code('Ionized Calcium')).toBeNull()
  })

  it('converts the new units and accepts unitless ratios', () => {
    expect(toCanonical(test('urea'), 5, 'mmol/L')).toBeCloseTo(30.03, 1)
    expect(toCanonical(test('calcium'), 2.5, 'mmol/L')).toBeCloseTo(10.02, 1)
    expect(toCanonical(test('chol_hdl_ratio'), 4.2, '')).toBe(4.2)
    expect(toCanonical(test('chol_hdl_ratio'), 4.2, null)).toBe(4.2)
    expect(toCanonical(test('rbc'), 4.8, 'x10^12/L')).toBe(4.8)
    expect(toCanonical(test('esr'), 12, 'mm/1st hr')).toBe(12)
    expect(toCanonical(test('ldl_c'), 100, null)).toBeNull()
  })

  it('keeps tests that differ in meaning apart', () => {
    const code = (name: string) => matchTest(name)?.code ?? null
    expect(code('Glucose (Fasting)')).toBe('glucose_fasting')
    expect(code('Fasting Blood Sugar (FBS)')).toBe('glucose_fasting')
    expect(code('Random Blood Sugar')).toBe('glucose')
    expect(code('Direct Bilirubin')).toBe('bilirubin_direct')
    expect(code('2 Hours Post Prandial Glucose')).toBe('glucose_2h_pp')
  })

  it('prefers what the user taught the app', () => {
    const learned = new Map([[learnedKey('Lipid A'), 'triglycerides']])
    expect(matchTest('Lipid A', null, learned)).toEqual({ code: 'triglycerides', source: 'learned' })
    expect(matchTest('lipid a', null, learned)?.code).toBe('triglycerides')
    expect(matchTest('Serum Triglycerides')).toEqual({ code: 'triglycerides', source: 'catalog' })
  })

  it('normalizes unit spellings', () => {
    expect(normalizeUnit('x10^3/µL')).toBe('10^3/ul')
    expect(normalizeUnit(' mg/dL ')).toBe('mg/dl')
    expect(normalizeUnit('µmol/L')).toBe('umol/l')
  })

  it('converts mmol/L cholesterol so mixed-unit reports compare', () => {
    const series = buildSeries(test('ldl_c'), [
      result({ id: 'a', testCode: 'ldl_c', value: 7.21, unit: 'mmol/L', refHigh: 3.36, collectedAt: may }),
      result({ id: 'b', testCode: 'ldl_c', value: 63, refHigh: 130, collectedAt: oct }),
    ])
    expect(series.points[0].value).toBeCloseTo(278.81, 1)
    expect(series.points[0].refHigh).toBeCloseTo(129.93, 1)
    expect(compareLatest(test('ldl_c'), series)!.trend).toBe('improving')
  })

  it('converts HbA1c IFCC mmol/mol to NGSP %', () => {
    expect(toCanonical(test('hba1c'), 48, 'mmol/mol')).toBeCloseTo(6.54, 2)
  })

  it('refuses units outside the whitelist instead of guessing', () => {
    const series = buildSeries(test('ldl_c'), [
      result({ id: 'a', testCode: 'ldl_c', value: 279, collectedAt: may }),
      result({ id: 'b', testCode: 'ldl_c', value: 0.63, unit: 'g/L', collectedAt: oct }),
    ])
    expect(series.points).toHaveLength(1)
    expect(series.excluded).toEqual([{ resultId: 'b', reason: 'unit_not_convertible' }])
    expect(compareLatest(test('ldl_c'), series)).toBeNull()
  })
})

describe('data lifecycle', () => {
  it('ignores drafts and discarded results', () => {
    const series = buildSeries(test('alt'), [
      ...demo.filter((r) => r.testCode === 'alt'),
      result({ id: 'alt-draft', testCode: 'alt', value: 400, unit: 'U/L', status: 'draft', collectedAt: '2026-10-20' }),
    ])
    expect(series.points.map((p) => p.resultId)).toEqual(['alt-may', 'alt-oct'])
    expect(series.excluded).toContainEqual({ resultId: 'alt-draft', reason: 'not_confirmed' })
  })

  it('a corrected value changes the comparison immediately (computed on read)', () => {
    const corrected = demo.map((r) => (r.id === 'alt-oct' ? { ...r, value: 30 } : r))
    const c = compareLatest(test('alt'), buildSeries(test('alt'), corrected))!
    expect(c.current.value).toBe(30)
    expect(c.trend).toBe('stable')
    expect(liverElevationGrade(test('alt'), c.current)).toBeNull()
  })

  it('does not calculate change for censored values like "<5"', () => {
    const c = compareLatest(
      test('alt'),
      buildSeries(test('alt'), [
        result({ id: 'a', testCode: 'alt', value: 5, comparator: '<', unit: 'U/L', collectedAt: may }),
        result({ id: 'b', testCode: 'alt', value: 30, unit: 'U/L', collectedAt: oct }),
      ]),
    )!
    expect(c.trend).toBe('not_comparable')
    expect(c.reason).toBe('censored_value')
  })

  it('without a reported range, reports a change without judging direction', () => {
    const c = compareLatest(
      test('ldl_c'),
      buildSeries(test('ldl_c'), [
        result({ id: 'a', testCode: 'ldl_c', value: 160, collectedAt: may }),
        result({ id: 'b', testCode: 'ldl_c', value: 100, collectedAt: oct }),
      ]),
    )!
    expect(c.trend).toBe('changed')
  })
})

describe('tests the catalog does not know', () => {
  it('builds a history from the same printed name and unit, without judging the change', () => {
    const lpa = nameOnlyTest('Lipoprotein (a)', 'mg/dL')
    const same = nameOnlyTest('LIPOPROTEIN (A)', 'mg/dl')
    expect(same.code).toBe(lpa.code)
    expect(nameOnlyTest('Lipoprotein (a)', 'nmol/L').code).not.toBe(lpa.code)

    const rows = [
      result({ id: 'a', testCode: lpa.code, value: 30, unit: 'mg/dL', refHigh: 30, collectedAt: may }),
      result({ id: 'b', testCode: lpa.code, value: 60, unit: 'mg/dl', refHigh: 30, collectedAt: oct }),
    ]
    const c = compareLatest(lpa, buildSeries(lpa, rows))!
    expect(c.absoluteChange).toBe(30)
    expect(c.trend).toBe('changed')
    expect(c.significant).toBeNull()
  })
})

describe('draft status on the review screen', () => {
  it('decides high/low/within from the printed range, for matched and unmatched tests', () => {
    expect(draftStatus(test('triglycerides'), { value: 50, unit: 'mg/dL', refLow: 0, refHigh: 150 })).toBe('within_range')
    expect(draftStatus(test('triglycerides'), { value: 210, unit: 'mg/dL', refHigh: 150 })).toBe('high')
    expect(draftStatus(undefined, { value: 2, unit: 'mg/L', refLow: 3, refHigh: 9 })).toBe('low')
    expect(draftStatus(undefined, { value: 2, unit: 'mg/L' })).toBe('no_range')
  })

  it('uses critical limits and lab critical flags; ignores censored values', () => {
    expect(draftStatus(test('potassium'), { value: 6.8, unit: 'mmol/L', refLow: 3.5, refHigh: 5.1 })).toBe('urgent')
    expect(draftStatus(undefined, { value: 8, refLow: 12, labFlag: 'critical_low' })).toBe('urgent')
    expect(draftStatus(test('alt'), { value: 5, comparator: '<', unit: 'U/L', refHigh: 41 })).toBeNull()
  })
})

describe('significance and safety rules', () => {
  it('computes reference change values from EFLM CVi', () => {
    expect(referenceChangeValue(7.8)).toBeCloseTo(24.17, 1) // LDL
    expect(referenceChangeValue(12.6)).toBeCloseTo(39.05, 1) // ALT
  })

  it('small changes are stable', () => {
    const c = compareLatest(
      test('ldl_c'),
      buildSeries(test('ldl_c'), [
        result({ id: 'a', testCode: 'ldl_c', value: 120, refHigh: 130, collectedAt: may }),
        result({ id: 'b', testCode: 'ldl_c', value: 135, refHigh: 130, collectedAt: oct }),
      ]),
    )!
    expect(c.trend).toBe('stable')
  })

  it('in-range tests improve when moving back toward the range', () => {
    const c = compareLatest(
      test('potassium'),
      buildSeries(test('potassium'), [
        result({ id: 'a', testCode: 'potassium', value: 2.9, unit: 'mmol/L', refLow: 3.5, refHigh: 5.1, collectedAt: may }),
        result({ id: 'b', testCode: 'potassium', value: 4.0, unit: 'mEq/L', refLow: 3.5, refHigh: 5.1, collectedAt: oct }),
      ]),
    )!
    expect(c.trend).toBe('improving')
  })

  it('critical limits and lab critical flags are urgent; ordinary abnormal results are not', () => {
    const [k] = buildSeries(test('potassium'), [
      result({ id: 'k', testCode: 'potassium', value: 6.5, unit: 'mmol/L', refLow: 3.5, refHigh: 5.1 }),
    ]).points
    expect(measurementStatus(test('potassium'), k)).toBe('urgent')

    const [flagged] = buildSeries(test('hemoglobin'), [
      result({ id: 'h', testCode: 'hemoglobin', value: 8, unit: 'g/dL', refLow: 12, labFlag: 'critical_low' }),
    ]).points
    expect(measurementStatus(test('hemoglobin'), flagged)).toBe('urgent')

    const [mild] = buildSeries(test('hemoglobin'), [
      result({ id: 'h2', testCode: 'hemoglobin', value: 11.2, unit: 'g/dL', refLow: 12, refHigh: 15.5 }),
    ]).points
    expect(measurementStatus(test('hemoglobin'), mild)).toBe('low')
  })

  it('applies guideline thresholds with their sources', () => {
    const point = (code: string, value: number, unit: string) =>
      buildSeries(test(code), [result({ id: code, testCode: code, value, unit })]).points[0]
    expect(guidelineFindings(test('ldl_c'), point('ldl_c', 195, 'mg/dL'))[0].ruleId).toBe('ldl_severe_190')
    expect(guidelineFindings(test('hba1c'), point('hba1c', 6.0, '%'))[0].ruleId).toBe('hba1c_prediabetes_range')
    expect(guidelineFindings(test('hba1c'), point('hba1c', 48, 'mmol/mol'))[0].ruleId).toBe('hba1c_diabetes_range')
    expect(guidelineFindings(test('egfr'), point('egfr', 52, 'mL/min/1.73m²'))[0].ruleId).toBe('egfr_G3a')
    expect(guidelineFindings(test('glucose'), point('glucose', 50, 'mg/dL'))[0].level).toBe('urgent')
  })
})

describe('matching printed names', () => {
  it('ignores list numbering and bullets in front of a name', () => {
    expect(matchTest('3. S. Creatinine')?.code).toBe('creatinine')
    expect(matchTest('• Triglycerides')?.code).toBe('triglycerides')
  })

  it('accepts a one-letter typo only when the unit fits, and flags it as close', () => {
    expect(matchTest('Creatinin', null, undefined, { unit: 'mg/dL' })).toEqual({ code: 'creatinine', source: 'close' })
    expect(matchTest('Creatinin', null, undefined, { unit: 'U/L' })).toBeNull()
    expect(matchTest('Creatinin')).toBeNull() // no unit, no guess
  })

  it('never guesses short codes from a typo', () => {
    expect(matchTest('TGG', null, undefined, { unit: 'mg/dL' })).toBeNull()
  })

  it('uses names shared by other users after its own list', () => {
    const shared = new Map([['s uric acid level', 'uric_acid'], ['lipid x', 'not_a_test']])
    expect(matchTest('S Uric Acid Level', null, undefined, { shared })?.code).toBe('uric_acid')
    expect(matchTest('Lipid X', null, undefined, { shared })).toBeNull() // unknown codes are ignored
  })
})

describe('catalog kept in step with the reading service', () => {
  it('offers the AI exactly the tests the app knows', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const server = readFileSync(resolve(__dirname, '../../../../supabase/functions/extract-document/index.ts'), 'utf8')
    const list = server.slice(server.indexOf('const CATALOG'), server.indexOf('const CATALOG_CODES'))
    const codes = [...list.matchAll(/\['([a-z0-9_]+)',/g)].map((m) => m[1]).sort()
    expect(codes).toEqual(LAB_TESTS.map((t) => t.code).sort())
  })
})

describe('section headings', () => {
  it('reads RBCs, pus cells and pH under a urine heading as urine values', () => {
    expect(matchTest('RBCs', null, undefined, { section: 'Urine Analysis', unit: '/HPF' })?.code).toBe('urine_rbc')
    expect(matchTest('RBCs', null, undefined, { section: 'Complete Blood Count' })?.code).toBe('rbc')
    expect(matchTest('pH', null, undefined, { section: 'تحليل البول' })?.code).toBe('urine_ph')
    expect(matchTest('Pus cells', null, undefined, { section: 'Urine Analysis' })?.code).toBe('urine_pus')
  })
})
