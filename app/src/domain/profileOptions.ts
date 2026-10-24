// Choices offered during onboarding and in "My profile". Stored under one
// canonical English name (so rules and the advisor match in any language) and
// displayed translated. Free text is always allowed as well.

export const CONDITION_OPTIONS = {
  diabetes: 'Diabetes',
  prediabetes: 'Prediabetes',
  hypertension: 'High blood pressure',
  high_cholesterol: 'High cholesterol',
  thyroid: 'Thyroid disease',
  heart: 'Heart disease',
  kidney: 'Kidney disease',
  liver: 'Liver disease',
  asthma: 'Asthma',
  copd: 'COPD',
  anemia: 'Anemia',
  gout: 'Gout',
  osteoporosis: 'Osteoporosis',
  mental_health: 'Depression or anxiety',
} as const

export const ALLERGY_OPTIONS = {
  penicillin: 'Penicillin',
  sulfa: 'Sulfa medicines',
  nsaids: 'Aspirin or anti-inflammatory painkillers',
  peanuts: 'Peanuts',
  tree_nuts: 'Tree nuts',
  eggs: 'Eggs',
  milk: 'Milk',
  shellfish: 'Shellfish',
  latex: 'Latex',
} as const

export const FAMILY_OPTIONS = {
  early_heart: 'Heart attack or stroke at a young age',
  diabetes: 'Diabetes',
  high_cholesterol: 'High cholesterol',
  hypertension: 'High blood pressure',
  kidney: 'Kidney disease',
  cancer: 'Cancer',
} as const

export const GOAL_OPTIONS = [
  'cholesterol', 'blood_sugar', 'blood_pressure', 'kidneys', 'liver', 'thyroid', 'weight', 'medicines', 'checkups', 'records',
] as const

export type OptionMap = Record<string, string>

/** Translation key for a stored name, or null if it was typed freely. */
export function optionKey(map: OptionMap, storedName: string): string | null {
  const hit = Object.entries(map).find(([, v]) => v.toLowerCase() === storedName.trim().toLowerCase())
  return hit ? hit[0] : null
}

/** Age in whole years on a date, or null. */
export function ageOn(dob: string | null | undefined, today: string): number | null {
  if (!dob) return null
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0)
}

/** The pregnancy question is shown only when it can apply: female (or not stated) and of childbearing age (or age unknown). */
export function askPregnancy(sex: string | null | undefined, dob: string | null | undefined, today: string): boolean {
  if (sex && sex !== 'female') return false
  const age = ageOn(dob, today)
  return age == null || (age >= 18 && age <= 55)
}

/** Body mass index from height and weight, rounded to one decimal; null when either is missing. */
export function bmi(heightCm: number | null | undefined, weightKg: number | null | undefined): number | null {
  if (!heightCm || !weightKg) return null
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10
}
