// Builds the minimal record context for one advisor question (SPEC.md §8, step 2).
// Only tests relevant to the question are included (all tests, briefly, for
// general questions). Every item gets a short ID the answer must cite; numbers
// come from the app's own calculations, never from the model.
import { getTest, nameKeys } from './labs/catalog'
import { compare } from './labs/compare'
import type { TestHistory } from './labs/history'
import { guidelineFindings, measurementStatus } from './labs/rules'

export interface AdvisorMedication {
  id: string
  name: string
  ingredient: string | null
  strength: string | null
  active: boolean
  regimens: { from: string; to: string | null; dose: string; frequency: string }[]
}

export interface AdvisorInput {
  question: string
  today: string
  person: {
    age: number | null
    sex: string | null
    country: string
    pregnancy?: string | null
    smoking?: string | null
    height_cm?: number | null
    weight_kg?: number | null
    bmi?: number | null
    goals?: string[]
    no_known_conditions?: boolean
    no_known_allergies?: boolean
  }
  histories: TestHistory[]
  medications: AdvisorMedication[]
  conditions: string[]
  allergies: string[]
  followUps: { text: string; due: string | null }[]
  reports: { id: string; date: string; lab: string | null }[]
  lifeChanges?: { category: string; title: string; started_on: string; ended_on: string | null }[]
}

export type RefKind = 'test' | 'report' | 'medication'
export interface Ref { kind: RefKind; target: string; label: string }

const TOPICS: Record<string, string[]> = {
  lipids: ['cholesterol', 'lipid', 'ldl', 'hdl', 'triglycer', 'كوليسترول', 'الدهون', 'دهون'],
  glucose: ['sugar', 'glucose', 'diabet', 'a1c', 'insulin', 'السكر', 'سكر', 'السكري', 'انسولين'],
  liver: ['liver', 'alt', 'ast', 'sgpt', 'sgot', 'bilirubin', 'الكبد', 'كبد'],
  kidney: ['kidney', 'renal', 'creatinine', 'egfr', 'urea', 'uric', 'الكلى', 'كلى', 'الكلي', 'كرياتينين'],
  cbc: ['blood count', 'cbc', 'hemoglobin', 'haemoglobin', 'anemia', 'anaemia', 'platelet', 'white cell', 'انيميا', 'أنيميا', 'صورة دم', 'هيموجلوبين', 'الدم'],
  thyroid: ['thyroid', 'tsh', 't4', 't3', 'الغدة', 'درقية', 'الدرقية'],
  vitamins: ['vitamin', 'iron', 'ferritin', 'b12', 'folate', 'فيتامين', 'حديد', 'فيريتين'],
  iron: ['iron', 'ferritin', 'tibc', 'حديد'],
  electrolytes: ['sodium', 'potassium', 'chloride', 'electrolyte', 'صوديوم', 'بوتاسيوم', 'املاح', 'أملاح'],
  minerals: ['calcium', 'magnesium', 'phosph', 'كالسيوم', 'ماغنسيوم'],
  inflammation: ['crp', 'esr', 'inflamm', 'التهاب'],
  coagulation: ['inr', 'warfarin', 'clotting', 'سيولة', 'وارفارين'],
  hormones: ['psa', 'testosterone', 'prolactin', 'cortisol', 'هرمون'],
}
const GENERAL = ['summar', 'progress', 'overall', 'everything', 'all my', 'report', 'results', 'changed', 'doctor', 'ملخص', 'تقرير', 'نتائج', 'حالتي', 'تقدم', 'الطبيب', 'الدكتور', 'اتغير', 'تغير']

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')

