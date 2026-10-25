// Topics a reading card is about, and the same topics derived from a person's
// own records, so cards only appear for people they're relevant to. Plain
// rules, run on the phone; nothing personal leaves the device for this.
import type { LabTest } from './labs/catalog'
import type { MeasurementStatus } from './labs/rules'

// Must match the list in supabase/functions/library-build/index.ts (checked by a test).
export const LIBRARY_TAGS = [
  'condition:diabetes', 'condition:prediabetes', 'condition:hypertension', 'condition:high_cholesterol', 'condition:thyroid',
  'condition:heart', 'condition:kidney', 'condition:liver', 'condition:asthma', 'condition:copd', 'condition:anemia',
  'condition:gout', 'condition:osteoporosis', 'condition:mental_health', 'condition:obesity',
  'lab:lipids_high', 'lab:glucose_high', 'lab:kidney_abnormal', 'lab:liver_high', 'lab:thyroid_abnormal', 'lab:anemia',
  'lab:vitamin_d_low', 'lab:iron_low', 'lab:uric_acid_high',
  'reading:bp_high', 'reading:bp_low', 'reading:glucose_high', 'reading:glucose_low', 'reading:weight_high',
  'reading:oxygen_low', 'reading:fever', 'reading:heart_rate_abnormal',
  'med:statin', 'med:metformin', 'med:insulin', 'med:blood_pressure', 'med:thyroid', 'med:anticoagulant', 'med:nsaid',
  'goal:cholesterol', 'goal:blood_sugar', 'goal:blood_pressure', 'goal:kidneys', 'goal:liver', 'goal:thyroid',
  'goal:weight', 'goal:medicines', 'goal:checkups',
  'lifestyle:exercise', 'lifestyle:diet', 'lifestyle:smoking', 'lifestyle:alcohol', 'lifestyle:sleep', 'lifestyle:stress',
  'symptom:headache', 'symptom:dizziness', 'symptom:tiredness', 'symptom:nausea', 'symptom:pain', 'symptom:swelling',
  'symptom:chest_pain', 'symptom:breathless',
  'family:heart', 'family:diabetes', 'family:high_cholesterol', 'family:hypertension', 'family:kidney',
  'who:pregnant', 'who:children', 'who:older_adults', 'who:everyone',
] as const
export type LibraryTag = (typeof LIBRARY_TAGS)[number]

/** How strongly a matching topic counts when ranking cards (current results first). */
export const TAG_WEIGHT: Record<string, number> = { lab: 6, reading: 6, condition: 5, med: 4, symptom: 3, goal: 3, lifestyle: 2, family: 2, who: 1 }
export const tagWeight = (tag: string) => TAG_WEIGHT[tag.split(':')[0]] ?? 1

const CONDITION_WORDS: [LibraryTag, RegExp][] = [
  ['condition:prediabetes', /pre-?diabet|مقدمات السكر|ما قبل السكر/i],
  ['condition:diabetes', /diabet|السكري|سكر/i],
  ['condition:hypertension', /hypertension|blood pressure|ضغط/i],
  ['condition:high_cholesterol', /cholesterol|lipid|كوليسترول|دهون/i],
  ['condition:thyroid', /thyroid|غدة|درقية/i],
  ['condition:heart', /heart|coronary|cardiac|angina|قلب|ذبحة/i],
  ['condition:kidney', /kidney|renal|كلى|كلي/i],
  ['condition:liver', /liver|hepat|كبد/i],
  ['condition:asthma', /asthma|ربو|حساسية الصدر/i],
  ['condition:copd', /copd|انسداد/i],
  ['condition:anemia', /an(a)?emia|أنيميا|انيميا|فقر الدم/i],
  ['condition:gout', /gout|نقرس/i],
  ['condition:osteoporosis', /osteopor|هشاشة/i],
  ['condition:mental_health', /depress|anxiety|اكتئاب|قلق/i],
  ['condition:obesity', /obes|سمنة/i],
]

/** Topics from condition names (as typed or as chosen), e.g. "Type 2 diabetes" -> condition:diabetes. */
export function conditionTags(names: string[]): LibraryTag[] {
  const out = new Set<LibraryTag>()
  for (const n of names) {
    const hit = CONDITION_WORDS.find(([, re]) => re.test(n))
    if (hit) out.add(hit[0])
  }
  return [...out]
}

export function familyTags(names: string[]): LibraryTag[] {
  const map: Partial<Record<LibraryTag, LibraryTag>> = {
    'condition:heart': 'family:heart', 'condition:diabetes': 'family:diabetes', 'condition:high_cholesterol': 'family:high_cholesterol',
    'condition:hypertension': 'family:hypertension', 'condition:kidney': 'family:kidney',
  }
  const out = new Set<LibraryTag>()
  for (const n of names) {
    if (/heart attack|stroke|early_heart|جلطة|أزمة قلبية/i.test(n)) out.add('family:heart')
    for (const c of conditionTags([n])) if (map[c]) out.add(map[c]!)
  }
  return [...out]
}

