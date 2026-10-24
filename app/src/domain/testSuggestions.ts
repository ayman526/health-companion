// Suggested checkups from published guidelines (fixed rules, not AI).
// They are suggestions with a proposed date the user can change; they never
// replace the doctor's own schedule. Every rule names its source.
import { addDays } from './medications'
import type { SourceId } from './labs/sources'

export interface SuggestionMedication {
  name: string
  ingredient: string | null
  active: boolean
  /** Start dates of each confirmed regimen (dose changes). */
  regimenStarts: string[]
}

export interface SuggestionInput {
  today: string
  /** Latest confirmed result per catalog test code. */
  latest: Map<string, { date: string; value: number }>
  medications: SuggestionMedication[]
  conditions: string[]
  /** Test codes already covered by an active reminder. */
  remindedTests: Set<string>
  /** Suggestion keys the user accepted or dismissed. */
  decided: Set<string>
}

export type SuggestionRule = 'statin_first_check' | 'statin_routine' | 'a1c_diabetes' | 'kidney_diabetes_egfr' | 'kidney_diabetes_acr' | 'a1c_prediabetes' | 'tsh_dose_check' | 'tsh_routine'

export interface CheckupSuggestion {
  key: string
  rule: SuggestionRule
  testCodes: string[]
  /** Proposed date (YYYY-MM-DD); the user can change it. */
  due: string
  overdue: boolean
  /** What the suggestion is based on. */
  basis: { kind: 'last_test'; date: string } | { kind: 'medication'; date: string; medication: string } | { kind: 'no_test' }
  interval: string // i18n key under suggestions.intervals
  sources: SourceId[]
}

const STATINS = ['atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin', 'ezetimibe']
// Medicines used for diabetes only (SGLT2 and GLP-1 medicines are also used for other conditions, so they don't count alone).
const DIABETES_MEDS = ['metformin', 'gliclazide', 'glimepiride', 'glibenclamide', 'sitagliptin', 'vildagliptin', 'linagliptin', 'pioglitazone', 'insulin']
const DIABETES_WORDS = ['diabet', 'السكري', 'سكري']

export function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}

const contains = (m: SuggestionMedication, list: string[]) => {
  const text = `${m.ingredient ?? ''} ${m.name}`.toLowerCase()
  return list.some((w) => text.includes(w))
}
const lastChange = (m: SuggestionMedication) => {
  const sorted = [...m.regimenStarts].sort()
  return sorted[sorted.length - 1] ?? null
}

