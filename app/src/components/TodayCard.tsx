import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarCheck, Check, Clock, Pill, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { loadDosesBetween, localDayBounds, localTime, logDose, type TodayDose } from '../lib/medications'
import { Card } from './ui'
import { photoUrls } from '../lib/medicationPhotos'

interface UpcomingReminder {
  id: string
  title: string
  kind: string
  due_at: string
}

const STATUS_STYLE: Record<TodayDose['status'], string> = {
  taken: 'text-status-ok',
  skipped: 'text-status-watch',
  not_recorded: 'text-muted',
  pending: 'text-ink',
  snoozed: 'text-ink',
}

/** Today's doses (taken / skipped / snooze) and reminders due in the next 7 days. */
export function TodayCard({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [doses, setDoses] = useState<TodayDose[] | null>(null)
  const [reminders, setReminders] = useState<UpcomingReminder[]>([])
  const [photos, setPhotos] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!supabase) return
    await supabase.rpc('generate_my_doses') // make sure today's doses exist even before the scheduled job runs
    const { start, end } = localDayBounds(timeZone)
    const list = await loadDosesBetween(start, end)
    setDoses(list)
    setPhotos(await photoUrls([...new Set(list.map((d) => d.medication_schedules.medications.photo_path).filter((p): p is string => !!p))]))
    const { data } = await supabase
      .from('reminders')
      .select('id, title, kind, due_at')
      .eq('status', 'active')
      .neq('kind', 'medication')
      .lte('due_at', new Date(Date.now() + 7 * 864e5).toISOString())
      .order('due_at')
      .limit(5)
    setReminders(data ?? [])
  }, [timeZone])

  useEffect(() => {
    void load()
  }, [load])

  async function act(id: string, status: 'taken' | 'skipped' | 'snoozed' | 'pending') {
    if (await logDose(id, status, status === 'snoozed' ? 30 : undefined)) await load()
  }

  const empty = doses && doses.length === 0 && reminders.length === 0

  return (
    <Card title={t('home.today')}>
      {empty && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CalendarCheck className="size-4" aria-hidden /> {t('home.emptyToday')}
        </p>
      )}
      {doses && doses.length > 0 && (
        <ul className="flex flex-col divide-y divide-line">
          {doses.map((d) => {
            const s = d.medication_schedules
            const done = d.status === 'taken' || d.status === 'skipped' || d.status === 'not_recorded'
            const snoozed = d.status === 'snoozed' && d.snoozed_until
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <span className="w-12 shrink-0 text-sm font-semibold" dir="ltr">{localTime(d.scheduled_for, timeZone, lang)}</span>
                <Link to={`/medications/${s.medication_id}`} className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {s.medications.photo_path && photos[s.medications.photo_path]
                      ? <img src={photos[s.medications.photo_path]} alt="" className="size-7 shrink-0 rounded object-cover" />
                      : <Pill className="size-4 shrink-0 text-brand-700" aria-hidden />}
                    {s.medications.brand_name}
                  </span>
                  <span className={`block text-xs ${STATUS_STYLE[d.status]}`}>
                    {s.dose_amount ? `${s.dose_amount} ${s.dose_unit ?? ''} · ` : ''}
                    {snoozed ? t('meds.snoozedUntil', { time: localTime(d.snoozed_until!, timeZone, lang) }) : t(`meds.dose.${d.status}`)}
                  </span>
                </Link>
                {done ? (
                  d.status !== 'not_recorded' && (
                    <button type="button" onClick={() => void act(d.id, 'pending')} aria-label={t('meds.undo')} className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas">
                      <Undo2 className="size-4" aria-hidden />
                    </button>
                  )
                ) : (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => void act(d.id, 'taken')} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-700 px-3 text-sm font-medium text-white">
                      <Check className="size-4" aria-hidden /> {t('meds.taken')}
                    </button>
                    <button type="button" onClick={() => void act(d.id, 'skipped')} className="min-h-11 rounded-xl border border-line px-3 text-sm font-medium">{t('meds.skip')}</button>
                    <button type="button" onClick={() => void act(d.id, 'snoozed')} aria-label={t('meds.snooze')} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-line">
                      <Clock className="size-4" aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {reminders.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold text-muted">{t('reminders.comingUp')}</p>
          <ul className="flex flex-col gap-2">
            {reminders.map((r) => (
              <li key={r.id}>
                <Link to="/reminders" className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{r.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDate(r.due_at, lang, timeZone)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">{t('meds.selfReported')}</p>
    </Card>
  )
}
