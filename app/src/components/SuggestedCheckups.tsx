import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Sparkles } from 'lucide-react'
import { formatDate } from '../lib/format'
import { acceptSuggestion, dismissSuggestion, loadSuggestions } from '../lib/suggestions'
import { EvidenceChips } from './TrustChips'
import type { CheckupSuggestion } from '../domain/testSuggestions'

/** Checkups suggested from published guidelines; the user picks the date and accepts or dismisses. */
export function SuggestedCheckups({ profileId, timeZone, today, onAccepted }: { profileId: string; timeZone: string; today: string; onAccepted?: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [items, setItems] = useState<CheckupSuggestion[] | null>(null)
  const [dates, setDates] = useState<Record<string, string>>({})
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    const list = await loadSuggestions(today)
    setItems(list)
    setDates(Object.fromEntries(list.map((s) => [s.key, s.due])))
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  if (!items || items.length === 0) return null

  const basis = (s: CheckupSuggestion) =>
    s.basis.kind === 'last_test' ? t('suggestions.basis.lastTest', { date: formatDate(s.basis.date, lang) })
    : s.basis.kind === 'medication' ? t('suggestions.basis.medication', { medication: s.basis.medication, date: formatDate(s.basis.date, lang) })
    : t('suggestions.basis.noTest')

  return (
    <section className="mb-6">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-brand-700"><Sparkles className="size-4" aria-hidden /> {t('suggestions.title')}</h2>
      <p className="mb-3 text-xs text-muted">{t('suggestions.intro')}</p>
      <ul className="flex flex-col gap-2">
        {items.map((s) => (
          <li key={s.key} className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">{t(`suggestions.rules.${s.rule}`)}</p>
              {s.overdue && <span className="rounded-full bg-status-watch-bg px-2.5 py-0.5 text-xs font-medium text-status-watch">{t('suggestions.overdue')}</span>}
            </div>
            <p className="mt-1 text-sm">{basis(s)} · {t(`suggestions.intervals.${s.interval}`)}</p>
            <EvidenceChips sources={s.sources} />
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs font-medium text-muted">
                {t('suggestions.date')}
                <input type="date" dir="ltr" min={today} className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm"
                  value={dates[s.key] ?? s.due} onChange={(e) => setDates({ ...dates, [s.key]: e.target.value })} />
              </label>
              <button
                type="button"
                disabled={!dates[s.key]}
                onClick={async () => {
                  if (await acceptSuggestion(profileId, s, t(`suggestions.rules.${s.rule}`), dates[s.key], timeZone)) {
                    setItems((list) => list?.filter((x) => x.key !== s.key) ?? null)
                    onAccepted?.()
                  } else setError(true)
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50"
              >
                <CalendarPlus className="size-4" aria-hidden /> {t('suggestions.accept')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (await dismissSuggestion(profileId, s)) setItems((list) => list?.filter((x) => x.key !== s.key) ?? null)
                }}
                className="min-h-11 px-2 text-sm text-muted"
              >
                {t('suggestions.dismiss')}
              </button>
            </div>
            {s.due !== dates[s.key] && <p className="mt-1 text-xs text-muted">{t('suggestions.suggestedDate', { date: formatDate(s.due, lang) })}</p>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('review.saveError')}</p>}
      <p className="mt-2 text-xs text-muted">{t('suggestions.disclaimer')}</p>
    </section>
  )
}
