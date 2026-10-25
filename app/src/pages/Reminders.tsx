import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, CalendarClock, Check, Clock, Pencil, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { localTime, todayIn, zonedDateTime } from '../lib/medications'
import { formatDate } from '../lib/format'
import { EmptyState, PageHeader } from '../components/ui'
import { SuggestedCheckups } from '../components/SuggestedCheckups'

interface ReminderRow {
  id: string
  kind: string
  status: string
  title: string
  due_at: string
  time_zone: string
  repeat_rule: string
  snoozed_until: string | null
  completed_at: string | null
}

const KINDS = ['lab_test', 'appointment', 'follow_up', 'prescription_renewal', 'custom'] as const
const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const
const inputClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm'

export function RemindersPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const [items, setItems] = useState<ReminderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const emptyForm = { title: '', kind: 'lab_test', date: todayIn(tz), time: '09:00', repeat: 'none' }
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('reminders')
      .select('id, kind, status, title, due_at, time_zone, repeat_rule, snoozed_until, completed_at')
      .neq('kind', 'medication')
      .in('status', ['active', 'completed'])
      .order('due_at')
    setItems((data ?? []) as ReminderRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(r: ReminderRow) {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: r.time_zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(r.due_at))
    setForm({ title: r.title, kind: r.kind, date, time: localTime(r.due_at, r.time_zone, 'en'), repeat: r.repeat_rule })
    setEditingId(r.id)
    setAdding(false)
    setError(false)
  }

  function closeForm() {
    setAdding(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  async function save() {
    if (!supabase || !profile || !form.title.trim() || !form.date) return
    const due = zonedDateTime(form.date, form.time || '09:00', tz)
    const fields = { kind: form.kind, title: form.title.trim().slice(0, 200), due_at: due, next_fire_at: due, time_zone: tz, repeat_rule: form.repeat }
    const { error: e } = editingId
      // A changed date or time is a new due moment: clear snooze and "already notified".
      ? await supabase.from('reminders').update({ ...fields, snoozed_until: null, last_notified_at: null }).eq('id', editingId)
      : await supabase.from('reminders').insert({ profile_id: profile.id, status: 'active', ...fields })
    if (e) return setError(true)
    closeForm()
    await load()
  }

  async function complete(id: string) {
    if (supabase && !(await supabase.rpc('complete_reminder', { p_reminder_id: id })).error) await load()
  }
  async function snooze(id: string) {
    if (!supabase) return
    const until = new Date(Date.now() + 864e5).toISOString()
    if (!(await supabase.from('reminders').update({ snoozed_until: until }).eq('id', id)).error) await load()
  }
  async function cancel(id: string) {
    if (supabase && window.confirm(t('reminders.cancelConfirm')) && !(await supabase.from('reminders').update({ status: 'cancelled' }).eq('id', id)).error) await load()
  }

  const active = items.filter((r) => r.status === 'active')
  const done = items.filter((r) => r.status === 'completed').slice(-10).reverse()

  return (
    <>
      <PageHeader title={t('reminders.title')} subtitle={t('reminders.subtitle')} />
      {profile && <SuggestedCheckups profileId={profile.id} timeZone={tz} today={todayIn(tz)} onAccepted={() => void load()} />}
      {!adding && !editingId ? (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-700 px-4 font-medium text-white sm:w-auto">
          <Plus className="size-5" aria-hidden /> {t('reminders.add')}
        </button>
      ) : (
        <section className="mb-4 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2">
          {editingId && <h2 className="font-semibold sm:col-span-2">{t('reminders.editTitle')}</h2>}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
            {t('reminders.what')} *
            <input className={inputClass} value={form.title} placeholder={t('reminders.whatHint')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('reminders.kind')}
            <select className={inputClass} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`reminders.kinds.${k}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('reminders.repeat')}
            <select className={inputClass} value={form.repeat} onChange={(e) => setForm({ ...form, repeat: e.target.value })}>
              {REPEATS.map((r) => <option key={r} value={r}>{t(`reminders.repeats.${r}`)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('reminders.date')} *
            <input type="date" dir="ltr" className={inputClass} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            {t('reminders.time')}
            <input type="time" dir="ltr" className={inputClass} value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
          </label>
          {error && <p role="alert" className="text-sm text-status-urgent sm:col-span-2">{t('review.saveError')}</p>}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" disabled={!form.title.trim() || !form.date} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50">{t('reminders.save')}</button>
            <button type="button" onClick={closeForm} className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium">{t('report.cancel')}</button>
          </div>
        </section>
      )}

      {loading ? <p role="status" className="text-muted">{t('auth.loading')}</p> : active.length === 0 ? (
        <EmptyState icon={Bell} text={t('reminders.empty')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {active.map((r) => {
            const overdue = new Date(r.due_at) < new Date()
            return (
              <li key={r.id} className="rounded-2xl border border-line bg-surface p-4">
                <div className="flex items-start gap-3">
                  <CalendarClock className={`mt-0.5 size-5 shrink-0 ${overdue ? 'text-status-watch' : 'text-brand-700'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="sensitive font-medium">{r.title}</p>
                    <p className="text-xs text-muted">
                      {t(`reminders.kinds.${r.kind}`)} · {formatDate(r.due_at, lang, r.time_zone)} <span dir="ltr">{localTime(r.due_at, r.time_zone, lang)}</span>
                      {r.repeat_rule !== 'none' && ` · ${t(`reminders.repeats.${r.repeat_rule}`)}`}
                    </p>
                    {r.snoozed_until && new Date(r.snoozed_until) > new Date() && (
                      <p className="text-xs text-muted">{t('reminders.snoozedUntil', { date: formatDate(r.snoozed_until, lang, r.time_zone) })}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void complete(r.id)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-700 px-3 text-sm font-medium text-white">
                    <Check className="size-4" aria-hidden /> {t('reminders.done')}
                  </button>
                  <button type="button" onClick={() => void snooze(r.id)} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm font-medium">
                    <Clock className="size-4" aria-hidden /> {t('reminders.snoozeDay')}
                  </button>
                  <button type="button" onClick={() => { startEdit(r); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-line px-3 text-sm font-medium">
                    <Pencil className="size-4" aria-hidden /> {t('reminders.edit')}
                  </button>
                  <button type="button" onClick={() => void cancel(r.id)} className="ms-auto inline-flex min-h-11 items-center gap-1 px-2 text-sm text-muted">
                    <X className="size-4" aria-hidden /> {t('reminders.cancel')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {done.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('reminders.completed')}</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {done.map((r) => <li key={r.id}>✓ <span className="sensitive">{r.title}</span> · {r.completed_at && formatDate(r.completed_at, lang, r.time_zone)}</li>)}
          </ul>
        </section>
      )}
      <p className="mt-6 text-xs text-muted">{t('reminders.deliveryNote')}</p>
    </>
  )
}
