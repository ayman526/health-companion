import { Apple, Bike, Brain, Cigarette, Footprints, Moon, Scale, Sparkles, Wine } from 'lucide-react'

export const LIFESTYLE_CATEGORIES = ['exercise', 'diet', 'weight', 'smoking', 'alcohol', 'sleep', 'stress', 'other'] as const
export type LifestyleCategory = (typeof LIFESTYLE_CATEGORIES)[number]

export const CATEGORY_ICON: Record<LifestyleCategory, typeof Bike> = {
  exercise: Footprints, diet: Apple, weight: Scale, smoking: Cigarette, alcohol: Wine, sleep: Moon, stress: Brain, other: Sparkles,
}

// Common changes per category; the user can edit the text or write their own.
export const PRESETS: Record<LifestyleCategory, string[]> = {
  exercise: ['gym', 'running', 'walking', 'swimming', 'cycling', 'sports'],
  diet: ['low_sugar', 'low_carb', 'mediterranean', 'intermittent_fasting', 'less_salt', 'less_fat', 'more_vegetables', 'vegetarian'],
  weight: ['lose_weight', 'gain_weight'],
  smoking: ['quit_smoking', 'cut_smoking'],
  alcohol: ['quit_alcohol', 'cut_alcohol'],
  sleep: ['better_sleep', 'regular_schedule'],
  stress: ['stressful_period', 'meditation'],
  other: [],
}

export interface LifestyleEvent {
  id: string
  category: LifestyleCategory
  title: string
  details: string | null
  started_on: string
  ended_on: string | null
}

export type PeriodChangeKind = 'medication_started' | 'medication_changed' | 'medication_stopped' | 'lifestyle_started' | 'lifestyle_ended'

export interface PeriodChange {
  date: string
  kind: PeriodChangeKind
  label: string
  category?: LifestyleCategory
}

/**
 * Medicine and life changes between two dates (inclusive), oldest first. Shown
 * next to results so people can see what else changed; never presented as a cause.
 */
export function changesBetween(
  from: string,
  to: string,
  medications: { name: string; active: boolean; regimens: { from: string; to: string | null }[] }[],
  lifestyle: LifestyleEvent[],
): PeriodChange[] {
  const out: PeriodChange[] = []
  const inRange = (d: string | null): d is string => !!d && d >= from && d <= to
  for (const m of medications) {
    const regs = [...m.regimens].sort((a, b) => a.from.localeCompare(b.from))
    regs.forEach((r, i) => {
      if (inRange(r.from)) out.push({ date: r.from, kind: i === 0 ? 'medication_started' : 'medication_changed', label: m.name })
    })
    const last = regs[regs.length - 1]
    if (!m.active && last && inRange(last.to)) out.push({ date: last.to, kind: 'medication_stopped', label: m.name })
  }
  for (const e of lifestyle) {
    if (inRange(e.started_on)) out.push({ date: e.started_on, kind: 'lifestyle_started', label: e.title, category: e.category })
    if (inRange(e.ended_on)) out.push({ date: e.ended_on, kind: 'lifestyle_ended', label: e.title, category: e.category })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}
