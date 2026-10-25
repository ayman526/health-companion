import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CalendarClock, FileText, Footprints, Pill, Plus, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { EmptyState, PageHeader } from '../components/ui'

interface EventRow {
  id: string
  event_type: string
  occurred_on: string
  title: string
  ref_table: string
  ref_id: string
  created_at: string
}

const FILTERS = {
  all: null,
  labs: ['lab_report'],
  meds: ['medication_started', 'medication_changed', 'medication_stopped'],
  care: ['reminder_completed', 'follow_up', 'appointment', 'diagnosis'],
  lifestyle: ['lifestyle'],
} as const

const ICON: Record<string, typeof FileText> = {
  lab_report: FileText,
  medication_started: Pill,
  medication_changed: Pill,
  medication_stopped: Pill,
  reminder_completed: Bell,
  diagnosis: Stethoscope,
  lifestyle: Footprints,
}

function linkFor(e: EventRow): string | null {
  if (e.ref_table === 'laboratory_reports') return `/records/reports/${e.ref_id}`
  if (e.ref_table === 'medications') return `/medications/${e.ref_id}`
  if (e.ref_table === 'reminders') return '/reminders'
  if (e.ref_table === 'lifestyle_events') return '/lifestyle'
  return null
}

export function TimelinePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all')

  useEffect(() => {
    if (!supabase) return
    void supabase
      .from('health_events')
      .select('id, event_type, occurred_on, title, ref_table, ref_id, created_at')
      .order('occurred_on', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setEvents((data ?? []) as EventRow[]))
  }, [])

  const groups = useMemo(() => {
    const allowed = FILTERS[filter] as readonly string[] | null
    const list = (events ?? []).filter((e) => !allowed || allowed.includes(e.event_type))
    const byMonth = new Map<string, EventRow[]>()
    for (const e of list) {
      const key = e.occurred_on.slice(0, 7)
      byMonth.set(key, [...(byMonth.get(key) ?? []), e])
    }
    return [...byMonth.entries()]
  }, [events, filter])

  const monthLabel = (ym: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`))

  return (
    <>
      <PageHeader title={t('timeline.title')} />
      <Link to="/lifestyle" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
        <Plus className="size-4" aria-hidden /> {t('lifestyle.add')}
      </Link>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('timeline.filter')}>
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={`min-h-11 rounded-full border px-4 text-sm font-medium ${filter === f ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-surface'}`}>
            {t(`timeline.filters.${f}`)}
          </button>
        ))}
      </div>
      {events === null ? <p role="status" className="text-muted">{t('auth.loading')}</p> : groups.length === 0 ? (
        <EmptyState icon={CalendarClock} text={t('timeline.empty')} />
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 text-sm font-semibold text-muted">{monthLabel(month)}</h2>
              <ol className="relative flex flex-col gap-2 border-s-2 border-line ps-4">
                {list.map((e) => {
                  const Icon = ICON[e.event_type] ?? CalendarClock
                  const to = linkFor(e)
                  const body = (
                    <span className="flex items-start gap-3">
                      <Icon className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="sensitive block text-sm font-medium">{t(`timeline.types.${e.event_type}`, { title: e.title })}</span>
                        <span className="block text-xs text-muted">{formatDate(e.occurred_on, lang)}</span>
                      </span>
                    </span>
                  )
                  return (
                    <li key={e.id} className="rounded-xl border border-line bg-surface px-3 py-2">
                      {to ? <Link to={to} className="block min-h-11">{body}</Link> : body}
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
