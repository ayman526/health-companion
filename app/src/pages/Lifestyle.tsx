import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Footprints, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { formatDate } from '../lib/format'
import { todayIn } from '../lib/medications'
import { EmptyState, PageHeader } from '../components/ui'
import { CATEGORY_ICON, LIFESTYLE_CATEGORIES, PRESETS, type LifestyleCategory, type LifestyleEvent } from '../domain/lifestyle'

const inputClass = 'min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm'

export function LifestylePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const today = todayIn(profile?.time_zone ?? 'Africa/Cairo')
  const [items, setItems] = useState<LifestyleEvent[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ category: 'exercise' as LifestyleCategory, title: '', details: '', started_on: today, ended_on: '' })
  const [ending, setEnding] = useState<string | null>(null)
  const [endDate, setEndDate] = useState(today)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('lifestyle_events').select('id, category, title, details, started_on, ended_on').order('started_on', { ascending: false })
    setItems((data ?? []) as LifestyleEvent[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    if (!supabase || !profile || !form.title.trim() || !form.started_on) return
    setError(false)
    const { error: e } = await supabase.from('lifestyle_events').insert({
      profile_id: profile.id, category: form.category, title: form.title.trim(), details: form.details.trim() || null,
      started_on: form.started_on, ended_on: form.ended_on || null,
    })
    if (e) return setError(true)
    setAdding(false)
    setForm({ category: 'exercise', title: '', details: '', started_on: today, ended_on: '' })
    await load()
  }

  async function end(id: string) {
    if (!supabase || !endDate) return
    if ((await supabase.from('lifestyle_events').update({ ended_on: endDate }).eq('id', id)).error) return setError(true)
    setEnding(null)
    await load()
  }

  async function remove(id: string) {
    if (!supabase || !window.confirm(t('lifestyle.deleteConfirm'))) return
    if ((await supabase.from('lifestyle_events').delete().eq('id', id)).error) return setError(true)
    await load()
  }

  const current = (items ?? []).filter((e) => !e.ended_on || e.ended_on >= today)
  const past = (items ?? []).filter((e) => e.ended_on && e.ended_on < today)

  const row = (e: LifestyleEvent) => {
    const Icon = CATEGORY_ICON[e.category]
    return (
      <li key={e.id} className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-brand-700" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{e.title}</p>
            <p className="text-xs text-muted">
              {t(`lifestyle.categories.${e.category}`)} · {t('lifestyle.since', { date: formatDate(e.started_on, lang) })}
              {e.ended_on && ` · ${t('lifestyle.until', { date: formatDate(e.ended_on, lang) })}`}
            </p>
            {e.details && <p className="mt-1 text-sm">{e.details}</p>}
          </div>
          <button type="button" aria-label={t('lifestyle.delete')} onClick={() => void remove(e.id)} className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas">
            <Trash2 className="size-4" aria-hidden />
          </button>
        </div>
        {!e.ended_on && (ending === e.id ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('lifestyle.endedOn')}
              <input type="date" dir="ltr" min={e.started_on} className="min-h-11 rounded-lg border border-line px-3 text-sm" value={endDate} onChange={(ev) => setEndDate(ev.target.value)} />
            </label>
            <button type="button" onClick={() => void end(e.id)} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('reminders.save')}</button>
            <button type="button" onClick={() => setEnding(null)} className="min-h-11 px-2 text-sm text-muted">{t('report.cancel')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEnding(e.id)} className="mt-2 min-h-11 text-sm font-medium text-brand-700">{t('lifestyle.stopped')}</button>
        ))}
      </li>
    )
  }

  return (
    <>
      <PageHeader title={t('lifestyle.title')} subtitle={t('lifestyle.subtitle')} />
      {!adding ? (
        <button type="button" onClick={() => setAdding(true)} className="mb-4 flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-700 px-4 font-medium text-white sm:w-auto">
          <Plus className="size-5" aria-hidden /> {t('lifestyle.add')}
        </button>
      ) : (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted">{t('lifestyle.category')}</legend>
            <div className="flex flex-wrap gap-2">
              {LIFESTYLE_CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c]
                const on = form.category === c
                return (
                  <button key={c} type="button" aria-pressed={on} onClick={() => setForm({ ...form, category: c, title: '' })}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? 'border-brand-700 bg-brand-700 text-white' : 'border-line'}`}>
                    <Icon className="size-4" aria-hidden /> {t(`lifestyle.categories.${c}`)}
                  </button>
                )
              })}
            </div>
          </fieldset>
          {PRESETS[form.category].length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {PRESETS[form.category].map((p) => (
                <button key={p} type="button" onClick={() => setForm({ ...form, title: t(`lifestyle.presets.${p}`) })}
                  className={`min-h-11 rounded-full border px-3 text-sm ${form.title === t(`lifestyle.presets.${p}`) ? 'border-brand-600 bg-brand-50' : 'border-line bg-canvas'}`}>
                  {t(`lifestyle.presets.${p}`)}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
              {t('lifestyle.what')} *
              <input className={inputClass} maxLength={200} value={form.title} placeholder={t('lifestyle.whatHint')} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('lifestyle.startedOn')} *
              <input type="date" dir="ltr" max={today} className={inputClass} value={form.started_on} onChange={(e) => setForm({ ...form, started_on: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted">
              {t('lifestyle.endedOnOptional')}
              <input type="date" dir="ltr" min={form.started_on} className={inputClass} value={form.ended_on} onChange={(e) => setForm({ ...form, ended_on: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-muted sm:col-span-2">
              {t('lifestyle.details')}
              <textarea rows={2} maxLength={1000} className={`${inputClass} py-2`} value={form.details} placeholder={t('lifestyle.detailsHint')} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            </label>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('review.saveError')}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={!form.title.trim() || !form.started_on} onClick={() => void save()} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-50">{t('reminders.save')}</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-xl border border-line px-4 text-sm font-medium">{t('report.cancel')}</button>
          </div>
        </section>
      )}

      {items === null ? <p role="status" className="text-muted">{t('auth.loading')}</p> : items.length === 0 ? (
        <EmptyState icon={Footprints} text={t('lifestyle.empty')} />
      ) : (
        <div className="flex flex-col gap-6">
          {current.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('lifestyle.current')}</h2>
              <ul className="flex flex-col gap-2">{current.map(row)}</ul>
            </section>
          )}
          {past.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted">{t('lifestyle.past')}</h2>
              <ul className="flex flex-col gap-2">{past.map(row)}</ul>
            </section>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t('lifestyle.why')}</p>
    </>
  )
}
