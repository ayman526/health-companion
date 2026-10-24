import { useTranslation } from 'react-i18next'
import type { Frequency } from '../domain/medications'

export function useScheduleText() {
  const { t, i18n } = useTranslation()
  const weekday = (d: number) => new Intl.DateTimeFormat(i18n.language === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + d)))
  return (s: { dose_amount: number | string | null; dose_unit: string | null; frequency: Frequency; every_n_days: number | string | null; days_of_week: number[] | null; times_of_day: string[] }) => {
    const dose = s.dose_amount ? `${s.dose_amount} ${s.dose_unit ?? ''}`.trim() : ''
    const times = s.times_of_day.map((x) => x.slice(0, 5)).join(', ')
    const when =
      s.frequency === 'as_needed' ? t('meds.freq.as_needed')
      : s.frequency === 'weekly' ? t('meds.summary.weekly', { days: (s.days_of_week ?? []).map(weekday).join(', '), times })
      : s.frequency === 'every_n_days' ? t('meds.summary.everyN', { n: s.every_n_days, times })
      : t('meds.summary.daily', { count: s.times_of_day.length, times })
    return [dose, when].filter(Boolean).join(' · ')
  }
}
