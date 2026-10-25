import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Moon, Phone, Smile } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadCheckIns, saveCheckIn, type CheckIn } from '../lib/daily'
import { todayIn } from '../lib/medications'
import { normalizeNumberInput, parseNumber } from '../domain/numbers'
import { EMERGENCY_NUMBERS } from '../domain/emergency'

export const SYMPTOMS = ['headache', 'dizziness', 'tiredness', 'nausea', 'pain', 'swelling', 'chest_pain', 'breathless'] as const
// Symptoms that can be signs of an emergency (heart attack, stroke, severe asthma).
const RED_FLAGS = new Set(['chest_pain', 'breathless'])

/** About 10 seconds a day: how you feel, how you slept, any symptoms. */
export function CheckInCard() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const today = todayIn(profile?.time_zone ?? 'Africa/Cairo')
  const [entry, setEntry] = useState<CheckIn>({ day: today, mood: null, sleep_hours: null, symptoms: [], note: null })
  const [sleep, setSleep] = useState('')
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(true)

  useEffect(() => {
    void loadCheckIns(1).then((list) => {
      const mine = list.find((c) => c.day === today)
      if (mine) {
        setEntry(mine)
        setSleep(mine.sleep_hours != null ? String(mine.sleep_hours) : '')
        setSaved(true)
        setEditing(false)
      }
    })
  }, [today, profile?.id])

  async function save(next: CheckIn) {
    if (!profile) return
    setEntry(next)
    if (await saveCheckIn(profile.id, next)) setSaved(true)
  }

  const toggle = (s: string) => {
    const has = entry.symptoms.includes(s)
    void save({ ...entry, symptoms: has ? entry.symptoms.filter((x) => x !== s) : [...entry.symptoms, s] })
  }
  const redFlag = entry.symptoms.some((s) => RED_FLAGS.has(s))
  const emergency = EMERGENCY_NUMBERS[profile?.country ?? 'EG'] ?? EMERGENCY_NUMBERS.EG

  if (!editing && saved) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-medium"><Check className="size-4 text-status-ok" aria-hidden /> {t('checkin.doneToday')}</p>
          <button type="button" onClick={() => setEditing(true)} className="min-h-11 px-2 text-sm font-medium text-brand-700">{t('checkin.edit')}</button>
        </div>
        <p className="sensitive mt-1 text-sm text-muted">
          {entry.mood ? t(`checkin.moods.${entry.mood}`) : ''}
          {entry.sleep_hours != null ? ` · ${t('checkin.sleptHours', { hours: entry.sleep_hours })}` : ''}
          {entry.symptoms.length ? ` · ${entry.symptoms.map((s) => t(`checkin.symptoms.${s}`)).join(t('checkin.listSep'))}` : ''}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-semibold"><Smile className="size-5 text-brand-700" aria-hidden /> {t('checkin.title')}</h2>
      <div className="mt-3 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t('checkin.moodLabel')}>
        {[5, 4, 3, 2, 1].map((m) => (
          <button key={m} type="button" role="radio" aria-checked={entry.mood === m} onClick={() => void save({ ...entry, mood: m })}
            className={`min-h-12 rounded-xl border px-1 text-xs font-medium ${entry.mood === m ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
            {t(`checkin.moods.${m}`)}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm font-medium">
        <Moon className="size-4 text-brand-700" aria-hidden /> {t('checkin.sleep')}
        <input dir="ltr" inputMode="decimal" className="min-h-11 w-20 rounded-lg border border-line bg-surface px-3" placeholder="7" value={sleep}
          onChange={(e) => setSleep(normalizeNumberInput(e.target.value))}
          onBlur={() => { const h = parseNumber(sleep); if (h == null || (h >= 0 && h <= 24)) void save({ ...entry, sleep_hours: h }) }} />
        {t('checkin.hours')}
      </label>
      <p className="mb-2 mt-3 text-sm font-medium">{t('checkin.symptomsLabel')}</p>
      <div className="flex flex-wrap gap-2">
        {SYMPTOMS.map((s) => (
          <button key={s} type="button" aria-pressed={entry.symptoms.includes(s)} onClick={() => toggle(s)}
            className={`inline-flex min-h-11 items-center gap-1 rounded-full border px-3 text-sm ${entry.symptoms.includes(s) ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
            {entry.symptoms.includes(s) && <Check className="size-4" aria-hidden />}{t(`checkin.symptoms.${s}`)}
          </button>
        ))}
      </div>
      {redFlag && (
        <aside role="alert" className="mt-3 rounded-xl border-2 border-status-urgent bg-status-urgent-bg p-3 text-sm text-status-urgent">
          <p>{t('checkin.redFlag')}</p>
          <a href={`tel:${emergency.general}`} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl bg-status-urgent px-4 font-semibold text-white">
            <Phone className="size-4" aria-hidden /> {t('advisor.emergency.call', { number: emergency.general })}
          </a>
        </aside>
      )}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted">{saved ? t('checkin.savedAuto') : t('checkin.hint')}</span>
        {saved && <button type="button" onClick={() => setEditing(false)} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('checkin.done')}</button>}
      </div>
    </section>
  )
}
