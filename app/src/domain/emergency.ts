// Deterministic emergency pre-screen (SPEC.md §8, step 1). Runs before any AI,
// in the app and again on the server. It is intentionally sensitive: a false
// alarm shows the emergency card; a miss could cost a life.
// The server keeps an identical copy (supabase/functions/advisor/emergency.ts);
// a test keeps them in sync.

export type EmergencyKind =
  | 'chest_pain' | 'breathing' | 'stroke' | 'suicide' | 'bleeding'
  | 'unconscious' | 'seizure' | 'allergy' | 'overdose' | 'low_sugar'

export const EMERGENCY_PATTERNS: Record<EmergencyKind, RegExp[]> = {
  chest_pain: [
    /chest (pain|pressure|tightness)/i, /pain in (my|the) chest/i, /crushing (pain|chest)/i, /heart attack/i,
    /(ألم|الم|وجع|ضغط) (في |ف |فى )?(صدري|الصدر|صدر)/, /صدري (بيوجعني|واجعني|تقيل)/, /(ازمة|أزمة|جلطة) قلبية/,
  ],
  breathing: [
    /can'?t breathe/i, /cannot breathe/i, /(struggling|hard|difficult(y)?) (to )?breath(e|ing)/i, /short(ness)? of breath/i, /choking/i,
    /(مش|مو|ما) (قادر|قادرة|عارف|عارفة) (ا|أ)تنفس/, /ضيق (في |ف )?(ال)?(تنفس|نفس)/, /(نفسي|نفسى) (مقطوع|بيتقطع)/, /بختنق|اختناق/,
  ],
  stroke: [
    /(having|had|is having|might be having) a stroke/i, /stroke (symptoms|signs|now)/i, /face (is )?(drooping|droops)/i, /slurred speech/i, /(sudden )?(weakness|numbness) (on|in) one side/i, /can'?t (move|feel) (my )?(arm|leg|face)/i,
    /جلطة (في |ف )?(المخ|الدماغ)/, /سكتة دماغية/, /(وشي|وجهي|بقي) (مايل|معووج)/, /(كلامي|لساني) (تقيل|متلخبط)/, /(ايدي|إيدي|رجلي) (مش بتتحرك|اتشلت)/,
  ],
  suicide: [
    /(kill|hurt) (myself|my self)/i, /suicid/i, /want to die/i, /end (my|it all) life/i, /no reason to live/i, /better off dead/i,
    /انتحار|انتحر/, /(عايز|عاوز|عايزة|عاوزة|اريد|أريد) (ا|أ)موت/, /(اقتل|أقتل|أؤذي|اأذي) نفسي/, /مش عايز (ا|أ)عيش/,
  ],
  bleeding: [
    /(severe|heavy|won'?t stop|uncontrolled) bleeding/i, /bleeding (heavily|a lot|won'?t stop)/i, /vomit(ing|ed)? blood/i, /cough(ing|ed)? (up )?blood/i, /blood in (my )?(vomit|stool)/i,
    /نزيف (شديد|جامد|مش بيقف|مبيقفش)/, /(برجع|بتقيأ|استفرغ) دم/, /(بكح|بسعل) دم/,
  ],
  unconscious: [
    /unconscious/i, /passed out/i, /(fainted|fainting)/i, /not (waking|responding)/i, /unresponsive/i,
    /(اغمي|أغمي|اغمى|أغمى) عليه|إغماء|اغماء/, /فقد (ال)?وعي/, /مش بيفوق|مش بيرد/,
  ],
  seizure: [/seizure/i, /convuls/i, /fit(s)? (now|again)/i, /تشنج|تشنجات|نوبة صرع/],
  allergy: [
    /anaphyla/i, /(throat|tongue|lips?|face) (is )?(swelling|swollen|closing)/i, /severe allergic/i,
    /(زوري|زورى|لساني|شفايفي|وشي) (بيتقفل|ورم|وارم|منفوخ)/, /حساسية شديدة/,
  ],
  overdose: [
    /overdose/i, /took (too many|too much|a lot of|the whole)/i, /swallowed (pills|tablets|bleach|poison)/i, /poison(ed|ing)/i,
    /جرعة (زيادة|زائدة)/, /(خدت|أخذت|اخدت|بلعت) (علبة|شريط|كمية|حبوب كتير)/, /تسمم/, /(شربت|بلعت|خدت|أخذت) (سم|كلور|مبيد)/,
  ],
  low_sugar: [
    /(blood )?sugar (is )?(very )?(low|dropped)/i, /hypoglyc/i, /\bhypo\b/i,
    /(السكر|سكري) (نازل|واطي|وقع)/, /هبوط (في |ف )?(ال)?سكر/,
  ],
}

/** All emergency categories that match the text (empty = none). */
export function detectEmergency(text: string): EmergencyKind[] {
  return (Object.keys(EMERGENCY_PATTERNS) as EmergencyKind[]).filter((k) => EMERGENCY_PATTERNS[k].some((re) => re.test(text)))
}

export const EMERGENCY_NUMBERS: Record<string, { general: string; crisis?: string }> = {
  EG: { general: '123' },
  US: { general: '911', crisis: '988' },
}
