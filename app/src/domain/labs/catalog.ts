import type { SourceId } from './sources'

export type Direction = 'lower_better' | 'higher_better' | 'in_range'
export type Category =
  | 'lipids' | 'glucose' | 'liver' | 'kidney' | 'electrolytes' | 'minerals' | 'iron' | 'cbc' | 'thyroid' | 'vitamins'
  | 'inflammation' | 'coagulation' | 'hormones' | 'pancreas' | 'muscle' | 'infection' | 'urine' | 'stool' | 'other'

/** value_in_canonical = value * scale + offset */
export interface UnitConversion {
  scale: number
  offset?: number
}

export interface CriticalLimits {
  low?: number
  high?: number
  sources: SourceId[]
}

export interface LabTest {
  code: string
  loinc: string[]
  name: { en: string; ar: string }
  aliases: string[]
  category: Category
  canonicalUnit: string
  /** Keys are normalized unit strings (see normalizeUnit). */
  units: Record<string, UnitConversion>
  direction: Direction
  /** Within-subject biological variation, % (EFLM). Absent: changes are shown but not judged as significant. */
  cvi?: number
  /** Positive/negative style result with no numeric comparison. */
  qualitative?: boolean
  /** Grade elevation by fold of the reported upper limit (ACG 2017). */
  foldUlnGrading?: boolean
  critical?: CriticalLimits
}

const same: UnitConversion = { scale: 1 }

// Molar ↔ mass factors are standard SI conversion factors.
const CHOL_MMOL = { scale: 38.67 }
const enzymeUnits = { 'u/l': same, 'iu/l': same }
const COUNT = { '10^3/ul': same, '10^9/l': same, '10^3/mm3': same }
const PERCENT = { '%': same }
const RATIO = { '': same, 'ratio': same }
const SECONDS = { 's': same, 'sec': same, 'seconds': same }