export function suggestCheckups(input: SuggestionInput): CheckupSuggestion[] {
  const { today, latest } = input
  const out: CheckupSuggestion[] = []
  const active = input.medications.filter((m) => m.active)

  const soon = addDays(today, 7) // for tests never done, or overdue
  const add = (s: Omit<CheckupSuggestion, 'key' | 'overdue' | 'due'> & { due: string }, basisDate: string) => {
    const key = `${s.rule}|${s.testCodes.join(',')}|${basisDate}`
    if (input.decided.has(key) || s.testCodes.some((c) => input.remindedTests.has(c))) return
    if (out.some((o) => o.testCodes.some((c) => s.testCodes.includes(c)))) return // one suggestion per test
    const overdue = s.due < today
    out.push({ ...s, key, overdue, due: overdue ? soon : s.due })
  }
  const lastOf = (codes: string[]) =>
    codes.map((c) => latest.get(c)).filter((x): x is { date: string; value: number } => !!x).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null

  // Cholesterol medicine: first check 4–12 weeks after starting or a dose change, then every 3–12 months.
  const statin = active.filter((m) => contains(m, STATINS)).sort((a, b) => (lastChange(b) ?? '').localeCompare(lastChange(a) ?? ''))[0]
  if (statin) {
    const changed = lastChange(statin)
    const lipid = lastOf(['ldl_c', 'total_cholesterol', 'non_hdl_c'])
    if (changed && (!lipid || lipid.date < changed)) {
      add({ rule: 'statin_first_check', testCodes: ['ldl_c'], due: addDays(changed, 56), interval: 'weeks4to12', sources: ['aha_acc_2018_followup'],
        basis: { kind: 'medication', date: changed, medication: statin.name } }, changed)
    } else if (lipid) {
      add({ rule: 'statin_routine', testCodes: ['ldl_c'], due: addMonths(lipid.date, 6), interval: 'months3to12', sources: ['aha_acc_2018_followup'],
        basis: { kind: 'last_test', date: lipid.date } }, lipid.date)
    }
  }

  // Diabetes: from an HbA1c of 6.5% or more, a diabetes-only medicine, or a recorded condition.
  const a1c = latest.get('hba1c')
  const diabetesMeds = active.filter((m) => contains(m, DIABETES_MEDS))
  const diabetes = (a1c && a1c.value >= 6.5) || diabetesMeds.length > 0 ||
    input.conditions.some((c) => DIABETES_WORDS.some((w) => c.toLowerCase().includes(w)))
  if (diabetes) {
    const recentChange = diabetesMeds.map(lastChange).filter((d): d is string => !!d).some((d) => d > addMonths(today, -3))
    const quarterly = recentChange || !a1c || a1c.value >= 7
    if (a1c) {
      add({ rule: 'a1c_diabetes', testCodes: ['hba1c'], due: addMonths(a1c.date, quarterly ? 3 : 6), interval: quarterly ? 'months3' : 'months6',
        sources: ['ada_monitoring'], basis: { kind: 'last_test', date: a1c.date } }, a1c.date)
    } else {
      add({ rule: 'a1c_diabetes', testCodes: ['hba1c'], due: soon, interval: 'months3', sources: ['ada_monitoring'], basis: { kind: 'no_test' } }, 'none')
    }
    const egfr = lastOf(['egfr', 'creatinine'])
    add({ rule: 'kidney_diabetes_egfr', testCodes: ['egfr', 'creatinine'], due: egfr ? addMonths(egfr.date, 12) : soon, interval: 'yearly',
      sources: ['ada_ckd'], basis: egfr ? { kind: 'last_test', date: egfr.date } : { kind: 'no_test' } }, egfr?.date ?? 'none')
    const acr = latest.get('urine_acr')
    add({ rule: 'kidney_diabetes_acr', testCodes: ['urine_acr'], due: acr ? addMonths(acr.date, 12) : soon, interval: 'yearly',
      sources: ['ada_ckd'], basis: acr ? { kind: 'last_test', date: acr.date } : { kind: 'no_test' } }, acr?.date ?? 'none')
  } else if (a1c && a1c.value >= 5.7) {
    // Prediabetes: at least once a year.
    add({ rule: 'a1c_prediabetes', testCodes: ['hba1c'], due: addMonths(a1c.date, 12), interval: 'yearly',
      sources: ['ada_prediabetes'], basis: { kind: 'last_test', date: a1c.date } }, a1c.date)
  }

  // Thyroid medicine: TSH 6–8 weeks after a dose change, then every 6–12 months.
  const thyroxine = active.find((m) => contains(m, ['levothyroxine']))
  if (thyroxine) {
    const changed = lastChange(thyroxine)
    const tsh = latest.get('tsh')
    if (changed && (!tsh || tsh.date < changed)) {
      add({ rule: 'tsh_dose_check', testCodes: ['tsh'], due: addDays(changed, 49), interval: 'weeks6to8', sources: ['levothyroxine_monitoring'],
        basis: { kind: 'medication', date: changed, medication: thyroxine.name } }, changed)
    } else if (tsh) {
      add({ rule: 'tsh_routine', testCodes: ['tsh'], due: addMonths(tsh.date, 12), interval: 'months6to12', sources: ['levothyroxine_monitoring'],
        basis: { kind: 'last_test', date: tsh.date } }, tsh.date)
    }
  }

  return out.sort((a, b) => a.due.localeCompare(b.due))
}
