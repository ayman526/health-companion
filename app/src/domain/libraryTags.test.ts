import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LIBRARY_TAGS, conditionTags, familyTags, medicationTags, rankCards, readingTags, type LibraryCard } from './libraryTags'

describe('library topics', () => {
  it('match the list the library builder uses', () => {
    const fn = readFileSync(resolve(__dirname, '../../../supabase/functions/library-build/index.ts'), 'utf8')
    const block = fn.slice(fn.indexOf('export const TAGS = ['), fn.indexOf('] as const'))
    expect([...block.matchAll(/'([a-z_]+:[a-z_]+)'/g)].map((m) => m[1])).toEqual([...LIBRARY_TAGS])
  })

  it('reads topics from conditions, family history, medicines and readings', () => {
    expect(conditionTags(['Type 2 diabetes', 'ضغط الدم المرتفع'])).toEqual(['condition:diabetes', 'condition:hypertension'])
    expect(conditionTags(['Prediabetes'])).toEqual(['condition:prediabetes'])
    expect(familyTags(['Heart attack or stroke at a young age', 'Diabetes'])).toEqual(['family:heart', 'family:diabetes'])
    expect(medicationTags([{ name: 'Concor 5', ingredient: 'bisoprolol', active: true }, { name: 'Lipitor', ingredient: 'atorvastatin', active: false }])).toEqual(['med:blood_pressure'])
    expect(readingTags('bp_stage1')).toContain('reading:bp_high')
    expect(readingTags('bp_normal')).toEqual([])
  })

  const card = (id: string, primary: string[], related: string[] = []): LibraryCard => ({
    id, source_name: 'NHS', source_url: `https://x/${id}`, title_en: id, title_ar: id, summary_en: '', summary_ar: '',
    points_en: [], points_ar: [], primary_tags: primary, related_tags: related, reading_minutes: 3,
  })
  const cards = [card('bp', ['condition:hypertension'], ['symptom:headache']), card('headache', ['symptom:headache']),
    card('pregnancy', ['who:pregnant', 'lifestyle:diet']), card('eatwell', ['who:everyone'], ['lifestyle:diet'])]

  it('shows a card only when one of its main topics matches', () => {
    const onlyHeadache = rankCards(cards, new Map([['symptom:headache', 3]]))
    expect(onlyHeadache.map((r) => r.card.id)).toEqual(['headache']) // the blood pressure card only mentions headaches
  })

  it('keeps pregnancy cards for pregnant people and general cards for when allowed', () => {
    expect(rankCards(cards, new Map([['lifestyle:diet', 2]])).map((r) => r.card.id)).toEqual([])
    expect(rankCards(cards, new Map([['lifestyle:diet', 2]]), { allowGeneral: true }).map((r) => r.card.id)).toEqual(['eatwell'])
    expect(rankCards(cards, new Map([['who:pregnant', 1], ['lifestyle:diet', 2]])).map((r) => r.card.id)).toEqual(['pregnancy'])
  })

  it('ranks by the strongest match, skips hidden cards and explains the reason', () => {
    const r = rankCards(cards, new Map([['condition:hypertension', 5], ['symptom:headache', 3]]), { hidden: new Set(['headache']) })
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ reason: 'condition:hypertension' })
  })
})
