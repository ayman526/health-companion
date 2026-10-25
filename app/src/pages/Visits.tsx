import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarClock, ChevronRight, ClipboardList, Plus, Stethoscope } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { addVisit, loadVisits, type Visit } from '../lib/visits'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/format'
import { localTime } from '../lib/medications'
import { PageHeader } from '../components/ui'
import { SuggestInput } from '../components/SuggestInput'
import { fieldClass } from '../components/ProfileFields'

/** Doctor visits: upcoming and past, with a reminder before and an update after each. */
export function VisitsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const navigate = useNavigate()
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const [visits, setVisits] = useState<Visit[] | null>(null)
  const [doctors, setDoctors] = useState<string[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', clinician: '', location: '', date: '', time: '10:00' })
  const [error, setError] = useState(false)

  useEffect(() => {
    void loadVisits().then(setVisits)
    // Doctor names already used (visits and prescriptions), to pick instead of retyping.
    if (supabase) {
      void Promise.all([
        supabase.from('appointments').select('clinician'),
        supabase.from('medications').select('prescriber'),
      ]).then(([a, m]) => setDoctors([...new Set([...(a.data ?? []).map((x) => x.clinician), ...(m.data ?? []).map((x) => x.prescriber)].filter((x): x is string => !!x))]))
    }
  }, [profile?.id])

  async function save() {
    if (!profile || !form.date || !form.title.trim()) return setError(true)
    setError(false)
    const startsAt = new Date(`${form.date}T${form.time || '10:00'}`).toISOString()
    const id = await addVisit(profile.id, { title: form.title, clinician: form.clinician, location: form.location, startsAt }, tz,
      { prep: t('visits.reminderPrep'), followup: t('visits.reminderFollowup') })
    if (!id) return setError(true)
    navigate(`/visits/${id}`)
  }

  const now = new Date().toISOString()
  const upcoming = (visits ?? []).filter((v) => v.starts_at >= now).reverse()
  const past = (visits ?? []).filter((v) => v.starts_at < now)

  const row = (v: Visit) => (
    <li key={v.id}>
      <Link to={`/visits/${v.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2">
        <Stethoscope className="size-5 shrink-0 text-brand-700" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="sensitive block truncate font-medium">{v.title}{v.clinician ? ` · ${v.clinician}` : ''}</span>
          <span className="block text-xs text-muted">{formatDate(v.starts_at, lang, tz)} · {localTime(v.starts_at, tz, lang)}
            {v.starts_at < now && !v.followup_done_at && <span className="ms-2 font-medium text-status-watch">{t('visits.updatePending')}</span>}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
      </Link>
    </li>
  )

  return (
    <>
      <PageHeader title={t('visits.title')} subtitle={t('visits.subtitle')} />
      <Link to="/summary" className="mb-4 flex min-h-14 items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 px-4 font-medium text-brand-700">
        <ClipboardList className="size-5 shrink-0" aria-hidden /> <span className="flex-1">{t('summary.homeLink')}</span>
        <ChevronRight className="size-5 rtl:rotate-180" aria-hidden />
      </Link>

      {adding ? (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">{t('visits.add')}</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('visits.what')}
              <input className={fieldClass} maxLength={200} placeholder={t('visits.whatPlaceholder')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <div className="col-span-2">
              <SuggestInput label={t('visits.doctor')} className={fieldClass} value={form.clinician} onChange={(v) => setForm({ ...form, clinician: v })} options={doctors} />
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('visits.date')}
              <input type="date" dir="ltr" className={fieldClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('visits.time')}
              <input type="time" dir="ltr" className={fieldClass} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('visits.place')}
              <input className={fieldClass} maxLength={200} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </label>
          </div>
          <p className="mt-3 text-xs text-muted">{t('visits.remindersNote')}</p>
          {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('visits.invalid')}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void save()} className="min-h-12 flex-1 rounded-xl bg-brand-700 font-medium text-white">{t('visits.save')}</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 rounded-xl border border-line px-4 font-medium">{t('report.cancel')}</button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-600 font-medium text-brand-700">
          <Plus className="size-5" aria-hidden /> {t('visits.add')}
        </button>
      )}

      {visits && visits.length === 0 && !adding && (
        <p className="flex items-center gap-2 rounded-2xl border border-dashed border-line p-4 text-sm text-muted"><CalendarClock className="size-4" aria-hidden /> {t('visits.empty')}</p>
      )}
      {upcoming.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('visits.upcoming')}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{upcoming.map(row)}</ul>
        </section>
      )}
      {past.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('visits.past')}</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">{past.map(row)}</ul>
        </section>
      )}
    </>
  )
}