export const LAB_TESTS: LabTest[] = [
  // ---------------------------------------------------------------- lipids
  {
    code: 'total_cholesterol', loinc: ['2093-3'], category: 'lipids',
    name: { en: 'Total cholesterol', ar: 'الكوليسترول الكلي' },
    aliases: ['cholesterol', 'total cholesterol', 'cholesterol total', 'chol', 'tc', 't chol', 't cholesterol', 'الكوليسترول', 'الكوليسترول الكلي', 'كوليسترول كلي', 'كوليسترول'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': CHOL_MMOL },
    direction: 'lower_better', cvi: 5.4,
  },
  {
    code: 'ldl_c', loinc: ['13457-7', '18262-6', '2089-1'], category: 'lipids',
    name: { en: 'LDL cholesterol', ar: 'الكوليسترول الضار (LDL)' },
    aliases: ['ldl', 'ldl-c', 'ldl c', 'ldl cholesterol', 'ldl-cholesterol', 'low density lipoprotein', 'low density lipoprotein cholesterol', 'ldl calculated', 'ldl direct', 'direct ldl', 'calculated ldl', 'الكوليسترول الضار', 'كوليسترول ضار', 'الدهون الضارة'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': CHOL_MMOL },
    direction: 'lower_better', cvi: 7.8,
  },
  {
    code: 'hdl_c', loinc: ['2085-9'], category: 'lipids',
    name: { en: 'HDL cholesterol', ar: 'الكوليسترول النافع (HDL)' },
    aliases: ['hdl', 'hdl-c', 'hdl c', 'hdl cholesterol', 'hdl-cholesterol', 'high density lipoprotein', 'high density lipoprotein cholesterol', 'الكوليسترول النافع', 'كوليسترول نافع', 'الدهون النافعة', 'الكوليسترول الجيد'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': CHOL_MMOL },
    direction: 'higher_better', cvi: 5.7,
  },
  {
    code: 'triglycerides', loinc: ['2571-8'], category: 'lipids',
    name: { en: 'Triglycerides', ar: 'الدهون الثلاثية' },
    aliases: ['triglycerides', 'triglyceride', 'tg', 'tgs', 'trig', 'trigs', 'triacylglycerol', 'الدهون الثلاثية', 'دهون ثلاثية', 'الدهون الثلاثيه'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 88.57 } },
    direction: 'lower_better', cvi: 19.8,
  },
  // ---------------------------------------------------------------- glucose
  {
    code: 'glucose_fasting', loinc: ['1558-6'], category: 'glucose',
    name: { en: 'Fasting glucose', ar: 'سكر صائم' },
    aliases: ['fasting glucose', 'fasting blood glucose', 'fasting blood sugar', 'fasting plasma glucose', 'fbs', 'fbg', 'fpg', 'glucose fasting', 'blood sugar fasting', 'سكر صائم', 'السكر الصائم', 'سكر الدم صائم'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 18.016 } },
    direction: 'in_range', cvi: 4.7,
    critical: { low: 54, high: 400, sources: ['ada2025_hypo', 'critical_values'] },
  },
  {
    // Random or unspecified timing. Never compared with fasting results.
    code: 'glucose', loinc: ['2345-7'], category: 'glucose',
    name: { en: 'Glucose (random)', ar: 'سكر عشوائي' },
    aliases: ['glucose', 'blood glucose', 'blood sugar', 'random blood sugar', 'random blood glucose', 'random glucose', 'rbs', 'rbg', 'سكر عشوائي', 'السكر العشوائي', 'سكر الدم'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 18.016 } },
    direction: 'in_range', cvi: 4.7,
    critical: { low: 54, high: 400, sources: ['ada2025_hypo', 'critical_values'] },
  },
  {
    code: 'hba1c', loinc: ['4548-4', '17856-6', '59261-8'], category: 'glucose',
    name: { en: 'HbA1c', ar: 'السكر التراكمي (HbA1c)' },
    aliases: ['hba1c', 'hb a1c', 'a1c', 'hemoglobin a1c', 'haemoglobin a1c', 'glycated hemoglobin', 'glycated haemoglobin', 'glycosylated hemoglobin', 'glycosylated haemoglobin', 'glycohemoglobin', 'السكر التراكمي', 'الهيموجلوبين السكري', 'سكر تراكمي'],
    // NGSP % = 0.09148 × IFCC mmol/mol + 2.152 (NGSP/IFCC master equation)
    canonicalUnit: '%', units: { '%': same, 'mmol/mol': { scale: 0.09148, offset: 2.152 } },
    direction: 'lower_better', cvi: 1.2,
  },
  // ---------------------------------------------------------------- liver
  {
    code: 'alt', loinc: ['1742-6'], category: 'liver',
    name: { en: 'ALT', ar: 'إنزيم ALT' },
    aliases: ['alt', 'sgpt', 'alanine aminotransferase', 'alanine transaminase', 'alt sgpt', 'sgpt alt', 'alat', 'gpt'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'lower_better', cvi: 12.6, foldUlnGrading: true,
  },
  {
    code: 'ast', loinc: ['1920-8'], category: 'liver',
    name: { en: 'AST', ar: 'إنزيم AST' },
    aliases: ['ast', 'sgot', 'aspartate aminotransferase', 'aspartate transaminase', 'ast sgot', 'sgot ast', 'asat', 'got'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'lower_better', cvi: 8.4, foldUlnGrading: true,
  },
  {
    code: 'ggt', loinc: ['2324-2'], category: 'liver',
    name: { en: 'GGT', ar: 'إنزيم GGT' },
    aliases: ['ggt', 'gamma gt', 'g gt', 'gamma-glutamyl transferase', 'gamma glutamyl transferase', 'gamma glutamyl transpeptidase', 'ggtp'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'lower_better', cvi: 8.3,
  },
  {
    code: 'alp', loinc: ['6768-6'], category: 'liver',
    name: { en: 'Alkaline phosphatase', ar: 'الفوسفاتيز القلوي' },
    aliases: ['alp', 'alkaline phosphatase', 'alk phos', 'alk phosphatase', 'الفوسفاتيز القلوي'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'in_range', cvi: 6.45,
  },
  {
    code: 'bilirubin_total', loinc: ['1975-2'], category: 'liver',
    name: { en: 'Total bilirubin', ar: 'البيليروبين الكلي' },
    aliases: ['total bilirubin', 'bilirubin total', 't bilirubin', 'tbil', 't bil', 'bilirubin', 'البيليروبين الكلي'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'umol/l': { scale: 1 / 17.1 } },
    direction: 'in_range', cvi: 20.2,
  },
  {
    code: 'albumin', loinc: ['1751-7'], category: 'liver',
    name: { en: 'Albumin', ar: 'الألبومين' },
    aliases: ['albumin', 'alb', 'الألبومين', 'الزلال'],
    canonicalUnit: 'g/dL', units: { 'g/dl': same, 'g/l': { scale: 0.1 } },
    direction: 'in_range', cvi: 2.5,
  },
  // ---------------------------------------------------------------- kidney
  {
    code: 'creatinine', loinc: ['2160-0'], category: 'kidney',
    name: { en: 'Creatinine', ar: 'الكرياتينين' },
    aliases: ['creatinine', 'creat', 'cr', 'creatinine level', 'الكرياتينين', 'كرياتينين'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'umol/l': { scale: 1 / 88.42 } },
    direction: 'in_range', cvi: 4.4,
  },
  {
    code: 'egfr', loinc: ['98979-8', '62238-1', '33914-3'], category: 'kidney',
    name: { en: 'eGFR', ar: 'معدل الترشيح الكلوي (eGFR)' },
    aliases: ['egfr', 'e gfr', 'estimated gfr', 'gfr', 'estimated glomerular filtration rate', 'egfr ckd epi', 'معدل الترشيح الكلوي'],
    canonicalUnit: 'mL/min/1.73m²', units: { 'ml/min/1.73m2': same, 'ml/min': same },
    // No EFLM entry in our table; creatinine CVI is used as a conservative proxy.
    direction: 'higher_better', cvi: 4.4,
  },
  // ---------------------------------------------------------------- electrolytes
  {
    code: 'sodium', loinc: ['2951-2'], category: 'electrolytes',
    name: { en: 'Sodium', ar: 'الصوديوم' },
    aliases: ['sodium', 'na', 'na+', 'الصوديوم', 'صوديوم'],
    canonicalUnit: 'mmol/L', units: { 'mmol/l': same, 'meq/l': same },
    direction: 'in_range', cvi: 0.6,
    critical: { low: 120, high: 160, sources: ['critical_values'] },
  },
  {
    code: 'potassium', loinc: ['2823-3'], category: 'electrolytes',
    name: { en: 'Potassium', ar: 'البوتاسيوم' },
    aliases: ['potassium', 'k', 'k+', 'البوتاسيوم', 'بوتاسيوم'],
    canonicalUnit: 'mmol/L', units: { 'mmol/l': same, 'meq/l': same },
    direction: 'in_range', cvi: 3.9,
    critical: { low: 2.8, high: 6.2, sources: ['critical_values'] },
  },
  // ---------------------------------------------------------------- CBC
  {
    code: 'hemoglobin', loinc: ['718-7'], category: 'cbc',
    name: { en: 'Hemoglobin', ar: 'الهيموجلوبين' },
    aliases: ['hemoglobin', 'haemoglobin', 'hb', 'hgb', 'الهيموجلوبين', 'هيموجلوبين', 'خضاب الدم'],
    canonicalUnit: 'g/dL', units: { 'g/dl': same, 'g/l': { scale: 0.1 } },
    direction: 'in_range', cvi: 2.7,
    critical: { low: 7.0, sources: ['critical_values'] },
  },
  {
    code: 'platelets', loinc: ['777-3'], category: 'cbc',
    name: { en: 'Platelets', ar: 'الصفائح الدموية' },
    aliases: ['platelets', 'platelet count', 'plt', 'plts', 'platelet', 'الصفائح الدموية', 'الصفائح'],
    canonicalUnit: '10³/µL', units: { '10^3/ul': same, '10^9/l': same, '10^3/mm3': same },
    direction: 'in_range', cvi: 7.3,
  },
  {
    code: 'wbc', loinc: ['6690-2'], category: 'cbc',
    name: { en: 'White blood cells', ar: 'كرات الدم البيضاء' },
    aliases: ['wbc', 'wbcs', 'white blood cells', 'white blood cell count', 'leukocytes', 'leucocytes', 'tlc', 'total leucocytic count', 'total leukocyte count', 'كرات الدم البيضاء'],
    canonicalUnit: '10³/µL', units: { '10^3/ul': same, '10^9/l': same, '10^3/mm3': same },
    direction: 'in_range', cvi: 11.1,
  },
  // ---------------------------------------------------------------- thyroid
  {
    code: 'tsh', loinc: ['3016-3'], category: 'thyroid',
    name: { en: 'TSH', ar: 'الهرمون المنبه للغدة الدرقية (TSH)' },
    aliases: ['tsh', 'thyroid stimulating hormone', 'thyrotropin', 'ultrasensitive tsh', 'us tsh', 'هرمون الغدة الدرقية tsh'],
    canonicalUnit: 'mIU/L', units: { 'miu/l': same, 'uiu/ml': same },
    direction: 'in_range', cvi: 17.9,
  },
  {
    code: 'free_t4', loinc: ['3024-7'], category: 'thyroid',
    name: { en: 'Free T4', ar: 'هرمون T4 الحر' },
    aliases: ['free t4', 'ft4', 'free thyroxine', 'f t4'],
    canonicalUnit: 'ng/dL', units: { 'ng/dl': same, 'pmol/l': { scale: 1 / 12.87 } },
    direction: 'in_range', cvi: 4.8,
  },
  // ---------------------------------------------------------------- vitamins and minerals
  {
    code: 'vitamin_d_25oh', loinc: ['1989-3', '62292-8'], category: 'vitamins',
    name: { en: 'Vitamin D (25-OH)', ar: 'فيتامين د' },
    aliases: ['vitamin d', 'vit d', 'vitamin d3', 'vit d3', 'vitamin d total', '25 oh vitamin d', '25-oh vitamin d', '25 oh vit d', '25-hydroxy vitamin d', '25 hydroxy vitamin d', '25(oh)d', '25 oh d', 'فيتامين د', 'فيتامين د3'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'nmol/l': { scale: 1 / 2.496 } },
    direction: 'in_range', cvi: 6.8,
  },
  {
    code: 'vitamin_b12', loinc: ['2132-9'], category: 'vitamins',
    name: { en: 'Vitamin B12', ar: 'فيتامين ب12' },
    aliases: ['vitamin b12', 'vit b12', 'b12', 'cobalamin', 'cyanocobalamin', 'فيتامين ب12', 'فيتامين ب 12'],
    canonicalUnit: 'pg/mL', units: { 'pg/ml': same, 'pmol/l': { scale: 1.355 } },
    direction: 'in_range', cvi: 7.2,
  },
  {
    code: 'ferritin', loinc: ['2276-4'], category: 'vitamins',
    name: { en: 'Ferritin', ar: 'الفيريتين' },
    aliases: ['ferritin', 'الفيريتين', 'مخزون الحديد'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same },
    direction: 'in_range', cvi: 12.9,
  },
  // ---------------------------------------------------------------- lipids (derived and extra)
  {
    code: 'vldl_c', loinc: ['13458-5'], category: 'lipids',
    name: { en: 'VLDL cholesterol', ar: 'الكوليسترول منخفض الكثافة جدًا (VLDL)' },
    aliases: ['vldl', 'vldl c', 'vldl cholesterol', 'very low density lipoprotein', 'very low density lipoprotein cholesterol', 'vldl calculated'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': CHOL_MMOL },
    direction: 'lower_better', cvi: 27.6,
  },
  {
    code: 'non_hdl_c', loinc: ['43396-1'], category: 'lipids',
    name: { en: 'Non-HDL cholesterol', ar: 'الكوليسترول غير النافع (Non-HDL)' },
    aliases: ['non hdl', 'non hdl c', 'non hdl cholesterol', 'nonhdl', 'nonhdl cholesterol', 'cholesterol non hdl'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': CHOL_MMOL },
    direction: 'lower_better',
  },
  {
    code: 'chol_hdl_ratio', loinc: ['9830-1'], category: 'lipids',
    name: { en: 'Total cholesterol / HDL ratio', ar: 'نسبة الكوليسترول الكلي إلى النافع' },
    aliases: ['hdl risk factor', 'risk factor', 'cardiac risk ratio', 'coronary risk ratio', 'chol hdl ratio', 'cholesterol hdl ratio', 'total cholesterol hdl ratio', 'tc hdl ratio', 'tc hdl', 'chol hdl', 'castelli index', 'risk ratio'],
    canonicalUnit: 'ratio', units: RATIO,
    direction: 'lower_better',
  },
  {
    code: 'ldl_hdl_ratio', loinc: ['11054-4'], category: 'lipids',
    name: { en: 'LDL / HDL ratio', ar: 'نسبة الكوليسترول الضار إلى النافع' },
    aliases: ['ldl hdl ratio', 'ldl hdl', 'ldl c hdl c ratio', 'ldl hdl risk factor'],
    canonicalUnit: 'ratio', units: RATIO,
    direction: 'lower_better',
  },
  // ---------------------------------------------------------------- glucose (extra)
  {
    // After a meal; never compared with fasting or random results.
    code: 'glucose_2h_pp', loinc: ['1521-4'], category: 'glucose',
    name: { en: 'Glucose 2 hours after meal', ar: 'سكر بعد الأكل بساعتين' },
    aliases: ['2 hours post prandial glucose', '2 hours postprandial glucose', '2h pp', '2hpp', '2 h pp', 'pp glucose', 'post prandial glucose', 'postprandial glucose', 'post prandial blood sugar', 'ppbs', '2 hrs pp', 'glucose 2 hours pp', 'سكر فاطر', 'سكر بعد الاكل', 'سكر بعد الأكل بساعتين'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 18.016 } },
    direction: 'in_range', cvi: 4.7,
    critical: { low: 54, high: 400, sources: ['ada2025_hypo', 'critical_values'] },
  },
  {
    code: 'insulin', loinc: ['20448-7'], category: 'glucose',
    name: { en: 'Insulin', ar: 'الأنسولين' },
    aliases: ['insulin', 'fasting insulin', 'insulin fasting', 'الانسولين', 'انسولين صائم'],
    // pmol/L is not converted: labs use different factors (6.0 vs 6.945).
    canonicalUnit: 'µIU/mL', units: { 'uiu/ml': same, 'miu/l': same, 'mu/l': same },
    direction: 'in_range', cvi: 25.4,
  },
  // ---------------------------------------------------------------- liver (extra)
  {
    code: 'bilirubin_direct', loinc: ['1968-7'], category: 'liver',
    name: { en: 'Direct bilirubin', ar: 'البيليروبين المباشر' },
    aliases: ['direct bilirubin', 'bilirubin direct', 'd bilirubin', 'conjugated bilirubin', 'dbil', 'd bil', 'البيليروبين المباشر'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'umol/l': { scale: 1 / 17.1 } },
    direction: 'in_range', cvi: 36.8,
  },
  {
    code: 'total_protein', loinc: ['2885-2'], category: 'liver',
    name: { en: 'Total protein', ar: 'البروتين الكلي' },
    aliases: ['total protein', 'protein total', 't protein', 'tp', 'total proteins', 'البروتين الكلي'],
    canonicalUnit: 'g/dL', units: { 'g/dl': same, 'g/l': { scale: 0.1 } },
    direction: 'in_range', cvi: 2.6,
  },
  {
    code: 'globulin', loinc: ['10834-0'], category: 'liver',
    name: { en: 'Globulin', ar: 'الجلوبيولين' },
    aliases: ['globulin', 'globulins', 'total globulin', 'الجلوبيولين'],
    canonicalUnit: 'g/dL', units: { 'g/dl': same, 'g/l': { scale: 0.1 } },
    direction: 'in_range', cvi: 5.5,
  },
  {
    code: 'ag_ratio', loinc: ['1759-0'], category: 'liver',
    name: { en: 'Albumin / globulin ratio', ar: 'نسبة الألبومين إلى الجلوبيولين' },
    aliases: ['a g ratio', 'ag ratio', 'albumin globulin ratio', 'a g', 'alb glob ratio'],
    canonicalUnit: 'ratio', units: RATIO,
    direction: 'in_range',
  },
  // ---------------------------------------------------------------- kidney (extra)
  {
    code: 'urea', loinc: ['3091-6'], category: 'kidney',
    name: { en: 'Urea', ar: 'اليوريا' },
    aliases: ['urea', 'blood urea', 'serum urea', 'اليوريا', 'البولينا', 'يوريا'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 6.006 } },
    direction: 'in_range', cvi: 13.1,
  },
  {
    // Urea nitrogen (US). Kept separate from urea: same analyte, different reporting basis.
    code: 'bun', loinc: ['3094-0'], category: 'kidney',
    name: { en: 'Blood urea nitrogen (BUN)', ar: 'نيتروجين اليوريا (BUN)' },
    aliases: ['bun', 'blood urea nitrogen', 'urea nitrogen', 'serum urea nitrogen', 'sun'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 2.801 } },
    direction: 'in_range', cvi: 13.1,
  },
  {
    code: 'bun_creatinine_ratio', loinc: ['3097-3'], category: 'kidney',
    name: { en: 'BUN / creatinine ratio', ar: 'نسبة نيتروجين اليوريا إلى الكرياتينين' },
    aliases: ['bun creatinine ratio', 'bun creat ratio', 'bun cr ratio', 'urea nitrogen creatinine ratio'],
    canonicalUnit: 'ratio', units: RATIO,
    direction: 'in_range',
  },
  {
    code: 'uric_acid', loinc: ['3084-1'], category: 'kidney',
    name: { en: 'Uric acid', ar: 'حمض اليوريك' },
    aliases: ['uric acid', 'urate', 'serum uric acid', 'حمض اليوريك', 'النقرس', 'يوريك اسيد'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'umol/l': { scale: 1 / 59.48 } },
    direction: 'in_range', cvi: 8.1,
  },
  {
    code: 'urine_acr', loinc: ['9318-7'], category: 'urine',
    name: { en: 'Urine albumin / creatinine ratio', ar: 'نسبة الألبومين إلى الكرياتينين في البول' },
    aliases: ['albumin creatinine ratio', 'urine albumin creatinine ratio', 'acr', 'uacr', 'microalbumin creatinine ratio', 'microalbumin ratio'],
    canonicalUnit: 'mg/g', units: { 'mg/g': same, 'mg/gcreatinine': same, 'ug/mg': same, 'mg/mmol': { scale: 8.84 } },
    direction: 'lower_better', cvi: 30.5,
  },
  // ---------------------------------------------------------------- electrolytes and minerals
  {
    code: 'chloride', loinc: ['2075-0'], category: 'electrolytes',
    name: { en: 'Chloride', ar: 'الكلوريد' },
    aliases: ['chloride', 'cl', 'الكلوريد'],
    canonicalUnit: 'mmol/L', units: { 'mmol/l': same, 'meq/l': same },
    direction: 'in_range', cvi: 1.0,
  },
  {
    code: 'bicarbonate', loinc: ['2028-9'], category: 'electrolytes',
    name: { en: 'Bicarbonate (CO2)', ar: 'البيكربونات' },
    aliases: ['bicarbonate', 'hco3', 'co2', 'total co2', 'carbon dioxide', 'tco2', 'البيكربونات'],
    canonicalUnit: 'mmol/L', units: { 'mmol/l': same, 'meq/l': same },
    direction: 'in_range', cvi: 4.2,
  },
  {
    // Total calcium only. Ionized calcium is a different test and stays unmatched.
    code: 'calcium', loinc: ['17861-6'], category: 'minerals',
    name: { en: 'Calcium (total)', ar: 'الكالسيوم الكلي' },
    aliases: ['calcium', 'total calcium', 'calcium total', 'ca', 'الكالسيوم', 'كالسيوم'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 4.008 } },
    direction: 'in_range', cvi: 1.8,
  },
  {
    code: 'magnesium', loinc: ['19123-9'], category: 'minerals',
    name: { en: 'Magnesium', ar: 'المغنيسيوم' },
    aliases: ['magnesium', 'mg', 'serum magnesium', 'المغنيسيوم', 'ماغنسيوم'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 2.431 }, 'meq/l': { scale: 1.2155 } },
    direction: 'in_range', cvi: 2.6,
  },
  {
    code: 'phosphorus', loinc: ['2777-1'], category: 'minerals',
    name: { en: 'Phosphorus', ar: 'الفوسفور' },
    aliases: ['phosphorus', 'phosphate', 'inorganic phosphorus', 'phos', 'po4', 'الفوسفور'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'mmol/l': { scale: 3.097 } },
    direction: 'in_range', cvi: 7.7,
  },
  // ---------------------------------------------------------------- iron studies
  {
    code: 'iron', loinc: ['2498-4'], category: 'iron',
    name: { en: 'Iron', ar: 'الحديد' },
    aliases: ['iron', 'serum iron', 'fe', 's iron', 'الحديد', 'حديد'],
    canonicalUnit: 'µg/dL', units: { 'ug/dl': same, 'umol/l': { scale: 5.585 } },
    direction: 'in_range', cvi: 27.6,
  },
  {
    code: 'tibc', loinc: ['2500-7'], category: 'iron',
    name: { en: 'Total iron binding capacity (TIBC)', ar: 'السعة الكلية لربط الحديد' },
    aliases: ['tibc', 'total iron binding capacity', 'iron binding capacity'],
    canonicalUnit: 'µg/dL', units: { 'ug/dl': same, 'umol/l': { scale: 5.585 } },
    direction: 'in_range',
  },
  {
    code: 'transferrin_saturation', loinc: ['2502-3'], category: 'iron',
    name: { en: 'Transferrin saturation', ar: 'نسبة تشبع الترانسفيرين' },
    aliases: ['transferrin saturation', 'tsat', 'iron saturation', 'saturation', 'tf sat', '% saturation'],
    canonicalUnit: '%', units: PERCENT,
    direction: 'in_range',
  },
  {
    code: 'transferrin', loinc: ['3034-6'], category: 'iron',
    name: { en: 'Transferrin', ar: 'الترانسفيرين' },
    aliases: ['transferrin', 'serum transferrin'],
    canonicalUnit: 'mg/dL', units: { 'mg/dl': same, 'g/l': { scale: 100 } },
    direction: 'in_range', cvi: 3.8,
  },
  // ---------------------------------------------------------------- blood count (extra)
  {
    code: 'rbc', loinc: ['789-8'], category: 'cbc',
    name: { en: 'Red blood cells', ar: 'كرات الدم الحمراء' },
    aliases: ['rbc', 'rbcs', 'red blood cells', 'red blood cell count', 'red cell count', 'erythrocytes', 'erythrocyte count', 'كرات الدم الحمراء'],
    canonicalUnit: '10⁶/µL', units: { '10^6/ul': same, '10^12/l': same, '10^6/mm3': same },
    direction: 'in_range', cvi: 2.8,
  },
  {
    code: 'hematocrit', loinc: ['4544-3'], category: 'cbc',
    name: { en: 'Hematocrit', ar: 'الهيماتوكريت' },
    aliases: ['hematocrit', 'haematocrit', 'hct', 'pcv', 'packed cell volume', 'الهيماتوكريت'],
    canonicalUnit: '%', units: { '%': same, 'l/l': { scale: 100 } },
    direction: 'in_range', cvi: 2.8,
  },
  {
    code: 'mcv', loinc: ['787-2'], category: 'cbc',
    name: { en: 'MCV', ar: 'متوسط حجم الكرية (MCV)' },
    aliases: ['mcv', 'mean corpuscular volume', 'mean cell volume'],
    canonicalUnit: 'fL', units: { 'fl': same, 'um3': same },
    direction: 'in_range', cvi: 0.8,
  },
  {
    code: 'mch', loinc: ['785-6'], category: 'cbc',
    name: { en: 'MCH', ar: 'متوسط هيموجلوبين الكرية (MCH)' },
    aliases: ['mch', 'mean corpuscular hemoglobin', 'mean corpuscular haemoglobin', 'mean cell hemoglobin'],
    canonicalUnit: 'pg', units: { 'pg': same, 'pg/cell': same },
    direction: 'in_range', cvi: 0.7,
  },
  {
    code: 'mchc', loinc: ['786-4'], category: 'cbc',
    name: { en: 'MCHC', ar: 'تركيز هيموجلوبين الكرية (MCHC)' },
    aliases: ['mchc', 'mean corpuscular hemoglobin concentration', 'mean corpuscular haemoglobin concentration', 'mean cell hemoglobin concentration'],
    canonicalUnit: 'g/dL', units: { 'g/dl': same, 'g/l': { scale: 0.1 }, '%': same },
    direction: 'in_range', cvi: 0.9,
  },
  {
    code: 'rdw', loinc: ['788-0'], category: 'cbc',
    name: { en: 'RDW', ar: 'توزيع حجم الكريات الحمراء (RDW)' },
    aliases: ['rdw', 'rdw cv', 'red cell distribution width', 'red cell distribution width cv'],
    canonicalUnit: '%', units: PERCENT,
    direction: 'in_range', cvi: 3.5,
  },
  {
    code: 'neutrophils_abs', loinc: ['751-8'], category: 'cbc',
    name: { en: 'Neutrophils (count)', ar: 'الخلايا المتعادلة (العدد)' },
    aliases: ['neutrophils absolute', 'absolute neutrophils', 'absolute neutrophil count', 'anc', 'neutrophils count', 'neut abs', 'segmented neutrophils absolute'],
    canonicalUnit: '10³/µL', units: COUNT, direction: 'in_range', cvi: 12.5,
  },
  {
    code: 'neutrophils_pct', loinc: ['770-8'], category: 'cbc',
    name: { en: 'Neutrophils (%)', ar: 'الخلايا المتعادلة (%)' },
    aliases: ['neutrophils', 'neutrophil', 'neutrophils %', 'neut %', 'neutrophils percent', 'polymorphs', 'segmented neutrophils', 'segmented', 'neutrophils (segmented)', 'الخلايا المتعادلة'],
    canonicalUnit: '%', units: PERCENT, direction: 'in_range',
  },
  {
    code: 'lymphocytes_abs', loinc: ['731-0'], category: 'cbc',
    name: { en: 'Lymphocytes (count)', ar: 'الخلايا الليمفاوية (العدد)' },
    aliases: ['lymphocytes absolute', 'absolute lymphocytes', 'absolute lymphocyte count', 'alc', 'lymphocytes count', 'lymph abs', 'lymphocytes absolute count'],
    canonicalUnit: '10³/µL', units: COUNT, direction: 'in_range', cvi: 10.5,
  },
  {
    code: 'lymphocytes_pct', loinc: ['736-9'], category: 'cbc',
    name: { en: 'Lymphocytes (%)', ar: 'الخلايا الليمفاوية (%)' },
    aliases: ['lymphocytes', 'lymphocyte', 'lymphocytes %', 'lymph %', 'lymphocytes percent', 'الخلايا الليمفاوية'],
    canonicalUnit: '%', units: PERCENT, direction: 'in_range',
  },
  {
    code: 'monocytes_abs', loinc: ['742-7'], category: 'cbc',
    name: { en: 'Monocytes (count)', ar: 'الخلايا الوحيدة (العدد)' },
    aliases: ['monocytes absolute', 'absolute monocytes', 'monocytes count', 'mono abs', 'monocytes absolute count'],
    canonicalUnit: '10³/µL', units: COUNT, direction: 'in_range', cvi: 13.3,
  },
  {
    code: 'monocytes_pct', loinc: ['5905-5'], category: 'cbc',
    name: { en: 'Monocytes (%)', ar: 'الخلايا الوحيدة (%)' },
    aliases: ['monocytes', 'monocyte', 'monocytes %', 'mono %', 'الخلايا الوحيدة'],
    canonicalUnit: '%', units: PERCENT, direction: 'in_range',
  },
  {
    code: 'eosinophils_abs', loinc: ['711-2'], category: 'cbc',
    name: { en: 'Eosinophils (count)', ar: 'الخلايا الحمضية (العدد)' },
    aliases: ['eosinophils absolute', 'absolute eosinophils', 'absolute eosinophil count', 'aec', 'eosinophils count', 'eos abs', 'eosinophils absolute count'],
    canonicalUnit: '10³/µL', units: COUNT, direction: 'in_range', cvi: 15.1,
  },
  {
    code: 'eosinophils_pct', loinc: ['713-8'], category: 'cbc',
    name: { en: 'Eosinophils (%)', ar: 'الخلايا الحمضية (%)' },
    aliases: ['eosinophils', 'eosinophil', 'eosinophils %', 'eos %', 'الخلايا الحمضية'],
    canonicalUnit: '%', units: PERCENT, direction: 'in_range',
  },
  {
    code: 'basophils_abs', loinc: ['704-7'], category: 'cbc',
    name: { en: 'Basophils (count)', ar: 'الخلايا القاعدية (العدد)' },
    aliases: ['basophils absolute', 'absolute basophils', 'basophils count', 'baso abs', 'basophils absolute count'],
    canonicalUnit: '10³/µL', units: COUNT, direction: 'in_range', cvi: 12.6,
  },
  {
    code: 'basophils_pct', loinc: ['706-2'], category: 'cbc',
    name: { en: 'Basophils (%)', ar: 'الخلايا القاعدية (%)' },
    aliases: ['basophils', 'basophil', 'basophils %', 'baso %', 'الخلايا القاعدية'],
    canonicalUnit: '%', units: PERCENT, direction: 'in_range',
  },
  // ---------------------------------------------------------------- thyroid (extra)
  {
    code: 'free_t3', loinc: ['3051-0'], category: 'thyroid',
    name: { en: 'Free T3', ar: 'هرمون T3 الحر' },
    aliases: ['free t3', 'ft3', 'free triiodothyronine', 'f t3'],
    canonicalUnit: 'pg/mL', units: { 'pg/ml': same, 'pmol/l': { scale: 0.651 } },
    direction: 'in_range', cvi: 4.9,
  },
  {
    code: 'total_t3', loinc: ['3053-6'], category: 'thyroid',
    name: { en: 'T3 (total)', ar: 'هرمون T3 الكلي' },
    aliases: ['t3', 'total t3', 't3 total', 'triiodothyronine', 'total triiodothyronine'],
    canonicalUnit: 'ng/dL', units: { 'ng/dl': same, 'nmol/l': { scale: 65.1 } },
    direction: 'in_range', cvi: 6.3,
  },
  {
    code: 'total_t4', loinc: ['3026-2'], category: 'thyroid',
    name: { en: 'T4 (total)', ar: 'هرمون T4 الكلي' },
    aliases: ['t4', 'total t4', 't4 total', 'thyroxine', 'total thyroxine'],
    canonicalUnit: 'µg/dL', units: { 'ug/dl': same, 'nmol/l': { scale: 1 / 12.87 } },
    direction: 'in_range', cvi: 6.2,
  },
  // ---------------------------------------------------------------- inflammation
  {
    code: 'crp', loinc: ['1988-5'], category: 'inflammation',
    name: { en: 'C-reactive protein (CRP)', ar: 'بروتين سي التفاعلي (CRP)' },
    aliases: ['crp', 'c reactive protein', 'c-reactive protein', 'crp quantitative', 'quantitative crp', 'بروتين سي التفاعلي'],
    canonicalUnit: 'mg/L', units: { 'mg/l': same, 'mg/dl': { scale: 10 } },
    direction: 'lower_better', cvi: 33.7,
  },
  {
    code: 'hs_crp', loinc: ['30522-7'], category: 'inflammation',
    name: { en: 'hs-CRP', ar: 'بروتين سي التفاعلي عالي الحساسية' },
    aliases: ['hs crp', 'hscrp', 'high sensitivity crp', 'high sensitivity c reactive protein', 'cardio crp', 'us crp'],
    canonicalUnit: 'mg/L', units: { 'mg/l': same, 'mg/dl': { scale: 10 } },
    direction: 'lower_better', cvi: 34.7,
  },
  {
    code: 'esr', loinc: ['30341-2'], category: 'inflammation',
    name: { en: 'ESR', ar: 'سرعة الترسيب' },
    aliases: ['esr', 'erythrocyte sedimentation rate', 'sedimentation rate', 'esr 1st hour', 'esr first hour', 'sed rate', 'سرعة الترسيب'],
    canonicalUnit: 'mm/h', units: { 'mm/h': same, 'mm/hr': same, 'mm/1sthr': same, 'mm/1sthour': same },
    direction: 'lower_better',
  },
  {
    code: 'aso', loinc: ['5370-2'], category: 'inflammation',
    name: { en: 'ASO titre', ar: 'الأجسام المضادة للستربتوليسين (ASO)' },
    aliases: ['aso', 'asot', 'aso titre', 'aso titer', 'antistreptolysin o', 'anti streptolysin o'],
    canonicalUnit: 'IU/mL', units: { 'iu/ml': same, 'u/ml': same, 'todd': same },
    direction: 'lower_better',
  },
  {
    code: 'rheumatoid_factor', loinc: ['11572-5'], category: 'inflammation',
    name: { en: 'Rheumatoid factor', ar: 'عامل الروماتويد' },
    aliases: ['rheumatoid factor', 'rf', 'ra factor', 'rf quantitative', 'عامل الروماتويد'],
    canonicalUnit: 'IU/mL', units: { 'iu/ml': same, 'u/ml': same },
    direction: 'lower_better', cvi: 8.5,
  },
  // ---------------------------------------------------------------- coagulation
  {
    // No variation figure on purpose: on warfarin the target range differs from
    // the lab's normal range, so trends are shown without judging them.
    code: 'inr', loinc: ['6301-6'], category: 'coagulation',
    name: { en: 'INR', ar: 'معامل السيولة (INR)' },
    aliases: ['inr', 'international normalized ratio', 'pt inr', 'معامل السيولة'],
    canonicalUnit: 'ratio', units: RATIO,
    direction: 'in_range',
  },
  {
    code: 'pt', loinc: ['5902-2'], category: 'coagulation',
    name: { en: 'Prothrombin time (PT)', ar: 'زمن البروثرومبين' },
    aliases: ['pt', 'prothrombin time', 'pro time', 'زمن البروثرومبين'],
    canonicalUnit: 's', units: SECONDS,
    direction: 'in_range',
  },
  {
    code: 'aptt', loinc: ['3173-2'], category: 'coagulation',
    name: { en: 'aPTT', ar: 'زمن الثرومبوبلاستين الجزئي (aPTT)' },
    aliases: ['aptt', 'ptt', 'activated partial thromboplastin time', 'partial thromboplastin time'],
    canonicalUnit: 's', units: SECONDS,
    direction: 'in_range', cvi: 2.7,
  },
  // ---------------------------------------------------------------- hormones
  {
    code: 'psa_total', loinc: ['2857-1'], category: 'hormones',
    name: { en: 'PSA (total)', ar: 'مستضد البروستاتا النوعي (PSA)' },
    aliases: ['psa', 'total psa', 'psa total', 'prostate specific antigen', 'prostatic specific antigen'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same },
    direction: 'lower_better', cvi: 6.8,
  },
  {
    code: 'testosterone_total', loinc: ['2986-8'], category: 'hormones',
    name: { en: 'Testosterone (total)', ar: 'هرمون التستوستيرون الكلي' },
    aliases: ['testosterone', 'total testosterone', 'testosterone total', 'التستوستيرون'],
    canonicalUnit: 'ng/dL', units: { 'ng/dl': same, 'nmol/l': { scale: 28.84 }, 'ng/ml': { scale: 100 } },
    direction: 'in_range', cvi: 15,
  },
  {
    code: 'prolactin', loinc: ['2842-3'], category: 'hormones',
    name: { en: 'Prolactin', ar: 'هرمون الحليب (البرولاكتين)' },
    aliases: ['prolactin', 'prl', 'البرولاكتين', 'هرمون الحليب'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same },
    direction: 'in_range', cvi: 45,
  },
  {
    code: 'cortisol', loinc: ['2143-6'], category: 'hormones',
    name: { en: 'Cortisol', ar: 'الكورتيزول' },
    aliases: ['cortisol', 'serum cortisol', 'morning cortisol', 'cortisol am', 'الكورتيزول'],
    canonicalUnit: 'µg/dL', units: { 'ug/dl': same, 'nmol/l': { scale: 1 / 27.59 } },
    direction: 'in_range', cvi: 16.1,
  },
  // ---------------------------------------------------------------- pancreas and muscle
  {
    code: 'amylase', loinc: ['1798-8'], category: 'pancreas',
    name: { en: 'Amylase', ar: 'الأميليز' },
    aliases: ['amylase', 'serum amylase', 'alpha amylase', 'الاميليز'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'in_range', cvi: 6.6,
  },
  {
    code: 'lipase', loinc: ['3040-3'], category: 'pancreas',
    name: { en: 'Lipase', ar: 'الليباز' },
    aliases: ['lipase', 'serum lipase', 'الليباز'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'in_range', cvi: 7.6,
  },
  {
    code: 'ck', loinc: ['2157-6'], category: 'muscle',
    name: { en: 'Creatine kinase (CK)', ar: 'إنزيم الكرياتين كيناز (CK)' },
    aliases: ['ck', 'cpk', 'creatine kinase', 'creatine phosphokinase', 'ck total', 'total ck'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'in_range', cvi: 14.1,
  },
  {
    code: 'ldh', loinc: ['2532-0'], category: 'muscle',
    name: { en: 'LDH', ar: 'إنزيم LDH' },
    aliases: ['ldh', 'lactate dehydrogenase', 'lactic dehydrogenase', 'ld'],
    canonicalUnit: 'U/L', units: enzymeUnits, direction: 'in_range', cvi: 4.4,
  },
  // ---------------------------------------------------------------- vitamins (extra)
  {
    code: 'folate', loinc: ['2284-8'], category: 'vitamins',
    name: { en: 'Folate (folic acid)', ar: 'حمض الفوليك' },
    aliases: ['folate', 'folic acid', 'serum folate', 'vitamin b9', 'حمض الفوليك', 'فوليك اسيد'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same, 'nmol/l': { scale: 1 / 2.266 } },
    direction: 'in_range', cvi: 10.9,
  },
  // ---------------------------------------------------------------- infection screening (qualitative)
  {
    code: 'hcv_ab', loinc: ['16128-1'], category: 'infection',
    name: { en: 'Hepatitis C antibody', ar: 'الأجسام المضادة لفيروس سي' },
    aliases: ['hcv ab', 'hcv antibody', 'anti hcv', 'hepatitis c antibody', 'hcv', 'فيروس سي', 'فيروس سي الأجسام المضادة'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'hbsag', loinc: ['5196-1'], category: 'infection',
    name: { en: 'Hepatitis B surface antigen', ar: 'المستضد السطحي لفيروس بي' },
    aliases: ['hbsag', 'hbs ag', 'hepatitis b surface antigen', 'australia antigen', 'فيروس بي'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  // ---------------------------------------------------------------- fertility and hormones
  {
    code: 'fsh', loinc: ['15067-2'], category: 'hormones',
    name: { en: 'FSH', ar: 'هرمون FSH' },
    aliases: ['fsh', 'follicle stimulating hormone', 'follicle-stimulating hormone', 's fsh', 'هرمون منشط الحويصلة'],
    canonicalUnit: 'mIU/mL', units: { 'miu/ml': same, 'iu/l': same, 'mu/ml': same }, direction: 'in_range',
  },
  {
    code: 'lh', loinc: ['10501-5'], category: 'hormones',
    name: { en: 'LH', ar: 'هرمون LH' },
    aliases: ['lh', 'luteinizing hormone', 'luteinising hormone', 's lh', 'الهرمون المنشط للجسم الأصفر'],
    canonicalUnit: 'mIU/mL', units: { 'miu/ml': same, 'iu/l': same, 'mu/ml': same }, direction: 'in_range',
  },
  {
    code: 'estradiol', loinc: ['2243-4'], category: 'hormones',
    name: { en: 'Estradiol (E2)', ar: 'هرمون الإستراديول' },
    aliases: ['estradiol', 'e2', 'oestradiol', 'estradiol e2', 'الاستراديول'],
    canonicalUnit: 'pg/mL', units: { 'pg/ml': same, 'ng/l': same, 'pmol/l': { scale: 0.2724 } }, direction: 'in_range',
  },
  {
    code: 'progesterone', loinc: ['2839-9'], category: 'hormones',
    name: { en: 'Progesterone', ar: 'هرمون البروجسترون' },
    aliases: ['progesterone', 'prog', 'البروجسترون', 'بروجسترون'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same, 'nmol/l': { scale: 0.3145 } }, direction: 'in_range',
  },
  {
    code: 'amh', loinc: ['38476-3'], category: 'hormones',
    name: { en: 'AMH', ar: 'هرمون AMH (مخزون المبيض)' },
    aliases: ['amh', 'anti mullerian hormone', 'anti-mullerian hormone', 'anti müllerian hormone', 'مخزون المبيض'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same, 'pmol/l': { scale: 0.14 } }, direction: 'in_range',
  },
  // ---------------------------------------------------------------- tumor markers
  {
    code: 'afp', loinc: ['1834-1'], category: 'other',
    name: { en: 'AFP (alpha-fetoprotein)', ar: 'دلالة الأورام AFP' },
    aliases: ['afp', 'alpha fetoprotein', 'alpha-fetoprotein', 'a fetoprotein', 'alfa fetoprotein'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same }, direction: 'lower_better',
  },
  {
    code: 'cea', loinc: ['2039-6'], category: 'other',
    name: { en: 'CEA', ar: 'دلالة الأورام CEA' },
    aliases: ['cea', 'carcinoembryonic antigen', 'carcino embryonic antigen'],
    canonicalUnit: 'ng/mL', units: { 'ng/ml': same, 'ug/l': same }, direction: 'lower_better',
  },
  {
    code: 'ca125', loinc: ['10334-1'], category: 'other',
    name: { en: 'CA-125', ar: 'دلالة الأورام CA-125' },
    aliases: ['ca 125', 'ca125', 'ca-125', 'cancer antigen 125'],
    canonicalUnit: 'U/mL', units: { 'u/ml': same, 'ku/l': same }, direction: 'lower_better',
  },
  {
    code: 'ca199', loinc: ['24108-3'], category: 'other',
    name: { en: 'CA 19-9', ar: 'دلالة الأورام CA 19-9' },
    aliases: ['ca 19 9', 'ca19 9', 'ca 199', 'ca19-9', 'ca 19-9', 'cancer antigen 19 9'],
    canonicalUnit: 'U/mL', units: { 'u/ml': same, 'ku/l': same }, direction: 'lower_better',
  },
  // ---------------------------------------------------------------- heart and clotting
  {
    code: 'troponin_hs', loinc: ['89579-7'], category: 'muscle',
    name: { en: 'High-sensitivity troponin I', ar: 'التروبونين عالي الحساسية' },
    aliases: ['hs troponin', 'hs troponin i', 'high sensitivity troponin', 'high sensitive troponin i', 'troponin i hs', 'hs ctni', 'troponin i', 'troponin', 'التروبونين'],
    canonicalUnit: 'ng/L', units: { 'ng/l': same, 'pg/ml': same, 'ng/ml': { scale: 1000 } }, direction: 'lower_better',
  },
  {
    code: 'd_dimer', loinc: ['48065-7'], category: 'coagulation',
    name: { en: 'D-dimer', ar: 'دي دايمر' },
    aliases: ['d dimer', 'd-dimer', 'ddimer', 'دي دايمر'],
    canonicalUnit: 'ug/mL FEU', units: { 'ug/ml': same, 'mg/l': same, 'ugfeu/ml': same, 'ug/mlfeu': same, 'mg/lfeu': same, 'ng/ml': { scale: 0.001 }, 'ng/mlfeu': { scale: 0.001 } }, direction: 'lower_better',
  },
  // ---------------------------------------------------------------- viral tests
  {
    code: 'hcv_rna', loinc: ['11011-4'], category: 'infection',
    name: { en: 'Hepatitis C PCR (viral load)', ar: 'تحليل فيروس سي PCR' },
    aliases: ['hcv rna', 'hcv pcr', 'hcv quantitative pcr', 'hcv viral load', 'hcv rna quantitative', 'pcr فيروس سي', 'تحليل pcr لفيروس سي'],
    canonicalUnit: 'IU/mL', units: { 'iu/ml': same }, direction: 'lower_better',
  },
  {
    code: 'hbv_dna', loinc: ['29615-2'], category: 'infection',
    name: { en: 'Hepatitis B DNA (viral load)', ar: 'تحليل فيروس بي PCR' },
    aliases: ['hbv dna', 'hbv pcr', 'hbv viral load', 'hbv dna quantitative', 'pcr فيروس بي'],
    canonicalUnit: 'IU/mL', units: { 'iu/ml': same }, direction: 'lower_better',
  },
  {
    code: 'hiv', loinc: ['56888-1'], category: 'infection',
    name: { en: 'HIV test', ar: 'تحليل HIV' },
    aliases: ['hiv', 'hiv 1 2', 'hiv i ii', 'hiv ag ab', 'hiv 1/2 ag/ab', 'hiv antibody', 'anti hiv', 'hiv combo', 'الإيدز'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  // ---------------------------------------------------------------- more blood count
  {
    code: 'mpv', loinc: ['32623-1'], category: 'cbc',
    name: { en: 'MPV (mean platelet volume)', ar: 'متوسط حجم الصفائح' },
    aliases: ['mpv', 'mean platelet volume', 'متوسط حجم الصفائح الدموية'],
    canonicalUnit: 'fL', units: { 'fl': same }, direction: 'in_range',
  },
  {
    code: 'pdw', loinc: ['32207-3'], category: 'cbc',
    name: { en: 'PDW (platelet distribution width)', ar: 'توزيع حجم الصفائح' },
    aliases: ['pdw', 'platelet distribution width'],
    canonicalUnit: 'fL', units: { 'fl': same }, direction: 'in_range',
  },
  // ---------------------------------------------------------------- urine analysis
  {
    code: 'urine_pus', loinc: ['5821-4'], category: 'urine',
    name: { en: 'Urine pus cells (WBC)', ar: 'خلايا الصديد في البول' },
    aliases: ['pus cells', 'pus', 'urine pus cells', 'urine wbc', 'leucocytes urine', 'wbcs urine', 'pus cells hpf', 'صديد', 'خلايا صديد', 'خلايا الصديد'],
    canonicalUnit: '/HPF', units: { '/hpf': same, 'cells/hpf': same, '/hp': same, 'hpf': same }, direction: 'lower_better',
  },
  {
    code: 'urine_rbc', loinc: ['13945-1'], category: 'urine',
    name: { en: 'Urine red blood cells', ar: 'كرات الدم الحمراء في البول' },
    aliases: ['urine rbcs', 'urine rbc', 'rbcs urine', 'red cells urine', 'كرات دم حمراء في البول'],
    canonicalUnit: '/HPF', units: { '/hpf': same, 'cells/hpf': same, '/hp': same, 'hpf': same }, direction: 'lower_better',
  },
  {
    code: 'urine_sg', loinc: ['5811-5'], category: 'urine',
    name: { en: 'Urine specific gravity', ar: 'كثافة البول' },
    aliases: ['specific gravity', 'sp gravity', 'sp gr', 'urine specific gravity', 'الكثافة النوعية', 'كثافة البول'],
    canonicalUnit: '', units: { '': same }, direction: 'in_range',
  },
  {
    code: 'urine_ph', loinc: ['5803-2'], category: 'urine',
    name: { en: 'Urine pH', ar: 'حموضة البول' },
    aliases: ['urine ph', 'ph urine', 'reaction ph', 'حموضة البول'],
    canonicalUnit: '', units: { '': same }, direction: 'in_range',
  },
  {
    code: 'urine_colour', loinc: [], category: 'urine',
    name: { en: 'Urine colour', ar: 'لون البول' },
    aliases: ['urine colour', 'urine color', 'colour of urine', 'color of urine'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_appearance', loinc: [], category: 'urine',
    name: { en: 'Urine appearance', ar: 'شكل البول' },
    aliases: ['urine appearance', 'urine aspect', 'urine clarity', 'urine turbidity'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_protein', loinc: ['5804-0'], category: 'urine',
    name: { en: 'Protein in urine', ar: 'بروتين في البول' },
    aliases: ['urine protein', 'protein in urine', 'proteinuria', 'urine albumin dipstick', 'زلال في البول', 'البروتين في البول'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_glucose', loinc: ['5792-7'], category: 'urine',
    name: { en: 'Sugar in urine', ar: 'سكر في البول' },
    aliases: ['urine glucose', 'urine sugar', 'glucose in urine', 'sugar in urine', 'glycosuria', 'السكر في البول'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_ketones', loinc: ['5797-6'], category: 'urine',
    name: { en: 'Ketones in urine', ar: 'كيتونات في البول' },
    aliases: ['ketones', 'ketone', 'ketone bodies', 'acetone', 'urine ketones', 'كيتون', 'الكيتونات', 'اسيتون'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_bilirubin', loinc: ['5770-3'], category: 'urine',
    name: { en: 'Bilirubin in urine', ar: 'بيليروبين في البول' },
    aliases: ['urine bilirubin', 'bilirubin in urine', 'بيليروبين في البول'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_urobilinogen', loinc: ['5818-0'], category: 'urine',
    name: { en: 'Urobilinogen', ar: 'يوروبيلينوجين' },
    aliases: ['urobilinogen', 'urine urobilinogen'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_nitrite', loinc: ['5802-4'], category: 'urine',
    name: { en: 'Nitrite in urine', ar: 'نيتريت في البول' },
    aliases: ['nitrite', 'nitrites', 'urine nitrite', 'نيتريت'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_leukocyte_esterase', loinc: ['5799-2'], category: 'urine',
    name: { en: 'Leukocyte esterase', ar: 'إستريز كرات الدم البيضاء' },
    aliases: ['leukocyte esterase', 'leucocyte esterase', 'leukocytes esterase', 'urine leukocytes dipstick'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_blood', loinc: ['5794-3'], category: 'urine',
    name: { en: 'Blood in urine (dipstick)', ar: 'دم في البول' },
    aliases: ['urine blood', 'blood in urine', 'urine hemoglobin', 'hemoglobin in urine', 'دم في البول'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_epithelial', loinc: [], category: 'urine',
    name: { en: 'Epithelial cells in urine', ar: 'خلايا طلائية في البول' },
    aliases: ['epithelial cells', 'epithelial', 'squamous epithelial cells', 'urine epithelial cells', 'خلايا طلائية'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_casts', loinc: [], category: 'urine',
    name: { en: 'Casts in urine', ar: 'أسطوانات في البول' },
    aliases: ['casts', 'cast', 'hyaline casts', 'granular casts', 'urine casts', 'اسطوانات'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_crystals', loinc: [], category: 'urine',
    name: { en: 'Crystals in urine', ar: 'بلورات في البول' },
    aliases: ['crystals', 'crystal', 'calcium oxalate', 'calcium oxalate crystals', 'amorphous urates', 'amorphous phosphates', 'uric acid crystals', 'triple phosphate', 'urine crystals', 'بلورات', 'املاح'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_bacteria', loinc: [], category: 'urine',
    name: { en: 'Bacteria in urine', ar: 'بكتيريا في البول' },
    aliases: ['bacteria', 'bacteriuria', 'urine bacteria', 'بكتيريا'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_mucus', loinc: [], category: 'urine',
    name: { en: 'Mucus in urine', ar: 'مخاط في البول' },
    aliases: ['mucus', 'mucus threads', 'mucous threads', 'urine mucus', 'مخاط'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'urine_yeast', loinc: [], category: 'urine',
    name: { en: 'Yeast cells in urine', ar: 'خلايا الخميرة في البول' },
    aliases: ['yeast', 'yeast cells', 'budding yeast', 'urine yeast', 'خميرة'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  // ---------------------------------------------------------------- stool analysis
  // Short printed names ("Colour", "Fat", "Pus cells") only mean these under a
  // stool heading (see PANELS); the aliases here are stool-only names.
  {
    code: 'stool_colour', loinc: [], category: 'stool',
    name: { en: 'Stool colour', ar: 'لون البراز' },
    aliases: ['stool colour', 'stool color', 'colour of stool', 'color of stool'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_consistency', loinc: [], category: 'stool',
    name: { en: 'Stool consistency', ar: 'قوام البراز' },
    aliases: ['stool consistency'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_odour', loinc: [], category: 'stool',
    name: { en: 'Stool odour', ar: 'رائحة البراز' },
    aliases: ['stool odour', 'stool odor'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_mucus', loinc: [], category: 'stool',
    name: { en: 'Mucus in stool', ar: 'مخاط في البراز' },
    aliases: ['stool mucus', 'mucus in stool'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_blood', loinc: [], category: 'stool',
    name: { en: 'Visible blood in stool', ar: 'دم ظاهر في البراز' },
    aliases: ['stool blood', 'blood in stool', 'gross blood stool'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_occult_blood', loinc: ['2335-8'], category: 'stool',
    name: { en: 'Occult blood in stool', ar: 'دم خفي في البراز' },
    aliases: ['occult blood', 'stool occult blood', 'fecal occult blood', 'faecal occult blood', 'fobt', 'fit test', 'دم خفي'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_ph', loinc: [], category: 'stool',
    name: { en: 'Stool pH', ar: 'حموضة البراز' },
    aliases: ['stool ph', 'stool reaction'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_undigested_food', loinc: [], category: 'stool',
    name: { en: 'Undigested food in stool', ar: 'طعام غير مهضوم في البراز' },
    aliases: ['undigested food', 'undigested food particles', 'طعام غير مهضوم', 'بقايا طعام غير مهضوم'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_vegetable_cells', loinc: [], category: 'stool',
    name: { en: 'Vegetable cells in stool', ar: 'خلايا نباتية في البراز' },
    aliases: ['vegetable cells', 'vegetable fibers', 'vegetable fibres', 'خلايا نباتية'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_starch', loinc: [], category: 'stool',
    name: { en: 'Starch in stool', ar: 'نشا في البراز' },
    aliases: ['starch', 'starch granules', 'نشا', 'النشا'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_muscle_fibers', loinc: [], category: 'stool',
    name: { en: 'Muscle fibers in stool', ar: 'ألياف عضلية في البراز' },
    aliases: ['muscle fibers', 'muscle fibres', 'meat fibers', 'meat fibres', 'ألياف عضلية'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_fat', loinc: [], category: 'stool',
    name: { en: 'Fat in stool', ar: 'دهون في البراز' },
    aliases: ['stool fat', 'fat globules', 'fat droplets', 'fecal fat', 'faecal fat', 'neutral fat', 'كرات دهنية'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_pus', loinc: [], category: 'stool',
    name: { en: 'Stool pus cells', ar: 'خلايا الصديد في البراز' },
    aliases: ['stool pus cells', 'stool wbc', 'fecal leukocytes', 'faecal leucocytes'],
    canonicalUnit: '/HPF', units: { '/hpf': same, 'cells/hpf': same, '/hp': same, 'hpf': same }, direction: 'lower_better',
  },
  {
    code: 'stool_rbc', loinc: [], category: 'stool',
    name: { en: 'Stool red blood cells', ar: 'كرات الدم الحمراء في البراز' },
    aliases: ['stool rbcs', 'stool rbc'],
    canonicalUnit: '/HPF', units: { '/hpf': same, 'cells/hpf': same, '/hp': same, 'hpf': same }, direction: 'lower_better',
  },
  {
    code: 'stool_epithelial', loinc: [], category: 'stool',
    name: { en: 'Epithelial cells in stool', ar: 'خلايا طلائية في البراز' },
    aliases: ['stool epithelial cells'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_yeast', loinc: [], category: 'stool',
    name: { en: 'Yeast cells in stool', ar: 'خلايا الخميرة في البراز' },
    aliases: ['stool yeast', 'stool yeast cells'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_protozoa', loinc: [], category: 'stool',
    name: { en: 'Protozoa in stool', ar: 'طفيليات أولية في البراز' },
    aliases: ['protozoa', 'stool protozoa', 'entamoeba', 'e histolytica', 'giardia', 'giardia lamblia', 'amoeba', 'طفيليات أولية', 'أميبا', 'جيارديا'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
  {
    code: 'stool_ova', loinc: [], category: 'stool',
    name: { en: 'Worm eggs (ova) in stool', ar: 'بويضات الديدان في البراز' },
    aliases: ['helminths', 'helminth ova', 'ova', 'ova and cysts', 'ova cysts', 'ova & parasites', 'o&p', 'worms', 'stool worms', 'ديدان', 'بويضات'],
    canonicalUnit: '', units: {}, direction: 'in_range', qualitative: true,
  },
]

const BY_CODE = new Map(LAB_TESTS.map((t) => [t.code, t]))

export function getTest(code: string): LabTest | undefined {
  return BY_CODE.get(code)
}

export function normalizeUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, 'u')
    .replace(/mcg/g, 'ug')
    .replace(/[×x*]\s*10\s*[\^*]?\s*/g, '10^')
    .replace(/^10\s*\*\s*/, '10^')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/\s+/g, '')
    .replace(/^10\^(\d)\/(?=ul|l|mm3)/, '10^$1/')
}

// Words that describe the sample or the report, not which test it is.
// ("total", "free", "direct" are NOT here: they change the test.)
const NOISE_WORDS = new Set([
  'serum', 's', 'plasma', 'p', 'blood', 'whole', 'level', 'levels', 'test', 'conc', 'concentration', 'value', 'result',
  'في', 'الدم', 'مصل', 'مستوى', 'نسبة', 'تحليل',
])

/** Lowercase, unify Arabic letter forms, drop dots and punctuation, collapse spaces. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '') // Arabic diacritics and tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/^\s*(\d{1,2}\s*[-.)]|[•▪●◦*-])\s+/, '') // list numbering or bullets in front of the name
    .replace(/\./g, '')
    .replace(/#/g, ' absolute ') // "Neutrophils #" is the absolute count, not the percentage
    .replace(/[-_/:,;*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripNoise(key: string): string {
  return key.split(' ').filter((w) => !NOISE_WORDS.has(w)).join(' ')
}

/** Candidate keys for a printed name, most specific first. */
export function nameKeys(reportedName: string): string[] {
  const full = normalizeName(reportedName)
  const outside = normalizeName(reportedName.replace(/\([^)]*\)|\[[^\]]*\]/g, ' '))
  const inside = [...reportedName.matchAll(/\(([^)]*)\)/g)].map((m) => normalizeName(m[1]))
  const keys = [full, outside, ...inside].flatMap((k) => [k, stripNoise(k)]).map((k) => k.replace(/[()[\]]/g, '').replace(/\s+/g, ' ').trim())
  return [...new Set(keys.filter(Boolean))]
}

const ALIAS_INDEX = new Map<string, string>()
for (const t of LAB_TESTS) {
  for (const a of [...t.aliases, t.name.en, t.name.ar, t.code]) {
    // Same cleaning as printed names (first key = full name, brackets removed), plus its noise-free form.
    const full = nameKeys(a)[0]
    for (const k of [full, full && stripNoise(full)]) {
      if (k && !ALIAS_INDEX.has(k)) ALIAS_INDEX.set(k, t.code)
    }
  }
}
const LOINC_INDEX = new Map<string, string>()
for (const t of LAB_TESTS) for (const l of t.loinc) LOINC_INDEX.set(l, t.code)

// learned: the person's own earlier matches · catalog: the built-in list · shared: a name
// several people confirmed, or the team added · close: one letter off a known name (always
// shown for a check) · ai_suggested: what the reading model proposed · manual: chosen by hand.
export type MatchSource = 'learned' | 'catalog' | 'shared' | 'close' | 'ai_suggested'

/** Edit distance, stopping early once it's over `max`. */
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j])
    }
    if (best > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

/** A known name one letter away (typo or OCR slip), only if exactly one test is that close. */
function closeMatch(keys: string[]): string | null {
  const found = new Set<string>()
  for (const k of keys) {
    if (k.length < 6) continue // short codes (TG, HB) are too easy to confuse
    for (const [alias, code] of ALIAS_INDEX) if (alias.length >= 6 && withinEdits(k, alias, 1)) found.add(code)
  }
  return found.size === 1 ? [...found][0] : null
}

/**
 * Deterministic match: the user's own learned names first, then LOINC, then
 * catalog names, then names shared by other users or the team, then a
 * one-letter-off spelling, but only when the result's unit fits that test.
 * Returns null rather than guessing.
 */
export function matchTest(
  reportedName: string,
  loinc?: string | null,
  learned?: ReadonlyMap<string, string>,
  opts: { shared?: ReadonlyMap<string, string>; unit?: string | null; numeric?: boolean; section?: string | null } = {},
): { code: string; source: MatchSource } | null {
  const found = matchByName(reportedName, loinc, learned, opts)
  const specimen = opts.section ? specimenOf(opts.section) : null
  if (!specimen) return found
  // Under a urine or stool heading, short names ("RBCs", "pH", "Colour", "Glucose") are that sample's values.
  const panel = PANELS[specimen]
  if (panel) {
    const keys = nameKeys(reportedName)
    const code = (found && panel.byCode[found.code]) ?? keys.map((k) => panel.byName[k]).find(Boolean)
    if (code) return { code, source: found?.source ?? 'catalog' }
  }
  // Never a test from another sample: "Glucose" in urine or semen is not blood glucose.
  return found && specimenOfTest(found.code) === specimen ? found : null
}

/** What a result was measured in, when it isn't blood. */
export type Specimen = 'urine' | 'stool' | 'semen' | 'csf' | 'fluid'

const SPECIMEN_WORDS: [Specimen, RegExp][] = [
  ['stool', /stool|faeces|feces|faecal|fecal|براز/],
  ['semen', /semen|seminal|sperm|منوي/],
  ['csf', /\bcsf\b|cerebrospinal|نخاعي/],
  ['fluid', /pleural|ascitic|ascites|peritoneal|synovial|pericardial|body fluid|بلوري|استسقاء|بريتوني|مفصلي/],
  ['urine', /urine|urinalysis|urinary|بول/],
]
// A heading naming both (e.g. "Serum and urine chemistry") doesn't decide the sample.
const BLOOD_WORDS = /\b(serum|plasma)\b|مصل|بلازما/

/** The sample a heading (or heading path) names, if it names one. */
export function specimenOf(section: string): Specimen | null {
  const s = normalizeName(section)
  if (BLOOD_WORDS.test(s)) return null
  return SPECIMEN_WORDS.find(([, re]) => re.test(s))?.[0] ?? null
}

/** The sample a catalog test is measured in; null means blood. */
export function specimenOfTest(code: string): Specimen | null {
  const c = BY_CODE.get(code)?.category
  return c === 'urine' ? 'urine' : c === 'stool' ? 'stool' : null
}

/** Whether a test can be the one printed under this heading (used for the reading service's suggestion too). */
export function fitsSection(code: string, section: string | null | undefined): boolean {
  const specimen = section ? specimenOf(section) : null
  return !specimen || specimenOfTest(code) === specimen
}

// Short names that mean a different test in each sample. byCode: what the name matched on its
// own (usually a blood test) → that sample's test. byName: names with no match of their own.
const PANELS: Partial<Record<Specimen, { byCode: Record<string, string>; byName: Record<string, string> }>> = {
  stool: {
    byCode: { rbc: 'stool_rbc', wbc: 'stool_pus', urine_pus: 'stool_pus', urine_rbc: 'stool_rbc', urine_ph: 'stool_ph', hemoglobin: 'stool_blood', urine_mucus: 'stool_mucus', urine_epithelial: 'stool_epithelial', urine_yeast: 'stool_yeast' },
    byName: {
      colour: 'stool_colour', color: 'stool_colour', لون: 'stool_colour', اللون: 'stool_colour',
      consistency: 'stool_consistency', قوام: 'stool_consistency', القوام: 'stool_consistency',
      odour: 'stool_odour', odor: 'stool_odour', smell: 'stool_odour', رائحه: 'stool_odour', الرائحه: 'stool_odour', رايحه: 'stool_odour',
      mucus: 'stool_mucus', mucous: 'stool_mucus', مخاط: 'stool_mucus', المخاط: 'stool_mucus',
      blood: 'stool_blood', 'gross blood': 'stool_blood', دم: 'stool_blood', الدم: 'stool_blood',
      ph: 'stool_ph', reaction: 'stool_ph', 'reaction ph': 'stool_ph',
      fat: 'stool_fat', fats: 'stool_fat', دهون: 'stool_fat',
      'pus cells': 'stool_pus', pus: 'stool_pus', 'epithelial cells': 'stool_epithelial', epithelial: 'stool_epithelial',
      'yeast cells': 'stool_yeast', yeast: 'stool_yeast', cysts: 'stool_protozoa',
    },
  },
  urine: {
    byCode: { rbc: 'urine_rbc', wbc: 'urine_pus', glucose: 'urine_glucose', total_protein: 'urine_protein', albumin: 'urine_protein', bilirubin_total: 'urine_bilirubin', hemoglobin: 'urine_blood' },
    byName: {
      ph: 'urine_ph', reaction: 'urine_ph', sg: 'urine_sg',
      colour: 'urine_colour', color: 'urine_colour', لون: 'urine_colour', اللون: 'urine_colour',
      appearance: 'urine_appearance', aspect: 'urine_appearance', clarity: 'urine_appearance', turbidity: 'urine_appearance', الشكل: 'urine_appearance', المظهر: 'urine_appearance', العكاره: 'urine_appearance',
      protein: 'urine_protein', proteins: 'urine_protein', بروتين: 'urine_protein', زلال: 'urine_protein',
      sugar: 'urine_glucose', سكر: 'urine_glucose', السكر: 'urine_glucose', جلوكوز: 'urine_glucose',
      blood: 'urine_blood', دم: 'urine_blood', الدم: 'urine_blood',
      'pus cells': 'urine_pus', pus: 'urine_pus',
    },
  },
}

// Sub-headings that don't say which sample they belong to.
const GENERIC_HEADING_WORDS = new Set([
  'macroscopic', 'microscopic', 'macroscopical', 'microscopical', 'examination', 'exam', 'physical', 'chemical', 'general',
  'digestion', 'cytology', 'parasites', 'parasitology', 'parasitic', 'findings', 'others', 'other', 'and', 'dipstick', 'sediment', 'properties',
  'فحص', 'الفحص', 'عياني', 'العياني', 'مجهري', 'المجهري', 'ميكروسكوبي', 'الميكروسكوبي', 'كيميائي', 'الكيميائي', 'طبيعي', 'الطبيعي', 'طفيليات', 'الطفيليات',
])
function isGenericHeading(section: string): boolean {
  return normalizeName(section).split(' ').every((w) => !w || /^\d+$/.test(w) || GENERIC_HEADING_WORDS.has(w))
}

// Names only one sample has ("Starch", "Specific gravity") point a heading-less group to it.
// Names both urine and stool tests use (pus cells, epithelial cells, mucus…) don't count.
const SHARED_NAMES = new Set(['urine_pus', 'urine_rbc', 'urine_epithelial', 'urine_mucus', 'urine_yeast'])

/**
 * The heading to match each result under, for a whole report in printed
 * order. Sub-headings like "Microscopic examination" or "1. Digestion" take
 * the sample from the heading above them ("Stool Analysis"); if no heading
 * names it, names only one sample has decide it for that group of rows.
 */
export function sectionsInContext(rows: { name: string; section: string | null | undefined }[]): (string | null)[] {
  const out: (string | null)[] = rows.map((r) => r.section || null)
  const WORD: Record<Specimen, string> = { urine: 'Urine', stool: 'Stool', semen: 'Semen', csf: 'CSF', fluid: 'Body fluid' }
  let i = 0
  let lastNamed: Specimen | null = null
  while (i < rows.length) {
    const section = rows[i].section ?? ''
    if (!isGenericHeading(section)) {
      // A named heading: its rows keep it as printed; remember its sample for the sub-headings below it.
      lastNamed = specimenOf(section)
      while (i < rows.length && (rows[i].section ?? '') === section) i++
      continue
    }
    // A run of rows under sub-headings (or none): one group.
    const start = i
    while (i < rows.length && isGenericHeading(rows[i].section ?? '')) i++
    let specimen = lastNamed
    if (!specimen) {
      const votes = new Map<Specimen, number>()
      for (const r of rows.slice(start, i)) {
        const code = matchByName(r.name, null, undefined, {})?.code
        const s = code && !SHARED_NAMES.has(code) ? specimenOfTest(code) : null
        if (s) votes.set(s, (votes.get(s) ?? 0) + 1)
      }
      const ranked = [...votes].sort((a, b) => b[1] - a[1])
      specimen = ranked.length && (ranked.length === 1 || ranked[0][1] > ranked[1][1]) ? ranked[0][0] : null
    }
    if (specimen) for (let j = start; j < i; j++) out[j] = [WORD[specimen], rows[j].section].filter(Boolean).join(' > ')
  }
  return out
}

function matchByName(
  reportedName: string,
  loinc: string | null | undefined,
  learned: ReadonlyMap<string, string> | undefined,
  opts: { shared?: ReadonlyMap<string, string>; unit?: string | null; numeric?: boolean },
): { code: string; source: MatchSource } | null {
  const keys = nameKeys(reportedName)
  if (learned) {
    for (const k of keys) if (learned.has(k)) return { code: learned.get(k)!, source: 'learned' }
  }
  if (loinc && LOINC_INDEX.has(loinc)) return { code: LOINC_INDEX.get(loinc)!, source: 'catalog' }
  for (const k of keys) if (ALIAS_INDEX.has(k)) return { code: ALIAS_INDEX.get(k)!, source: 'catalog' }
  if (opts.shared) {
    for (const k of keys) if (opts.shared.has(k) && BY_CODE.has(opts.shared.get(k)!)) return { code: opts.shared.get(k)!, source: 'shared' }
  }
  const close = closeMatch(keys)
  if (close) {
    const test = BY_CODE.get(close)!
    const fits = opts.numeric === false ? !!test.qualitative : opts.unit != null && opts.unit !== '' && unitFits(test, opts.unit)
    if (fits) return { code: close, source: 'close' }
  }
  return null
}

/** The key under which a user's manual match is remembered. */
export function learnedKey(reportedName: string): string {
  return nameKeys(reportedName)[0] ?? ''
}

/**
 * A stand-in test for a result the catalog doesn't know, so the user still gets
 * a history of it. Identity = the same printed name AND the same unit; anything
 * else is a different series. No biological variation, so changes are shown
 * but never judged as improving or worsening.
 */
export function nameOnlyTest(reportedName: string, unit: string | null | undefined): LabTest {
  const unitKey = normalizeUnit(unit ?? '')
  return {
    code: `name:${learnedKey(reportedName)}|${unitKey}`,
    loinc: [],
    name: { en: reportedName, ar: reportedName },
    aliases: [],
    category: 'other',
    canonicalUnit: unit ?? '',
    units: { [unitKey]: same },
    direction: 'in_range',
  }
}

/** True when a value in this unit can be converted for this test (or there is no numeric value). */
export function unitFits(test: LabTest, unit: string | null | undefined): boolean {
  return toCanonical(test, 1, unit) != null
}

/** Converts a value to the test's canonical unit, or returns null if the unit is not whitelisted. */
export function toCanonical(test: LabTest, value: number, unit: string | null | undefined): number | null {
  const conv = test.units[normalizeUnit(unit ?? '')]
  if (!conv) return null
  return value * conv.scale + (conv.offset ?? 0)
}
