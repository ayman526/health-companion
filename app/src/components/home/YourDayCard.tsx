import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Check, ChevronRight, Clock, HeartPulse, MoreHorizontal, Undo2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate } from '../../lib/format'
import { loadDosesBetween, localDayBounds, localTime, logDose, type TodayDose } from '../../lib/medications'
import { findRepeatingReminder, loadVitals } from '../../lib/daily'
import { CheckInRow } from '../CheckInCard'

interface NextReminder { id: string; title: string; due_at: string }

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 15
  const c = 2 * Math.PI * r
  const share = total ? done / total : 0
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" aria-hidden className="shrink-0">
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-line)" strokeWidth="4" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="var(--color-brand-700)" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${c * share} ${c}`} transform="rotate(-90 18 18)" />
    </svg>
  )
}

/** Everything to do today in one checklist: medicines, a reading, the check-in. */
export function YourDayCard({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [doses, setDoses] = useState<TodayDose[] | null>(null)
  const [reading, setReading] = useState<{ show: boolean; done: boolean }>({ show: false, done: false })
  const [checkedIn, setCheckedIn] = useState(false)
  const [next, setNext] = useState<NextReminder | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!supabase) return
    await supabase.rpc('generate_my_doses') // make sure today's doses exist even before the scheduled job runs
    const { start, end } = localDayBounds(timeZone)
    setDoses(await loadDosesBetween(start, end))
    const { data } = await supabase.from('reminders').select('id, title, due_at').eq('status', 'active')
      .not('kind', 'in', '(medication,vital_check,weekly_summary)')
      .lte('due_at', new Date(Date.now() + 7 * 864e5).toISOString()).order('due_at').limit(1)
    setNext(data?.[0] ?? null)
    // A reading task appears for people who track readings (recently, or with a daily reminder).
    const [recent, reminder] = await Promise.all([loadVitals(14), findRepeatingReminder('vital_check')])
    setReading({ show: recent.length > 0 || !!reminder, done: recent.some((r) => Date.parse(r.measured_at) >= start.getTime()) })
  }, [timeZone])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, status: 'taken' | 'skipped' | 'snoozed' | 'pending') {
    setMenu(null)
    if (await logDose(id, status, status === 'snoozed' ? 30 : undefined)) await load()
  }

  const isDone = (d: TodayDose) => d.status === 'taken' || d.status === 'skipped' || d.status === 'not_recorded'
  const total = (doses?.length ?? 0) + (reading.show ? 1 : 0) + 1
  const done = (doses?.filter(isDone).length ?? 0) + (reading.show && reading.done ? 1 : 0) + (checkedIn ? 1 : 0)

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t('home.yourDay')}</h2>
        <span className="flex items-center gap-2 text-xs text-muted"><ProgressRing done={done} total={total} />{t('home.doneOf', { done, total })}</span>
      </div>

      <ul className="flex flex-col">
        {(doses ?? []).map((d) => {
          const s = d.medication_schedules
          const finished = isDone(d)
          return (
            <li key={d.id} className="border-b border-line py-2 last:border-0">
              <div className="flex items-center gap-3">
                <button type="button" aria-label={finished ? t('meds.undo') : t('meds.taken')} disabled={d.status === 'not_recorded'}
                  onClick={() => void act(d.id, finished ? 'pending' : 'taken')}
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${finished ? 'border-brand-700 bg-brand-700 text-white' : 'border-brand-700'}`}>
                  {finished && (d.status === 'taken' ? <Check className="size-3.5" aria-hidden /> : <Undo2 className="size-3" aria-hidden />)}
                </button>
                <Link to={`/medications/${s.medication_id}`} className="min-w-0 flex-1">
                  <span dir="auto" className={`sensitive block truncate text-start text-sm ${finished ? 'text-muted line-through' : 'font-medium'}`}>
                    {s.medications.brand_name}{s.dose_amount ? ` · ${s.dose_amount} ${s.dose_unit ?? ''}` : ''}
                  </span>
                  {d.status !== 'pending' && <span className="block text-xs text-muted">{d.status === 'snoozed' && d.snoozed_until ? t('meds.snoozedUntil', { time: localTime(d.snoozed_until, timeZone, lang) }) : t(`meds.dose.${d.status}`)}</span>}
                </Link>
                <span className="shrink-0 text-xs text-muted" dir="ltr">{localTime(d.scheduled_for, timeZone, lang)}</span>
                {!finished && (
                  <button type="button" aria-label={t('home.moreOptions')} aria-expanded={menu === d.id} onClick={() => setMenu(menu === d.id ? null : d.id)}
                    className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted hover:bg-canvas"><MoreHorizontal className="size-4" aria-hidden /></button>
                )}
              </div>
              {menu === d.id && (
                <div className="ms-9 mt-2 flex gap-2">
                  <button type="button" onClick={() => void act(d.id, 'skipped')} className="min-h-10 rounded-xl border border-line px-3 text-xs font-medium">{t('meds.skip')}</button>
                  <button type="button" onClick={() => void act(d.id, 'snoozed')} className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line px-3 text-xs font-medium"><Clock className="size-3.5" aria-hidden /> {t('meds.snooze')}</button>
                </div>
              )}
            </li>
          )
        })}

        {reading.show && (
          <li className="border-b border-line py-2">
            <Link to="/vitals" className="flex items-center gap-3">
              <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 border-brand-700 ${reading.done ? 'bg-brand-700 text-white' : ''}`} aria-hidden>
                {reading.done && <Check className="size-3.5" />}
              </span>
              <span className={`flex-1 text-sm ${reading.done ? 'text-muted line-through' : 'font-medium'}`}>{t('home.readingTask')}</span>
              <HeartPulse className="size-4 text-brand-700" aria-hidden />
            </Link>
          </li>
        )}

        <li className="pt-2"><CheckInRow onDone={setCheckedIn} /></li>
      </ul>

      {next && (
        <Link to="/reminders" className="mt-3 flex items-center gap-2 border-t border-line pt-3 text-xs text-muted">
          <span className="flex-1 truncate">{t('home.nextUp')} <span className="sensitive font-medium text-ink">{next.title}</span> · {formatDate(next.due_at, lang, timeZone)}</span>
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      )}
    </section>
  )
}
