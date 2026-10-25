import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon, Phone } from 'lucide-react'
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
 * The daily check-in (shown in a sheet from "Your day"): mood, sleep and
 * symptoms, each saved as soon as it's chosen. Reports whether it's done.
 */
export function CheckInRow({ onDone }: { onDone?: (done: boolean) => void }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const today = todayIn(profile?.time_zone ?? 'Africa/Cairo')
  const [entry, setEntry] = useState<CheckIn>({ day: today, mood: null, sleep_hours: null, symptoms: [], note: null })
  const [sleep, setSleep] = useState('')

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
      <p className="mb-2 text-sm font-medium">{t('checkin.moodLabel')}</p>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t('checkin.moodLabel')}>
        {[5, 4, 3, 2, 1].map((m) => (
          <button key={m} type="button" role="radio" aria-checked={entry.mood === m} onClick={() => void save({ ...entry, mood: m })}
            className={`min-h-12 rounded-xl border px-1 text-xs font-medium ${entry.mood === m ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
            {t(`checkin.moods.${m}`)}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <label className="flex items-center gap-2 text-sm">
          <Moon className="size-4 text-brand-700" aria-hidden /> {t('checkin.sleep')}
          <input dir="ltr" inputMode="decimal" className="min-h-10 w-16 rounded-lg border border-line bg-surface px-2" placeholder="7" value={sleep}
            onChange={(e) => setSleep(normalizeNumberInput(e.target.value))}
            onBlur={() => { const h = parseNumber(sleep); if (h == null || (h >= 0 && h <= 24)) void save({ ...entry, sleep_hours: h }) }} />
          {t('checkin.hours')}
        </label>
        <p className="mb-2 mt-4 text-sm font-medium">{t('checkin.symptomsLabel')}</p>
        <div className="flex flex-wrap gap-1.5">
          {SYMPTOMS.map((s) => (
            <button key={s} type="button" aria-pressed={entry.symptoms.includes(s)} onClick={() => toggle(s)}
              className={`min-h-9 rounded-full border px-3 text-xs ${entry.symptoms.includes(s) ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
              {t(`checkin.symptoms.${s}`)}
            </button>
          ))}
        </div>
      </div>
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
