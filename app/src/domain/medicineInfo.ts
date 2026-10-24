import { MEDICINES } from '../content/medicines'
import { MEDICINE_USES } from '../content/medicineUses'
import { normalizeMedicineName } from './medicineSearch'
import { toWesternDigits } from './numbers'

const BRAND_TO_GENERIC = new Map(MEDICINES.filter(([, g]) => g).map(([n, g]) => [normalizeMedicineName(n), g]))
const KNOWN_NAMES = new Set([...MEDICINES.map(([n]) => normalizeMedicineName(n)), ...Object.keys(MEDICINE_USES)])
const ARABIC_TO_NAME = new Map(MEDICINES.flatMap(([n, , ar]) => (ar ?? []).map((a) => [normalizeMedicineName(a), normalizeMedicineName(n)] as const)))

// Words that describe the form or strength, not the medicine: "Concor 5 mg tab" → "concor".
const FORM_WORDS = new Set([
  'mg', 'mcg', 'µg', 'ug', 'g', 'gm', 'ml', 'iu', 'unit', 'units', 'tab', 'tabs', 'tablet', 'tablets', 'cap', 'caps', 'capsule', 'capsules',
  'syrup', 'susp', 'suspension', 'amp', 'ampoule', 'ampoules', 'vial', 'inj', 'injection', 'cream', 'oint', 'ointment', 'gel', 'drops', 'drop',
  'sachet', 'sachets', 'spray', 'inhaler', 'puff', 'f', 'c', 'fc', 'film', 'coated', 'sr', 'xr', 'er', 'mr', 'cr', 'xl', 'la', 'od', 'retard',
  'forte', 'plus', 'mini', 'strip', 'pack', 'box',
  'قرص', 'اقراص', 'كبسوله', 'كبسولات', 'شراب', 'حقن', 'حقنه', 'امبول', 'امبولات', 'نقط', 'كريم', 'مرهم', 'اكياس', 'كيس', 'بخاخ', 'مجم', 'مل', 'جم', 'شريط', 'علبه',
])

/** The medicine name without strength, units or form words; Arabic spellings mapped to the listed name. */
export function cleanMedicineName(name: string): string {
  const words = normalizeMedicineName(toWesternDigits(name).replace(/(\d)(mg|mcg|ml|g|iu)\b/gi, '$1 $2'))
    .split(' ')
    .filter((w) => w && !/\d/.test(w) && !FORM_WORDS.has(w))
  const cleaned = words.join(' ')
  return ARABIC_TO_NAME.get(cleaned) ?? cleaned
}

/** Best match in the bundled list: the cleaned name, or its longest leading words that are known. */
function knownKey(name: string): string | null {
  // Exact listed names first (some contain digits, e.g. "Vitamin D3", "B12").
  const exact = normalizeMedicineName(name)
  if (KNOWN_NAMES.has(exact)) return exact
  const words = cleanMedicineName(name).split(' ').filter(Boolean)
  for (let n = words.length; n > 0; n--) {
    const k = words.slice(0, n).join(' ')
    if (KNOWN_NAMES.has(k)) return k
    const ar = ARABIC_TO_NAME.get(k)
    if (ar) return ar
  }
  return null
}

/** Active ingredient for a medicine: what the user entered, else the brand's known ingredient. */
export function ingredientFor(name: string, ingredient?: string | null): string | null {
  if (ingredient?.trim()) return ingredient.trim()
  const key = knownKey(name)
  if (!key) return null
  return BRAND_TO_GENERIC.get(key) ?? (MEDICINE_USES[key] ? MEDICINES.find(([n]) => normalizeMedicineName(n) === key)?.[0] ?? key : null)
}

/** "Commonly used for" text, matched on the active ingredient (falls back to the first ingredient). */
export function usesFor(name: string, ingredient: string | null | undefined, lang: string): string | null {
  const generic = ingredientFor(name, ingredient)
  if (!generic) return null
  const key = normalizeMedicineName(generic)
  const candidates = [key, knownKey(generic) ?? '', normalizeMedicineName(generic.split('+')[0]), key.split(' ')[0]]
  for (const k of candidates) {
    const hit = MEDICINE_USES[k]
    if (hit) return lang === 'ar' ? hit[1] : hit[0]
  }
  return null
}

/** NIH MedlinePlus Connect page for a medicine, searched by its (first) generic name. Only the name is sent. */
export function medlinePlusDrugUrl(name: string, ingredient?: string | null): string {
  const generic = (ingredientFor(name, ingredient) ?? name).split('+')[0].replace(/\(.*?\)/g, '').trim()
  const q = new URLSearchParams({
    'mainSearchCriteria.v.cs': '2.16.840.1.113883.6.88', // RxNorm
    'mainSearchCriteria.v.dn': generic,
    'informationRecipient.languageCode.c': 'en',
  })
  return `https://connect.medlineplus.gov/application?${q}`
}
