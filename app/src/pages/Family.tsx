import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Check, Plus, Share2, Trash2, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { listFiles } from '../lib/privacy'
import { useAuth, type Relationship } from '../auth/AuthProvider'
import { ageOn } from '../domain/profileOptions'
import { PageHeader } from '../components/ui'
import { fieldClass } from '../components/ProfileFields'
import { OfferCard } from '../components/OfferCard'

const RELATIONSHIPS: Exclude<Relationship, 'self' | 'shared'>[] = ['parent', 'spouse', 'child', 'sibling', 'grandparent', 'other']

/** Everyone this account keeps records for. Each person's records stay separate. */
export function FamilyPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, profile, self, profiles, switchProfile, refreshProfile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', relationship: 'parent' as Exclude<Relationship, 'self' | 'shared'>, dob: '', sex: '' })
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const today = new Date().toISOString().slice(0, 10)

  const nameOf = (p: (typeof profiles)[number]) =>
    p.relationship === 'self' ? t('family.you') : p.display_name || t(`family.relationships.${p.relationship}`)

  function open(id: string) {
    switchProfile(id)
    navigate('/')
  }

  async function add() {
    if (!supabase || !session || !self) return
    if (!form.name.trim()) return setError(t('family.nameRequired'))
    setError(null)
    const { data, error: e } = await supabase.from('health_profiles').insert({
      owner_id: session.user.id,
      relationship: form.relationship,
      display_name: form.name.trim().slice(0, 120),
      date_of_birth: form.dob || null,
      sex: form.sex || null,
      country: self.country,
      ui_language: self.ui_language,
      explanation_language: self.explanation_language,
      time_zone: self.time_zone,
      onboarding_completed_at: new Date().toISOString(),
    }).select('id').single()
    if (e) return setError(e.message.includes('limit') ? t('family.limit') : t('review.saveError'))
    await refreshProfile()
    setAdding(false)
    setForm({ name: '', relationship: 'parent', dob: '', sex: '' })
    open(data.id)
  }

  async function remove(id: string) {
    if (!supabase) return
    setError(null)
    try {
      // Their documents and photos first, then the profile and all its records.
      const paths = await listFiles(id)
      for (let i = 0; i < paths.length; i += 100) {
        const { error: e } = await supabase.storage.from('medical-documents').remove(paths.slice(i, i + 100))
        if (e) throw e
      }
      const { error: e } = await supabase.from('health_profiles').delete().eq('id', id)
      if (e) throw e
    } catch {
      return setError(t('family.removeError'))
    }
    if (profile?.id === id && self) switchProfile(self.id)
    setRemoving(null)
    setConfirmName('')
    await refreshProfile()
  }

  return (
    <>
      <PageHeader title={t('family.title')} subtitle={t('family.subtitle')} />
      {profiles.filter((x) => x.access === 'owner').length >= 2 && <OfferCard moment="second_person" className="mb-4" />}
      <Link to="/sharing" className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm font-medium">
        <ArrowRightLeft className="size-5 shrink-0 text-brand-700" aria-hidden /> <span className="flex-1">{t('sharing.familyLink')}</span>
      </Link>
      <ul className="flex flex-col gap-2">
        {profiles.map((p) => {
          const age = ageOn(p.date_of_birth, today)
          const active = p.id === profile?.id
          return (
            <li key={p.id} className={`rounded-2xl border bg-surface p-4 ${active ? 'border-brand-700' : 'border-line'}`}>
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><UserRound className="size-5" aria-hidden /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{nameOf(p)}</span>
                  <span className="block text-xs text-muted">
                    {p.access === 'owner' ? t(`family.relationships.${p.relationship}`) : `${t('sharing.sharedBadge')} · ${t(`sharing.access.${p.access}`)}`}{age != null ? ` · ${t('family.age', { age })}` : ''}
                  </span>
                </span>
                {active ? (
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700"><Check className="size-4" aria-hidden /> {t('family.viewing')}</span>
                ) : (
                  <button type="button" onClick={() => open(p.id)} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('family.view')}</button>
                )}
              </div>
              {p.access === 'owner' && (
                <Link to={`/sharing?profile=${p.id}`} className="mt-2 me-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-700"><Share2 className="size-4" aria-hidden /> {t('sharing.actions.share')}</Link>
              )}
              {p.access === 'owner' && p.relationship !== 'self' && (
                removing === p.id ? (
                  <div className="mt-3 rounded-xl bg-status-urgent-bg p-3 text-sm text-status-urgent">
                    <p>{t('family.removeWarning', { name: nameOf(p) })}</p>
                    <label className="mt-2 flex flex-col gap-1 font-medium">{t('family.typeName', { name: nameOf(p) })}
                      <input className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
                    </label>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={confirmName.trim() !== nameOf(p)} onClick={() => void remove(p.id)} className="min-h-11 rounded-xl bg-status-urgent px-4 font-medium text-white disabled:opacity-40">{t('family.removeConfirm')}</button>
                      <button type="button" onClick={() => { setRemoving(null); setConfirmName('') }} className="min-h-11 rounded-xl border border-line bg-surface px-4 font-medium text-ink">{t('report.cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setRemoving(p.id)} className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm text-muted"><Trash2 className="size-4" aria-hidden /> {t('family.remove')}</button>
                )
              )}
            </li>
          )
        })}
      </ul>

      {adding ? (
        <section className="mt-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-3 font-semibold">{t('family.addTitle')}</h2>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">{t('family.name')}
              <input className={fieldClass} maxLength={120} value={form.name} placeholder={t('family.namePlaceholder')} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('family.relationship')}
              <select className={fieldClass} value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value as typeof form.relationship })}>
                {RELATIONSHIPS.map((r) => <option key={r} value={r}>{t(`family.relationships.${r}`)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('onboarding.dob')}
              <input className={fieldClass} type="date" dir="ltr" min="1900-01-01" max={today} value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('profileFields.sex')}
              <select className={fieldClass} value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                <option value="">—</option>
                {(['female', 'male', 'intersex', 'prefer_not_to_say'] as const).map((s) => <option key={s} value={s}>{t(`profileFields.sexes.${s}`)}</option>)}
              </select>
            </label>
            <p className="text-xs text-muted">{t('family.consentNote')}</p>
          </div>
          {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void add()} className="min-h-12 flex-1 rounded-xl bg-brand-700 font-medium text-white">{t('family.addButton')}</button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-12 rounded-xl border border-line px-4 font-medium">{t('report.cancel')}</button>
          </div>
        </section>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-600 font-medium text-brand-700">
          <Plus className="size-5" aria-hidden /> {t('family.add')}
        </button>
      )}
      {error && !adding && <p role="alert" className="mt-2 text-sm text-status-urgent">{error}</p>}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted"><Users className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('family.privacyNote')}</p>
    </>
  )
}
