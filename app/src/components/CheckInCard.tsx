import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, Moon, Phone } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadCheckIns, saveCheckIn, type CheckIn } from '../lib/daily'
import { todayIn } from '../lib/medications'
import { normalizeNumberInput, parseNumber } from '../domain/numbers'
import { EMERGENCY_NUMBERS } from '../domain/emergency'
import { track } from '../lib/usage'

export const SYMPTOMS = ['headache', 'dizziness', 'tiredness', 'nausea', 'pain', 'swelling', 'chest_pain', 'breathless'] as const
// Symptoms that can be signs of an emergency (heart attack, stroke, severe asthma).
const RED_FLAGS = new Set(['chest_pain', 'breathless'])

/**
 * The daily check-in, as one line inside "Your day": tap a mood (saved at
 * once), optionally open sleep and symptoms. Reports whether it's done.
 */
export function CheckInRow({ onDone }: { onDone?: (done: boolean) => void }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const today = todayIn(profile?.time_zone ?? 'Africa/Cairo')
  const [entry, setEntry] = useState<CheckIn>({ day: today, mood: null, sleep_hours: null, symptoms: [], note: null })
  const [sleep, setSleep] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void loadCheckIns(1).then((list) => {
      const mine = list.find((c) => c.day === today)
      if (mine) {
        setEntry(mine)
        setSleep(mine.sleep_hours != null ? String(mine.sleep_hours) : '')
      }
      onDone?.(!!mine?.mood)
    })
  // onDone is a state setter from the parent; reload only when the day or person changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, profile?.id])

  async function save(next: CheckIn) {
    if (!profile) return
    setEntry(next)
    if (await saveCheckIn(profile.id, next)) {
      onDone?.(!!next.mood)
      if (next.mood && !entry.mood) track('checkin_saved')
    }
  }

  const toggle = (s: string) => {
    const has = entry.symptoms.includes(s)
    void save({ ...entry, symptoms: has ? entry.symptoms.filter((x) => x !== s) : [...entry.symptoms, s] })
  }
  const redFlag = entry.symptoms.some((s) => RED_FLAGS.has(s))
  const emergency = EMERGENCY_NUMBERS[profile?.country ?? 'EG'] ?? EMERGENCY_NUMBERS.EG

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-3 text-sm font-medium">
          <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand-700 ${entry.mood ? 'bg-brand-700 text-white' : ''}`} aria-hidden>
            {entry.mood ? <Check className="size-3.5" /> : null}
          </span>
          {t('checkin.title')}
        </span>
        <div className="flex flex-1 justify-end gap-1" role="radiogroup" aria-label={t('checkin.moodLabel')}>
          {[5, 4, 3, 2, 1].map((m) => (
            <button key={m} type="button" role="radio" aria-checked={entry.mood === m} onClick={() => void save({ ...entry, mood: m })}
              className={`min-h-9 rounded-full border px-2.5 text-xs font-medium ${entry.mood === m ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
              {t(`checkin.moods.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="ms-9 mt-1 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-brand-700">
        {entry.sleep_hours != null || entry.symptoms.length
          ? <span className="sensitive">{[entry.sleep_hours != null ? t('checkin.sleptHours', { hours: entry.sleep_hours }) : '', ...entry.symptoms.map((s) => t(`checkin.symptoms.${s}`))].filter(Boolean).join(t('checkin.listSep'))}</span>
          : t('checkin.addDetails')}
        <ChevronDown className={`size-3.5 transition ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="ms-9 mt-2">
          <label className="flex items-center gap-2 text-sm">
            <Moon className="size-4 text-brand-700" aria-hidden /> {t('checkin.sleep')}
            <input dir="ltr" inputMode="decimal" className="min-h-10 w-16 rounded-lg border border-line bg-surface px-2" placeholder="7" value={sleep}
              onChange={(e) => setSleep(normalizeNumberInput(e.target.value))}
              onBlur={() => { const h = parseNumber(sleep); if (h == null || (h >= 0 && h <= 24)) void save({ ...entry, sleep_hours: h }) }} />
            {t('checkin.hours')}
          </label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SYMPTOMS.map((s) => (
              <button key={s} type="button" aria-pressed={entry.symptoms.includes(s)} onClick={() => toggle(s)}
                className={`min-h-9 rounded-full border px-3 text-xs ${entry.symptoms.includes(s) ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
                {t(`checkin.symptoms.${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      {redFlag && (
        <aside role="alert" className="mt-3 rounded-xl border-2 border-status-urgent bg-status-urgent-bg p-3 text-sm text-status-urgent">
          <p>{t('checkin.redFlag')}</p>
          <a href={`tel:${emergency.general}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-status-urgent px-4 font-semibold text-white">
            <Phone className="size-4" aria-hidden /> {t('advisor.emergency.call', { number: emergency.general })}
          </a>
        </aside>
      )}
    </div>
  )
}