/** Which of the user's tests a question is about. Empty set + general=true means "everything, briefly". */
export function relevantTests(question: string, histories: TestHistory[]): { keys: Set<string>; general: boolean } {
  const q = ` ${norm(question).replace(/[^\p{L}\p{N}]+/gu, ' ')} `
  const keys = new Set<string>()
  for (const h of histories) {
    const topicWords = TOPICS[h.test.category] ?? []
    const names = [...h.test.aliases, h.test.name.en, h.test.name.ar].flatMap((a) => nameKeys(a)).map(norm).filter((a) => a.length >= 3)
    const byName = names.some((a) => q.includes(` ${a} `))
    // Topic words match at the start of a word ("liver", "livers"), never inside one ("alt" in "health").
    const byTopic = topicWords.some((w) => q.includes(` ${norm(w)}`))
    if (byName || byTopic) keys.add(h.key)
  }
  const general = keys.size === 0 || GENERAL.some((w) => q.includes(` ${norm(w)}`))
  return { keys, general }
}

const round = (n: number) => Math.round(n * 100) / 100

export function buildAdvisorContext(input: AdvisorInput) {
  const refs: Record<string, Ref> = {}
  const reportId = new Map<string, string>()
  input.reports.forEach((r, i) => {
    const id = `R${i + 1}`
    reportId.set(r.id, id)
    refs[id] = { kind: 'report', target: r.id, label: `${r.date}${r.lab ? ` · ${r.lab}` : ''}` }
  })

  const { keys, general } = relevantTests(input.question, input.histories)
  const chosen = input.histories
    .filter((h) => h.series.points.length > 0 && (keys.has(h.key) || (general && keys.size === 0)))
    .slice(0, 40)
  const detailed = (h: TestHistory) => keys.has(h.key)

  const tests = chosen.map((h, i) => {
    const id = `T${i + 1}`
    const points = h.series.points
    const latest = points[points.length - 1]
    const prev = points.length > 1 ? points[points.length - 2] : null
    const c = prev ? compare(h.test, prev, latest) : null
    refs[id] = { kind: 'test', target: h.key, label: h.byNameOnly ? h.test.name.en : h.test.name.en }
    const shown = detailed(h) ? points.slice(-8) : points.slice(-2)
    return {
      id,
      name: h.test.name.en,
      ...(h.byNameOnly ? { note: 'not in the app catalog; matched to earlier results by printed name and unit only' } : {}),
      unit: latest.unit,
      latest_lab_range: { low: latest.refLow, high: latest.refHigh },
      results: shown.map((p) => ({ date: p.collectedAt, value: p.value, status: measurementStatus(h.test, p), report: reportId.get(p.reportId) ?? null })),
      ...(c ? {
        latest_change: {
          from_date: c.previous.collectedAt, to_date: c.current.collectedAt, from: c.previous.value, to: c.current.value,
          change: c.absoluteChange, percent: c.percentChange == null ? null : round(c.percentChange),
          trend: c.trend, beyond_normal_day_to_day_variation: c.significant,
        },
      } : {}),
      guideline_flags: h.byNameOnly ? [] : guidelineFindings(h.test, latest).map((f) => f.ruleId),
      ...(getTest(h.test.code)?.foldUlnGrading && latest.refHigh && latest.value > latest.refHigh
        ? { times_upper_limit: round(latest.value / latest.refHigh) } : {}),
    }
  })

  const medications = input.medications.map((m, i) => {
    const id = `M${i + 1}`
    refs[id] = { kind: 'medication', target: m.id, label: m.name }
    return { id, name: m.name, ingredient: m.ingredient, strength: m.strength, currently_taking: m.active, regimens: m.regimens }
  })

  const context = {
    today: input.today,
    person: input.person,
    tests,
    tests_scope: general && keys.size === 0 ? 'all tests, latest two results each' : 'tests relevant to the question',
    other_tests_on_record: input.histories.filter((h) => !chosen.includes(h)).map((h) => h.test.name.en).slice(0, 60),
    medications,
    conditions: input.conditions,
    allergies: input.allergies,
    follow_ups: input.followUps,
    life_changes: (input.lifeChanges ?? []).map((l) => ({ category: l.category, change: l.title, from: l.started_on, to: l.ended_on })),
    reports: input.reports.map((r) => ({ id: reportId.get(r.id)!, date: r.date, lab: r.lab })),
  }
  return { context, refs }
}
