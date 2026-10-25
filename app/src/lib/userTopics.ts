import { supabase } from './supabase'
import { loadHistories } from './labData'
import { loadCheckIns, loadVitals } from './daily'
import { loadMedications } from './medications'
import { loadProfileDetails } from './profile'
import { measurementStatus } from '../domain/labs/rules'
import { ageOn } from '../domain/profileOptions'
import { assessReading, type VitalKind } from '../domain/vitals'
import { conditionTags, familyTags, labTags, medicationTags, readingTags, tagWeight } from '../domain/libraryTags'

/**
 * Everything the "For you" card can match on, from the person's own records,
 * with how strongly each counts. Runs on the phone; nothing is sent anywhere.
 */
export async function loadUserTopics(today: string): Promise<Map<string, number>> {
  const topics = new Map<string, number>()
  const add = (tags: string[], boost = 0) => {
    for (const t of tags) topics.set(t, Math.max(topics.get(t) ?? 0, tagWeight(t) + boost))
  }
  const [histories, vitals, details, meds, checkIns, life] = await Promise.all([
    loadHistories(), loadVitals(30), loadProfileDetails(), loadMedications(), loadCheckIns(14),
    supabase ? supabase.from('lifestyle_events').select('category, started_on').gte('started_on', new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)) : Promise.resolve({ data: [] }),
  ])
  const p = details.profile
  const age = ageOn(p?.date_of_birth ?? null, today)

  // Latest lab results outside their range count most, newest first.
  for (const h of histories.values()) {
    const latest = h.series.points[h.series.points.length - 1]
    if (!h.byNameOnly && latest) add(labTags(h.test, measurementStatus(h.test, latest)), latest.collectedAt > new Date(Date.now() - 180 * 86_400_000).toISOString() ? 1 : 0)
  }
  const latestByKind = new Map<VitalKind, (typeof vitals)[number]>()
  for (const r of vitals) if (!latestByKind.has(r.kind)) latestByKind.set(r.kind, r)
  const facts = { age, heightCm: p?.height_cm ?? null, hasDiabetes: details.lists.conditions.some((c) => /diabet|سكري/i.test(c) && !/pre/i.test(c)) }
  for (const r of latestByKind.values()) {
    const a = assessReading(r, facts)
    if (a) add(readingTags(a.category))
  }

  add(conditionTags(details.lists.conditions))
  add(familyTags(details.lists.family))
  add(medicationTags(meds.map((m) => ({ name: m.brand_name, ingredient: m.active_ingredient, active: m.is_active }))))
  add((p?.health_goals ?? []).filter((g) => g !== 'records').map((g) => `goal:${g}`))
  if (p?.smoking_status === 'current') add(['lifestyle:smoking'])
  if (p?.pregnancy_status === 'pregnant') add(['who:pregnant'])
  if (age != null && age >= 65) add(['who:older_adults'])
  if (age != null && age < 18) add(['who:children'])
  for (const l of (life.data ?? []) as { category: string }[]) {
    if (['exercise', 'diet', 'smoking', 'alcohol', 'sleep', 'stress'].includes(l.category)) add([`lifestyle:${l.category}`])
    if (l.category === 'weight') add(['goal:weight'])
  }
  for (const c of checkIns) add(c.symptoms.map((s) => `symptom:${s}`))
  return topics
}
