import { supabase } from './supabase'
import type { LibraryCard } from '../domain/libraryTags'

// The reading cards (a few dozen, shared by everyone) are loaded once per visit.
let cache: Promise<LibraryCard[]> | null = null

export function loadLibrary(): Promise<LibraryCard[]> {
  if (!supabase) return Promise.resolve([])
  cache ??= Promise.resolve(
    supabase.from('library_items')
      .select('id, source_name, source_url, title_en, title_ar, summary_en, summary_ar, points_en, points_ar, primary_tags, related_tags, reading_minutes')
      .then(({ data }) => (data ?? []) as LibraryCard[]),
  )
  return cache
}

export type Reaction = 'helpful' | 'not_relevant'

/** This person's reactions to cards (cards marked "not relevant" are never shown again). */
export async function loadReactions(): Promise<Map<string, Reaction>> {
  if (!supabase) return new Map()
  const { data } = await supabase.from('library_feedback').select('item_id, reaction')
  return new Map((data ?? []).map((r) => [r.item_id, r.reaction as Reaction]))
}

export async function setReaction(profileId: string, itemId: string, reaction: Reaction | null): Promise<boolean> {
  if (!supabase) return false
  const { error } = reaction
    ? await supabase.from('library_feedback').upsert({ profile_id: profileId, item_id: itemId, reaction })
    : await supabase.from('library_feedback').delete().eq('item_id', itemId)
  return !error
}