const MED_WORDS: [LibraryTag, RegExp][] = [
  ['med:statin', /statin|ezetimibe/i],
  ['med:metformin', /metformin|glucophage|cidophage/i],
  ['med:insulin', /insulin|lantus|novorapid|mixtard|humulin|tresiba|levemir|apidra|humalog/i],
  ['med:thyroid', /levothyrox|eltroxin|euthyrox|thyrox/i],
  ['med:anticoagulant', /warfarin|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|pradaxa|edoxaban/i],
  ['med:nsaid', /ibuprofen|brufen|diclofenac|voltaren|cataflam|naproxen|ketoprofen|meloxicam|celecoxib|celebrex/i],
  ['med:blood_pressure', /amlodipine|norvasc|lisinopril|enalapril|ramipril|perindopril|captopril|losartan|valsartan|candesartan|telmisartan|irbesartan|olmesartan|bisoprolol|concor|atenolol|metoprolol|carvedilol|nebivolol|hydrochlorothiazide|indapamide|nifedipine|diltiazem/i],
]

export function medicationTags(meds: { name: string; ingredient: string | null; active: boolean }[]): LibraryTag[] {
  const out = new Set<LibraryTag>()
  for (const m of meds.filter((x) => x.active)) {
    const text = `${m.name} ${m.ingredient ?? ''}`
    for (const [tag, re] of MED_WORDS) if (re.test(text)) out.add(tag)
  }
  return [...out]
}

/** Topics from one lab result that's outside its range. */
export function labTags(test: LabTest, status: MeasurementStatus): LibraryTag[] {
  const high = status === 'high' || status === 'urgent'
  const low = status === 'low'
  if (!high && !low) return []
  const c = test.category
  if (test.code === 'uric_acid') return high ? ['lab:uric_acid_high', 'condition:gout'] : []
  if (test.code === 'vitamin_d_25oh') return low ? ['lab:vitamin_d_low'] : []
  if (test.code === 'hemoglobin') return low ? ['lab:anemia', 'condition:anemia'] : []
  if (c === 'lipids') return high ? ['lab:lipids_high', 'condition:high_cholesterol'] : []
  if (c === 'glucose') return high ? ['lab:glucose_high', 'condition:diabetes', 'condition:prediabetes'] : []
  if (c === 'kidney') return ['lab:kidney_abnormal', 'condition:kidney']
  if (c === 'liver') return high ? ['lab:liver_high', 'condition:liver'] : []
  if (c === 'thyroid') return ['lab:thyroid_abnormal', 'condition:thyroid']
  if (c === 'iron') return low ? ['lab:iron_low', 'lab:anemia'] : []
  return []
}

/** Topics from a home reading's guideline category (see domain/vitals.ts). */
export function readingTags(category: string): LibraryTag[] {
  if (/^bp_(elevated|stage1|stage2|severe)$/.test(category)) return ['reading:bp_high', 'condition:hypertension']
  if (category === 'bp_low') return ['reading:bp_low']
  if (/^glucose_(above_target|fasting_raised|fasting_high|very_high|high_random)$/.test(category)) return ['reading:glucose_high', 'condition:diabetes']
  if (/^glucose_(low|very_low)$/.test(category)) return ['reading:glucose_low']
  if (category === 'bmi_over' || category === 'bmi_obesity') return ['reading:weight_high', 'condition:obesity', 'goal:weight']
  if (/^spo2_(borderline|low|very_low)$/.test(category)) return ['reading:oxygen_low']
  if (category.startsWith('temp_fever') || category === 'temp_very_high') return ['reading:fever']
  if (category === 'hr_low' || category === 'hr_high') return ['reading:heart_rate_abnormal']
  return []
}

export interface LibraryCard {
  id: string
  source_name: string
  source_url: string
  title_en: string
  title_ar: string
  summary_en: string
  summary_ar: string
  points_en: string[]
  points_ar: string[]
  primary_tags: string[]
  related_tags: string[]
  reading_minutes: number | null
}

const AUDIENCE_ONLY = new Set(['who:pregnant', 'who:children'])

/**
 * Cards for a set of topics, best first. A card qualifies only when one of its
 * main topics matches; related topics only help ranking. Cards for pregnancy
 * or children need that topic too. `reason` is the matched topic to explain
 * "Why this is for you". General cards (who:everyone) only when allowed.
 */
export function rankCards(cards: LibraryCard[], topics: Map<string, number>, opts: { hidden?: Set<string>; allowGeneral?: boolean } = {}) {
  const out: { card: LibraryCard; score: number; reason: string }[] = []
  for (const card of cards) {
    if (opts.hidden?.has(card.id)) continue
    if (card.primary_tags.some((t) => AUDIENCE_ONLY.has(t) && !topics.has(t))) continue
    const matched = card.primary_tags.filter((t) => topics.has(t)).sort((a, b) => topics.get(b)! - topics.get(a)!)
    const general = card.primary_tags.includes('who:everyone')
    if (matched.length === 0 && !(general && opts.allowGeneral)) continue
    const score = matched.reduce((s, t) => s + topics.get(t)! * 2, 0)
      + card.related_tags.reduce((s, t) => s + (topics.get(t) ?? 0), 0)
    out.push({ card, score, reason: matched[0] ?? 'who:everyone' })
  }
  return out.sort((a, b) => b.score - a.score || a.card.title_en.localeCompare(b.card.title_en))
}
