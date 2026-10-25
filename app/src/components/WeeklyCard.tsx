import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarCheck } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { findRepeatingReminder, loadCheckIns, loadVitals, setRepeatingReminder } from '../lib/daily'
import { weeklySummary, type DoseLite, type WeeklySummary } from '../domain/weekly'
import { formatNumber } from '../lib/format'

const signed = (n: number) => `${n > 0 ? '+' : ''}${n}`

/** "This week": doses, readings and check-ins compared with last week. */
export function WeeklyCard() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const [summary, setSummary] = useState<WeeklySummary | null>(null)
  const [sunday, setSunday] = useState(false)

  useEffect(() => {
    if (!supabase || !profile) return
    const since = new Date(Date.now() - 8 * 86_400_000).toISOString()
    void Promise.all([
      supabase.from('medication_dose_logs').select('scheduled_for, status').gte('scheduled_for', since),
      loadVitals(15),
      loadCheckIns(8),
    ]).then(([doses, vitals, checkIns]) => setSummary(weeklySummary((doses.data ?? []) as DoseLite[], vitals, checkIns)))
    void findRepeatingReminder('weekly_summary').then((r) => setSunday(!!r))
  }, [profile])

  if (!summary || summary.isEmpty || !profile) return null

  const rows: { label: string; value: string; change?: string }[] = []
  if (summary.doses) rows.push({ label: t('weekly.doses'), value: t('weekly.dosesValue', { taken: summary.doses.taken, due: summary.doses.due }) })
  if (summary.bp) rows.push({ label: t('weekly.bp'), value: `${summary.bp.systolic}/${summary.bp.diastolic}`, change: summary.bp.change != null ? t('weekly.vsLastWeek', { diff: signed(summary.bp.change) }) : undefined })
  if (summary.fastingGlucose) rows.push({ label: t('weekly.glucose'), value: `${summary.fastingGlucose.value} mg/dL`, change: summary.fastingGlucose.change != null ? t('weekly.vsLastWeek', { diff: signed(summary.fastingGlucose.change) }) : undefined })
  if (summary.weight) rows.push({ label: t('weekly.weight'), value: `${formatNumber(summary.weight.latest, lang, 1)} kg`, change: summary.weight.change != null ? t('weekly.vsLastWeek', { diff: signed(summary.weight.change) }) : undefined })
  if (summary.checkIns) rows.push({ label: t('weekly.checkIns'), value: t('weekly.checkInsValue', { count: summary.checkIns }) })
  if (summary.sleepAvg != null) rows.push({ label: t('weekly.sleep'), value: t('checkin.sleptHours', { hours: summary.sleepAvg }) })
  if (summary.topSymptom) rows.push({ label: t('weekly.symptom'), value: t('weekly.symptomValue', { symptom: t(`checkin.symptoms.${summary.topSymptom.key}`), count: summary.topSymptom.days }) })

  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><CalendarCheck className="size-5 text-brand-700" aria-hidden /> {t('weekly.title')}</h2>
      <dl className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-2">
            <dt className="text-muted">{r.label}</dt>
            <dd className="text-end">
              <span className="ltr-value sensitive font-medium">{r.value}</span>
              {r.change && <span className="sensitive block text-xs text-muted">{r.change}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-brand-700" checked={sunday}
          onChange={async (e) => {
            const on = e.target.checked
            if (await setRepeatingReminder(profile.id, 'weekly_summary', on, t('weekly.reminderTitle'), '18:00', profile.time_zone)) setSunday(on)
          }} />
        {t('weekly.remindSunday')}
      </label>
    </section>
  )
}
