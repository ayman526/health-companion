import { describe, expect, it } from 'vitest'
import { matchTest, sectionsInContext, getTest, unitFits } from './catalog'

// Every row of two real Egyptian lab reports (a chemistry and thyroid report, and a stool,
// urine, blood count and Widal report), as the reading service sends them: name, heading path, unit.
type Row = [name: string, section: string, unit: string, expected: string]

const CHEMISTRY: Row[] = [
  ['Haemoglobin A1C', 'Diabetic Profile', '%', 'hba1c'],
  ['SGPT (ALT)', 'Liver Function Tests', 'U/L', 'alt'], ['SGOT (AST)', 'Liver Function Tests', 'U/L', 'ast'],
  ['Serum Creatinine', 'Kidney Function Tests', 'mg/dL', 'creatinine'], ['Blood Urea Nitrogen (BUN)', 'Kidney Function Tests', 'mg/dL', 'bun'],
  ['Serum Total Cholesterol', 'Lipid Profile', 'mg/dL', 'total_cholesterol'], ['Serum Triglycerides', 'Lipid Profile', 'mg/dL', 'triglycerides'],
  ['HDL Cholesterol', 'Lipid Profile', 'mg/dL', 'hdl_c'], ['LDL Cholesterol', 'Lipid Profile', 'mg/dL', 'ldl_c'], ['VLDL Cholesterol', 'Lipid Profile', 'mg/dL', 'vldl_c'],
  ['Non-HDL cholesterol', 'Lipid Profile', 'mg/dL', 'non_hdl_c'], ['HDL Risk Factor', 'Lipid Profile', '', 'chol_hdl_ratio'],
  ['TSH', 'Thyroid Function Tests', 'uIU/mL', 'tsh'], ['Free T3', 'Thyroid Function Tests', 'pg/mL', 'free_t3'], ['Free T4', 'Thyroid Function Tests', 'ng/dL', 'free_t4'],
]

const urine = (name: string, part: 'Macroscopic' | 'Microscopic', unit: string, expected: string): Row => [name, `Urine Analysis > ${part} Examination`, unit, expected]
const stool = (name: string, part: string, unit: string, expected: string): Row => [name, `Stool Analysis > ${part}`, unit, expected]
const cbc = (name: string, part: string, unit: string, expected: string): Row => [name, `Complete Blood Picture${part ? ` > ${part}` : ''}`, unit, expected]

