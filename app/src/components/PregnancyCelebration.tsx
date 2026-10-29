import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { dueMonthOptions } from '../domain/pregnancy'
import { formatMonth } from '../lib/format'

// Fixed spark positions (angle in turns, distance in px), so it looks the same every time.
const SPARKS = Array.from({ length: 22 }, (_, i) => ({
  x: Math.round(Math.cos((i / 22) * 2 * Math.PI) * (95 + ((i * 37) % 70))),
  y: Math.round(Math.sin((i / 22) * 2 * Math.PI) * (95 + ((i * 37) % 70))),
  size: i % 3 === 0 ? 6 : 10,
  delay: ((i * 7) % 30) / 100,
  color: ['#fff1ea', '#f9d3e4', '#ff8a5b', '#ffffff', '#c4a5f5'][i % 5],
}))

/** A mother holding her baby; the colours are fixed because the hero colour is dark berry in both themes. */
function MotherAndBaby() {
  return (
    <svg width="176" height="176" viewBox="0 0 170 170" aria-hidden>
      <circle cx="85" cy="85" r="80" fill="#c42a73" />
      <circle cx="85" cy="85" r="64" fill="#e0559a" opacity=".35" />
      <path d="M48 150 C48 110 60 92 85 92 C110 92 122 110 122 150 Z" fill="#fdeff5" />
      <circle cx="85" cy="62" r="20" fill="#fdeff5" />
      <path d="M65 60 C64 40 80 34 92 38 C104 42 108 54 105 66 C100 52 88 46 74 52 C70 54 67 57 65 60 Z" fill="#6d28b8" />
      <path d="M66 62 C60 78 62 92 72 98" stroke="#6d28b8" strokeWidth="7" fill="none" strokeLinecap="round" />
      <ellipse cx="88" cy="118" rx="24" ry="15" fill="#ff8a5b" />
      <circle cx="68" cy="113" r="10" fill="#fff1ea" />
      <path d="M58 128 C74 140 100 138 116 124" stroke="#f9d3e4" strokeWidth="8" fill="none" strokeLinecap="round" />
      <path d="M128 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3 z" fill="#fff1ea" />
      <path d="M38 52 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="#fff1ea" />
    </svg>
  )
}

/**
 * Shown once, when someone changes their profile to "Pregnant": a short
 * celebration, then the due month. `onDone` saves (null = "Not now") and
 * returns false if saving failed.
 */
export function PregnancyCelebration({ today, name, onDone }: { today: string; name?: string; onDone: (dueMonth: string | null) => Promise<boolean> }) {
  const { t, i18n } = useTranslation()
  const [pick, setPick] = useState<string | null>(null)
  const [error, setError] = useState<'' | 'pickFirst' | 'saveError'>('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)

  async function finish(dueMonth: string | null) {
    setSaving(true)
    const ok = await onDone(dueMonth)
    setSaving(false)
    if (!ok) setError('saveError')
  }

  useEffect(() => {
    dialog.current?.focus()
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && void finish(null)
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="celebrate-title" className="fixed inset-0 z-40 overflow-y-auto overflow-x-hidden bg-hero text-on-hero outline-none">
      <div className="celebrate-ring" />
      <div className="celebrate-ring" style={{ animationDelay: '0.25s' }} />
      {SPARKS.map((s, i) => (
        <span key={i} className="celebrate-spark" style={{ width: s.size, height: s.size, background: s.color, animationDelay: `${s.delay}s`, ['--x' as string]: `${s.x}px`, ['--y' as string]: `${s.y}px` }} />
      ))}

      <div className="mx-auto flex min-h-full max-w-lg flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
          <div className="celebrate-pop"><MotherAndBaby /></div>
          <div className="celebrate-up mt-5">
            <h2 id="celebrate-title" className="text-3xl font-bold">{name ? t('pregnancy.celebrate.titleFor', { name }) : t('pregnancy.celebrate.title')}</h2>
            <p className="mt-2 text-base opacity-95">{t('pregnancy.celebrate.body')}</p>
          </div>
        </div>

        <div className="celebrate-sheet rounded-t-3xl bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ink md:mb-6 md:rounded-3xl">
          <h3 className="font-semibold">{t('pregnancy.celebrate.dueTitle')}</h3>
          <p className="mt-1 text-sm text-muted">{t('pregnancy.celebrate.dueHint')}</p>
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('pregnancy.dueMonth')}>
            {dueMonthOptions(today).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={pick === m}
                onClick={() => { setPick(m); setError('') }}
                className={`min-h-11 rounded-xl border text-sm ${pick === m ? 'border-brand-700 bg-brand-50 font-semibold text-brand-700' : 'border-line bg-surface'}`}
              >
                {formatMonth(m, i18n.language, 'short')}
              </button>
            ))}
          </div>
          <p role="alert" className="mt-2 min-h-5 text-sm text-status-urgent">{error && t(`pregnancy.celebrate.${error}`)}</p>
          <div className="mt-1 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void finish(null)} className="min-h-12 flex-1 rounded-xl border border-line font-medium text-muted disabled:opacity-60">
              {t('pregnancy.celebrate.notNow')}
            </button>
            <button type="button" disabled={saving} onClick={() => (pick ? void finish(pick) : setError('pickFirst'))} className="min-h-12 flex-[2] rounded-xl bg-brand-700 font-medium text-white disabled:opacity-60">
              {saving ? t('onboarding.saving') : t('pregnancy.celebrate.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
