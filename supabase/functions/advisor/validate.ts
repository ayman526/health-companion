// Checks an advisor answer before the user sees it (SPEC.md §8, step 4).
// Pure functions, shared with the app's tests.

export interface AdvisorAnswer {
  direct_answer: string
  explanation: string
  record_points: { text: string; refs: string[] }[]
  changes: string
  uncertainties: string
  next_steps: string
  see_doctor: 'not_needed' | 'routine' | 'soon' | 'urgent'
  warning_signs: string
  proposed_facts: { kind: 'medication' | 'condition' | 'allergy' | 'symptom' | 'lifestyle'; text: string; date: string }[]
  conversation_title: string
  conversation_summary: string
  language: 'en' | 'ar'
  /** Short questions to offer next (absent on answers saved before they existed). */
  follow_ups?: string[]
}

const EASTERN = '٠١٢٣٤٥٦٧٨٩'
export const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String(EASTERN.indexOf(d))).replace(/٫/g, '.')

/** Numbers in free text, excluding those that are part of a YYYY-MM-DD date. */
export function numbersIn(text: string): number[] {
  const t = westernDigits(text).replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  return [...t.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Math.abs(Number(m[0]))).filter((n) => Number.isFinite(n))
}

// Published thresholds the answer may mention (SPEC.md §6) and emergency numbers.
const KNOWN = [190, 5.7, 6.4, 6.5, 100, 125, 126, 140, 199, 200, 54, 69, 70, 60, 89, 90, 45, 59, 30, 44, 15, 29, 123, 911, 988, 24, 48]

function allowedNumbers(contextJson: string, question: string): Set<string> {
  const out = new Set<string>()
  const add = (n: number) => {
    out.add(String(n))
    out.add(String(Math.round(n)))
    out.add(String(Math.round(n * 10) / 10))
    out.add(String(Math.round(n * 100) / 100))
  }
  for (const n of [...numbersIn(contextJson), ...numbersIn(question), ...KNOWN]) add(n)
  // Dates in the context: allow their day, month and year parts when written out in words.
  for (const m of contextJson.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) [m[1], m[2], m[3]].forEach((p) => add(Number(p)))
  return out
}

export function answerText(a: AdvisorAnswer): string {
  return [a.direct_answer, a.explanation, ...a.record_points.map((p) => p.text), a.changes, a.uncertainties, a.next_steps, a.warning_signs].join('\n')
}

/** Numbers in the answer that don't come from the records, the question or published thresholds. */
export function unverifiedNumbers(a: AdvisorAnswer, contextJson: string, question: string): number[] {
  const allowed = allowedNumbers(contextJson, question)
  return [...new Set(numbersIn(answerText(a)))].filter((n) => n > 12 && !allowed.has(String(n)) && !allowed.has(String(Math.round(n * 10) / 10)))
}

const sentences = (s: string) => westernDigits(s).split(/(?<=[.!؟?\n])\s+/)

// A medication instruction is only allowed when it defers to a doctor/pharmacist or says not to.
const MED_ACTION = /\b(stop|discontinue|quit|increase|decrease|reduce|double|halve|skip|switch|change|start)\b[^.]{0,40}\b(dose|dosage|medication|medicine|tablet|pill|statin|insulin|metformin|drug)/i
const MED_ACTION_AR = /(أوقف|اوقف|توقف عن|زود|زوّد|زِد|قلل|قلّل|ضاعف|غيّر|غير) [^.]{0,30}(الجرعة|الدواء|العلاج|الأقراص|الانسولين|الإنسولين)/
const DEFERS = /\b(don'?t|do not|never|not|without|doctor|pharmacist|physician|clinician|ask|discuss|talk)\b|طبيب|الطبيب|الصيدلي|لا ت|بدون|استشر|اسأل|ناقش/i
const DIAGNOSIS = /\byou (have|definitely have|are suffering from|'ve got)\b[^.]{0,30}\b(diabetes|cancer|hepatitis|cirrhosis|kidney disease|heart disease|anemia|anaemia|hypothyroidism|hyperthyroidism|infection)\b/i
const DIAGNOSIS_AR = /(أنت مصاب|انت مصاب|لديك بالتأكيد|عندك أكيد|أنت تعاني من) [^.]{0,20}(السكري|سرطان|التهاب الكبد|تليف|الفشل الكلوي|الأنيميا|خمول|فرط نشاط)/
const HEDGE = /\b(may|might|could|possibl|suggest|range|not a diagnosis|confirm)\w*/i

export interface SafetyIssue {
  kind: 'medication_instruction' | 'diagnosis'
  sentence: string
}

export function safetyIssues(a: AdvisorAnswer): SafetyIssue[] {
  const issues: SafetyIssue[] = []
  for (const s of sentences(answerText(a))) {
    if ((MED_ACTION.test(s) || MED_ACTION_AR.test(s)) && !DEFERS.test(s)) issues.push({ kind: 'medication_instruction', sentence: s })
    if ((DIAGNOSIS.test(s) || DIAGNOSIS_AR.test(s)) && !HEDGE.test(s)) issues.push({ kind: 'diagnosis', sentence: s })
  }
  return issues
}

/** Keeps only citations that exist in this question's context. */
export function cleanCitations(a: AdvisorAnswer, validRefs: Set<string>): { answer: AdvisorAnswer; dropped: string[] } {
  const dropped: string[] = []
  const record_points = a.record_points.map((p) => {
    const refs = p.refs.filter((r) => {
      const ok = validRefs.has(r)
      if (!ok) dropped.push(r)
      return ok
    })
    return { ...p, refs }
  })
  return { answer: { ...a, record_points }, dropped }
}

export function isAnswerShape(x: unknown): x is AdvisorAnswer {
  const a = x as AdvisorAnswer
  return !!a && typeof a.direct_answer === 'string' && Array.isArray(a.record_points) && typeof a.next_steps === 'string' &&
    ['not_needed', 'routine', 'soon', 'urgent'].includes(a.see_doctor) && Array.isArray(a.proposed_facts)
}