const MIXED: Row[] = [
  stool('Colour', 'MACROSCOPIC EXAMINATION', '', 'stool_colour'), stool('Odour', 'MACROSCOPIC EXAMINATION', '', 'stool_odour'),
  stool('Consistency', 'MACROSCOPIC EXAMINATION', '', 'stool_consistency'), stool('Mucus', 'MACROSCOPIC EXAMINATION', '', 'stool_mucus'),
  stool('Blood', 'MACROSCOPIC EXAMINATION', '', 'stool_blood'), stool('pH', 'MACROSCOPIC EXAMINATION', '', 'stool_ph'),
  stool('Worms', 'MACROSCOPIC EXAMINATION', '', 'stool_ova'), stool('Undigested Food', 'MACROSCOPIC EXAMINATION', '', 'stool_undigested_food'),
  stool('Vegetable Cells', 'MICROSCOPIC EXAMINATION > 1. Digestion', '', 'stool_vegetable_cells'), stool('Starch', 'MICROSCOPIC EXAMINATION > 1. Digestion', '', 'stool_starch'),
  stool('Muscle Fibers', 'MICROSCOPIC EXAMINATION > 1. Digestion', '', 'stool_muscle_fibers'), stool('Fat', 'MICROSCOPIC EXAMINATION > 1. Digestion', '', 'stool_fat'),
  stool('Pus Cells', 'MICROSCOPIC EXAMINATION > 2. Cytology', '/H.P.F', 'stool_pus'), stool('RBCs', 'MICROSCOPIC EXAMINATION > 2. Cytology', '/H.P.F.', 'stool_rbc'),
  stool('Epithelial Cells', 'MICROSCOPIC EXAMINATION > 2. Cytology', '', 'stool_epithelial'), stool('Yeast Cells', 'MICROSCOPIC EXAMINATION > 2. Cytology', '', 'stool_yeast'),
  stool('Protozoa', 'MICROSCOPIC EXAMINATION > 3. Parasites', '', 'stool_protozoa'), stool('Helminths', 'MICROSCOPIC EXAMINATION > 3. Parasites', '', 'stool_ova'),

  urine('Colour', 'Macroscopic', '', 'urine_colour'), urine('Aspect', 'Macroscopic', '', 'urine_appearance'), urine('Volume', 'Macroscopic', 'mL', 'urine_volume'),
  urine('Reaction', 'Macroscopic', '', 'urine_ph'), urine('Specific Gravity in urine', 'Macroscopic', '', 'urine_sg'), urine('Nitrite', 'Macroscopic', '', 'urine_nitrite'),
  urine('Albumin', 'Macroscopic', '', 'urine_protein'), urine('Sugar', 'Macroscopic', '', 'urine_glucose'), urine('Acetone', 'Macroscopic', '', 'urine_ketones'),
  urine('Bile Salts', 'Macroscopic', '', 'urine_bile_salts'), urine('Bile Pigments', 'Macroscopic', '', 'urine_bilirubin'), urine('Urobilinogen', 'Macroscopic', '', 'urine_urobilinogen'),
  urine('Leukocyte esterase', 'Macroscopic', '', 'urine_leukocyte_esterase'),
  urine('RBCs', 'Microscopic', '/H.P.F', 'urine_rbc'), urine('Pus Cells', 'Microscopic', '/H.P.F.', 'urine_pus'), urine('Epithelial Cells', 'Microscopic', '', 'urine_epithelial'),
  urine('Casts', 'Microscopic', '', 'urine_casts'), urine('Ova', 'Microscopic', '', 'urine_ova'), urine('Crystals', 'Microscopic', '', 'urine_crystals'),
  urine('Mucus', 'Microscopic', '', 'urine_mucus'), urine('Yeast Cells', 'Microscopic', '', 'urine_yeast'), urine('Trichomonas vaginalis', 'Microscopic', '', 'urine_trichomonas'),

  cbc('Neutrophils', 'Percent Values', '%', 'neutrophils_pct'), cbc('Lymphocytes', 'Percent Values', '%', 'lymphocytes_pct'), cbc('Monocytes', 'Percent Values', '%', 'monocytes_pct'),
  cbc('Eosinophils', 'Percent Values', '%', 'eosinophils_pct'), cbc('Basophils', 'Percent Values', '%', 'basophils_pct'),
  cbc('Neutrophils', 'Absolute Values', 'x10^9/L', 'neutrophils_abs'), cbc('Lymphocytes', 'Absolute Values', 'x10^9/L', 'lymphocytes_abs'), cbc('Monocytes', 'Absolute Values', 'x10^9/L', 'monocytes_abs'),
  cbc('Eosinophils', 'Absolute Values', 'x10^9/L', 'eosinophils_abs'), cbc('Basophils', 'Absolute Values', 'x10^9/L', 'basophils_abs'),
  cbc('Haemoglobin (EDTA Blood)', '', 'g/dL', 'hemoglobin'), cbc('Haematocrit (PCV)', '', '%', 'hematocrit'), cbc('RBCs Count (EDTA Blood)', '', 'Millions / cmm', 'rbc'),
  cbc('MCV', '', 'fl', 'mcv'), cbc('MCH', '', 'pg', 'mch'), cbc('MCHC', '', 'g/dL', 'mchc'), cbc('RDW-CV', '', '%', 'rdw'),
  cbc('Platelet Count', '', 'Thousands / cmm', 'platelets'), cbc('Total Leucocytic Count (EDTA Blood)', '', 'Thousands / cmm', 'wbc'),

  ['Salmonella Typhi "O"', 'WIDAL TEST REPORT', '', 'widal_typhi_o'], ['Salmonella Typhi "H"', 'WIDAL TEST REPORT', '', 'widal_typhi_h'],
  ['Salmonella Paratyphi "A"', 'WIDAL TEST REPORT', '', 'widal_paratyphi_a'], ['Salmonella Paratyphi "B"', 'WIDAL TEST REPORT', '', 'widal_paratyphi_b'],
]

describe('two real lab reports', () => {
  for (const [title, rows] of [['chemistry and thyroid report', CHEMISTRY], ['stool, urine, blood count and Widal report', MIXED]] as const) {
    it(`matches every row of the ${title}, with a unit that fits`, () => {
      const sections = sectionsInContext(rows.map(([name, section]) => ({ name, section })))
      const got = rows.map(([name, , unit], i) => matchTest(name, null, undefined, { section: sections[i], unit, numeric: unit !== '' })?.code ?? null)
      expect(got).toEqual(rows.map((r) => r[3]))
      rows.forEach(([, , unit], i) => {
        const test = getTest(got[i]!)!
        if (unit && !test.qualitative) expect(unitFits(test, unit), `${got[i]} with "${unit}"`).toBe(true)
      })
    })
  }

  it('does not mix up the percentage and the absolute count', () => {
    expect(matchTest('Neutrophils', null, undefined, { unit: '%', numeric: true })?.code).toBe('neutrophils_pct')
    expect(matchTest('Neutrophils', null, undefined, { unit: 'x10^9/L', numeric: true })?.code).toBe('neutrophils_abs')
    expect(matchTest('Neutrophils', null, undefined, { unit: '10^3/uL', numeric: true })?.code).toBe('neutrophils_abs')
  })

  it('reads the name with or without the quotes around the letter', () => {
    expect(matchTest('Salmonella Typhi O')?.code).toBe('widal_typhi_o')
    expect(matchTest('Salmonella Paratyphi “A”')?.code).toBe('widal_paratyphi_a')
  })
})
