import { MEDICINES } from '../content/medicines'

export interface MedicineSuggestion {
  name: string
  /** Active ingredient for brands; empty for generic names. */
  generic: string
  /** From the user's own medication list. */
  mine: boolean
}

/** Lowercase, unify Arabic letter forms, drop punctuation. */
export function normalizeMedicineName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-+().,/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Indexed {
  suggestion: MedicineSuggestion
  keys: string[]
}

const INDEX: Indexed[] = MEDICINES.map(([name, generic, ar]) => ({
  suggestion: { name, generic, mine: false },
  keys: [name, ...(ar ?? [])].map(normalizeMedicineName),
}))

function score(keys: string[], q: string): number {
  let best = 0
  for (const k of keys) {
    if (k === q) best = Math.max(best, 4)
    else if (k.startsWith(q)) best = Math.max(best, 3)
    else if (k.split(' ').some((w) => w.startsWith(q))) best = Math.max(best, 2)
    else if (q.length >= 3 && k.includes(q)) best = Math.max(best, 1)
  }
  return best
}

/**
 * Suggestions for what the user has typed so far: their own medicines first,
 * then the bundled list. Needs at least 2 characters.
 */
export function suggestMedicines(query: string, own: { name: string; generic: string }[] = [], limit = 8): MedicineSuggestion[] {
  const q = normalizeMedicineName(query)
  if (q.length < 2) return []
  const ranked: { s: MedicineSuggestion; score: number; mine: boolean }[] = []
  const seen = new Set<string>()

  for (const o of own) {
    const sc = score([normalizeMedicineName(o.name)], q)
    const key = normalizeMedicineName(o.name)
    if (sc > 0 && !seen.has(key)) {
      seen.add(key)
      ranked.push({ s: { name: o.name, generic: o.generic, mine: true }, score: sc + 10, mine: true })
    }
  }
  for (const item of INDEX) {
    const sc = score(item.keys, q)
    const key = normalizeMedicineName(item.suggestion.name)
    if (sc > 0 && !seen.has(key)) {
      seen.add(key)
      ranked.push({ s: item.suggestion, score: sc, mine: false })
    }
  }
  return ranked
    .sort((a, b) => b.score - a.score || a.s.name.length - b.s.name.length || a.s.name.localeCompare(b.s.name))
    .slice(0, limit)
    .map((r) => r.s)
}
