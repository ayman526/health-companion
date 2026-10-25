import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ChevronDown, ExternalLink, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadLibrary, loadReactions, setReaction, type Reaction } from '../lib/library'
import { rankCards, tagWeight, type LibraryCard } from '../domain/libraryTags'
import { track } from '../lib/usage'

/**
 * One short reading card from a trusted source, chosen for the topics of the
 * screen it's on (e.g. a high LDL result -> cholesterol). Shows nothing when
 * no card fits, so it never adds unrelated content. With `topics` as a map,
 * the strongest of the person's topics wins (used for "For you" on Home).
 */
export function ContextCard({ topics, allowGeneral = false, className = '', heading }: { topics: string[] | Map<string, number>; allowGeneral?: boolean; className?: string; heading?: string }) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language === 'ar'
  const { profile } = useAuth()
  const [pick, setPick] = useState<{ card: LibraryCard; reason: string } | null>(null)
  const [reaction, setLocalReaction] = useState<Reaction | null>(null)
  const [open, setOpen] = useState(false)
  const shown = useRef<string | null>(null)
  const key = Array.isArray(topics) ? topics.join(',') : [...topics.entries()].map(([k, v]) => `${k}=${v}`).join(',')

  useEffect(() => {
    const map = Array.isArray(topics) ? new Map(topics.map((tag, i) => [tag, 100 - i + tagWeight(tag)])) : topics
    if (map.size === 0 && !allowGeneral) return setPick(null)
    let current = true
    void Promise.all([loadLibrary(), loadReactions()]).then(([cards, reactions]) => {
      if (!current) return
      const hidden = new Set([...reactions].filter(([, r]) => r === 'not_relevant').map(([id]) => id))
      const ranked = rankCards(cards, map, { hidden, allowGeneral })
      // Rotate daily among the best few, so returning visitors see something new.
      const top = ranked.slice(0, 3)
      const chosen = top.length ? top[new Date().getDate() % top.length] : null
      setPick(chosen && { card: chosen.card, reason: chosen.reason })
      setLocalReaction(chosen ? reactions.get(chosen.card.id) ?? null : null)
    })
    return () => { current = false }
  // `key` captures the topics' contents.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, allowGeneral, profile?.id])

  useEffect(() => {
    if (pick && shown.current !== pick.card.id) {
      shown.current = pick.card.id
      track('card_shown')
    }
  }, [pick])

  if (!pick || reaction === 'not_relevant') return null
  const { card, reason } = pick
  const points = ar ? card.points_ar : card.points_en
  const host = new URL(card.source_url).host.replace(/^www\./, '')

  async function react(r: Reaction) {
    if (!profile) return
    const next = reaction === r ? null : r
    if (await setReaction(profile.id, card.id, next)) {
      setLocalReaction(next)
      if (next) track(next === 'helpful' ? 'card_helpful' : 'card_not_relevant')
    }
  }

  return (
    <section className={className}>
      {heading && <h2 className="mb-2 font-semibold">{heading}</h2>}
      <article className="rounded-2xl border border-line bg-surface p-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-brand-700"><BookOpen className="size-3.5" aria-hidden /> {t('library.label')}</p>
        <h3 className="mt-1 font-semibold">{ar ? card.title_ar : card.title_en}</h3>
        <p className="mt-0.5 text-xs text-muted">{t('library.why', { topic: t(`library.tags.${reason.replace(':', '.')}`) })}</p>
        <p className="mt-2 text-sm">{ar ? card.summary_ar : card.summary_en}</p>
  
        {points.length > 0 && (
          <>
            <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-700">
              {t('library.keyPoints', { count: points.length })} <ChevronDown className={`size-4 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {open && <ul className="mt-1 list-disc space-y-1 ps-5 text-sm">{points.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </>
        )}
  
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-3">
          <a href={card.source_url} target="_blank" rel="noreferrer" onClick={() => track('card_source_opened')}
            className="inline-flex min-h-10 flex-1 items-center gap-1 text-sm">
            <span className="text-muted">{t('library.source')}</span> <span className="font-semibold">{card.source_name}</span>
            <span className="text-xs text-muted" dir="ltr">· {host}</span> <ExternalLink className="size-3.5 text-muted" aria-hidden />
          </a>
          <button type="button" aria-pressed={reaction === 'helpful'} aria-label={t('library.helpful')} onClick={() => void react('helpful')}
            className={`grid min-h-10 min-w-10 place-items-center rounded-full ${reaction === 'helpful' ? 'bg-brand-50 text-brand-700' : 'text-muted hover:bg-canvas'}`}>
            <ThumbsUp className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label={t('library.notRelevant')} onClick={() => void react('not_relevant')}
            className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted hover:bg-canvas">
            <ThumbsDown className="size-4" aria-hidden />
          </button>
        </div>
        {ar && <p className="mt-1 text-[11px] text-muted">{t('library.translated')}</p>}
      </article>
    </section>
  )
}
