import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, ChevronRight, Clock, HeartPulse, MoreHorizontal } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { loadDosesBetween, localDayBounds, localTime, logDose, type TodayDose } from '../../lib/medications'
import { findRepeatingReminder, loadCheckIns, loadVitals, type CheckIn } from '../../lib/daily'
import { formatDose } from '../../domain/medications'
import { CheckInRow } from '../CheckInCard'
import { Sheet } from '../Sheet'

/**
 * Today's checklist, showing only what's left: medicines due, today's
 * reading, the check-in. Finished items fold into one line.
 */
export function YourDayCard({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [doses, setDoses] = useState<TodayDose[] | null>(null)
  const [reading, setReading] = useState<{ show: boolean; done: boolean }>({ show: false, done: false })
  const [checkIn, setCheckIn] = useState<CheckIn | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [checkInOpen, setCheckInOpen] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    await supabase.rpc('generate_my_doses') // make sure today's doses exist even before the scheduled job runs
    const { start, end } = localDayBounds(timeZone)
    const [list, recent, reminder, checkIns] = await Promise.all([
      loadDosesBetween(start, end), loadVitals(14), findRepeatingReminder('vital_check'), loadCheckIns(1),
    ])
    setDoses(list)
    // A reading task appears for people who track readings (recently, or with a daily reminder).
    setReading({ show: recent.length > 0 || !!reminder, done: recent.some((r) => Date.parse(r.measured_at) >= start.getTime()) })
    setCheckIn(checkIns.find((c) => c.day === new Date(start.getTime() + 12 * 3600_000).toISOString().slice(0, 10)) ?? checkIns[0] ?? null)
  }, [timeZone])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, status: 'taken' | 'skipped' | 'snoozed' | 'pending') {
    setMenu(null)
    if (await logDose(id, status, status === 'snoozed' ? 30 : undefined)) await load()
  }

  const isDone = (d: TodayDose) => d.status === 'taken' || d.status === 'skipped' || d.status === 'not_recorded'
  const pending = (doses ?? []).filter((d) => !isDone(d))
  const finished = (doses ?? []).filter(isDone)
  const checkedIn = !!checkIn?.mood
  const doneNames = [...finished.map((d) => d.medication_schedules.medications.brand_name),
    ...(reading.show && reading.done ? [t('home.readingTask')] : []), ...(checkedIn ? [t('home.checkInShort')] : [])]
  const left = pending.length + (reading.show && !reading.done ? 1 : 0) + (checkedIn ? 0 : 1)
  const name = (d: TodayDose) => {
    const s = d.medication_schedules
    const dose = formatDose(s.dose_amount, s.dose_unit)
    return `${s.medications.brand_name}${dose ? ` · ${dose}` : ''}`
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t('home.yourDay')}</h2>
        <span className={`text-xs ${left ? 'text-muted' : 'font-medium text-status-ok'}`}>{left ? t('home.left', { count: left }) : t('home.allDone')}</span>
      </div>

      <ul className="flex flex-col">
        {pending.map((d) => (
          <li key={d.id} className="border-b border-line py-2">
            <div className="flex items-center gap-3">
              <button type="button" aria-label={t('meds.taken')} onClick={() => void act(d.id, 'taken')}
                className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand-700" />
              <Link to={`/medications/${d.medication_schedules.medication_id}`} className="min-w-0 flex-1">
                <span dir="auto" className="sensitive block truncate text-start text-sm font-medium">{name(d)}</span>
                {d.status === 'snoozed' && d.snoozed_until && <span className="block text-xs text-muted">{t('meds.snoozedUntil', { time: localTime(d.snoozed_until, timeZone, lang) })}</span>}
              </Link>
              <span className="shrink-0 text-xs text-muted" dir="ltr">{localTime(d.scheduled_for, timeZone, lang)}</span>
              <button type="button" aria-label={t('home.moreOptions')} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}
                className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted hover:bg-canvas"><MoreHorizontal className="size-4" aria-hidden /></button>
            </div>
            {menu === d.id && (
              <div className="ms-9 mt-2 flex gap-2">
                <button type="button" onClick={() => void act(d.id, 'skipped')} className="min-h-10 rounded-xl border border-line px-3 text-xs font-medium">{t('meds.skip')}</button>
                <button type="button" onClick={() => void act(d.id, 'snoozed')} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line px-3 text-xs font-medium"><Clock className="size-3.5" aria-hidden /> {t('meds.snooze')}</button>
              </div>
            )}
          </li>
        ))}

        {reading.show && !reading.done && (
          <li className="border-b border-line py-2">
            <Link to="/vitals" className="flex min-h-8 items-center gap-3">
              <span className="size-6 shrink-0 rounded-full border-2 border-brand-700" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t('home.readingTask')}</span>
              <HeartPulse className="size-4 text-brand-700" aria-hidden />
            </Link>
          </li>
        )}

        {!checkedIn && (
          <li className="border-b border-line py-2">
            <button type="button" onClick={() => setCheckInOpen(true)} className="flex min-h-8 w-full items-center gap-3 text-start">
              <span className="size-6 shrink-0 rounded-full border-2 border-brand-700" aria-hidden />
              <span className="flex-1 text-sm font-medium">{t('checkin.title')}</span>
              <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
            </button>
          </li>
        )}

        {doneNames.length > 0 && (
          <li className="pt-2">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} className="flex min-h-8 w-full items-center gap-2 text-start text-xs text-muted">
              <Check className="size-4 text-status-ok" aria-hidden />
              <span className="sensitive flex-1 truncate">{t('home.doneList', { count: doneNames.length, names: doneNames.join(t('checkin.listSep')) })}</span>
              <ChevronDown className={`size-4 transition ${showDone ? 'rotate-180' : ''}`} aria-hidden />
            </button>
            {showDone && (
              <ul className="ms-6 mt-1 flex flex-col">
                {finished.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 py-1 text-xs text-muted">
                    <span dir="auto" className="sensitive flex-1 truncate text-start">{name(d)} · {t(`meds.dose.${d.status}`)}</span>
                    {d.status !== 'not_recorded' && <button type="button" onClick={() => void act(d.id, 'pending')} className="min-h-8 px-2 font-medium text-brand-700">{t('meds.undo')}</button>}
                  </li>
                ))}
                {checkedIn && (
                  <li className="flex items-center gap-2 py-1 text-xs text-muted">
                    <span className="sensitive flex-1">{t('home.checkInShort')} · {t(`checkin.moods.${checkIn!.mood}`)}</span>
                    <button type="button" onClick={() => setCheckInOpen(true)} className="min-h-8 px-2 font-medium text-brand-700">{t('checkin.edit')}</button>
                  </li>
                )}
              </ul>
            )}
          </li>
        )}
      </ul>

      <Sheet open={checkInOpen} onClose={() => { setCheckInOpen(false); void load() }} title={t('checkin.title')}>
        <CheckInRow />
        <button type="button" onClick={() => { setCheckInOpen(false); void load() }} className="mt-4 min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white">{t('checkin.done')}</button>
      </Sheet>
    </section>
  )
}
