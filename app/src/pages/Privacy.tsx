import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Activity, BellOff, Download, History, LockKeyhole, LogOut, MapPin, ShieldCheck, Sparkles, Trash2, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { hasAiConsent } from '../lib/documents'
import { CONSENT_VERSION } from '../lib/consent'
import { formatDate } from '../lib/format'
import { consentHistory, deleteMyAccount, exportMyData, recentActivity, type ActivityItem, type ConsentItem, type ExportProgress } from '../lib/privacy'
import { PageHeader } from '../components/ui'

function Section({ icon: Icon, title, children, tone }: { icon: typeof LockKeyhole; title: string; children: React.ReactNode; tone?: 'danger' }) {
  return (
    <section className={`rounded-2xl border bg-surface p-4 ${tone === 'danger' ? 'border-status-urgent' : 'border-line'}`}>
      <h2 className={`mb-3 flex items-center gap-2 font-semibold ${tone === 'danger' ? 'text-status-urgent' : ''}`}>
        <Icon className={`size-5 ${tone === 'danger' ? '' : 'text-brand-700'}`} aria-hidden /> {title}
      </h2>
      {children}
    </section>
  )
}

function Fact({ icon: Icon, title, body }: { icon: typeof LockKeyhole; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon className="size-4" aria-hidden /></span>
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-sm text-muted">{body}</span></span>
    </li>
  )
}

const timeOf = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function PrivacyPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { session, profile, signOut } = useAuth()
  const userId = session?.user.id ?? ''
  const [ai, setAi] = useState<boolean | null>(null)
  const [consents, setConsents] = useState<ConsentItem[] | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [progress, setProgress] = useState<ExportProgress | null>(null)
  const [exportError, setExportError] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(false)

  useEffect(() => {
    void hasAiConsent().then(setAi)
    void consentHistory().then(setConsents)
    void recentActivity().then(setActivity)
  }, [])

  async function setAiConsent(granted: boolean) {
    if (!supabase) return
    const { error } = await supabase.from('user_consents').insert({ user_id: userId, consent_type: 'ai_processing', version: CONSENT_VERSION, granted })
    if (!error) {
      setAi(granted)
      void consentHistory().then(setConsents)
    }
  }

  async function download() {
    if (!profile) return
    setExportError(false)
    try {
      const blob = await exportMyData(session?.user.email, setProgress)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `health-journal-${new Date().toISOString().slice(0, 10)}.zip`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch {
      setExportError(true)
    }
    setProgress(null)
  }

  async function remove() {
    setDeleting(true)
    setDeleteError(false)
    if (await deleteMyAccount()) {
      // The account no longer exists; clear the local session and return to sign-in.
      await signOut()
      return
    }
    setDeleting(false)
    setDeleteError(true)
  }

  const confirmWord = t('privacy.delete.word')
  const consentLabel = (type: string) =>
    type === 'notifications_email' ? t('settings.email')
    : type === 'notifications_whatsapp' ? t('settings.whatsapp')
    : t(`onboarding.consent.${type}.title`)

  return (
    <>
      <PageHeader title={t('privacy.title')} subtitle={t('privacy.subtitle')} />
      <Link to="/sharing" className="mb-4 flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm font-medium">
        <Users className="size-5 shrink-0 text-brand-700" aria-hidden /> <span className="flex-1">{t('sharing.givenTitle')}</span>
      </Link>
      <div className="flex flex-col gap-4">
        <Section icon={ShieldCheck} title={t('privacy.facts.title')}>
          <ul className="flex flex-col gap-3">
            <Fact icon={UserRound} title={t('privacy.facts.who.title')} body={t('privacy.facts.who.body')} />
            <Fact icon={MapPin} title={t('privacy.facts.where.title')} body={t('privacy.facts.where.body')} />
            <Fact icon={LockKeyhole} title={t('privacy.facts.encrypted.title')} body={t('privacy.facts.encrypted.body')} />
            <Fact icon={BellOff} title={t('privacy.facts.notifications.title')} body={t('privacy.facts.notifications.body')} />
          </ul>
        </Section>

        <Section icon={Sparkles} title={t('privacy.ai.title')}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-brand-700" checked={!!ai} disabled={ai === null} onChange={(e) => void setAiConsent(e.target.checked)} />
            <span><span className="font-medium">{t('onboarding.consent.ai_processing.title')}</span><span className="block text-muted">{t('privacy.ai.body')}</span></span>
          </label>
          <ul className="mt-3 list-disc ps-6 text-sm text-muted">
            <li>{t('privacy.ai.uses.documents')}</li>
            <li>{t('privacy.ai.uses.advisor')}</li>
            <li>{t('privacy.ai.uses.medicines')}</li>
          </ul>
          {ai === false && <p className="mt-3 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">{t('onboarding.withoutAi')}</p>}
        </Section>

        <Section icon={Download} title={t('privacy.export.title')}>
          <p className="text-sm text-muted">{t('privacy.export.body')}</p>
          <button type="button" disabled={!!progress} onClick={() => void download()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white disabled:opacity-60">
            <Download className="size-4" aria-hidden />
            {progress ? t(`privacy.export.${progress.stage}`, { done: progress.done + 1, total: progress.total }) : t('privacy.export.button')}
          </button>
          {exportError && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('privacy.export.error')}</p>}
        </Section>

        <Section icon={History} title={t('privacy.consents.title')}>
          {consents === null ? <p className="text-sm text-muted">{t('auth.loading')}</p> : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {consents.map((c, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                  <span>{consentLabel(c.type)}: <span className={c.granted ? 'font-medium text-status-ok' : 'font-medium text-muted'}>{t(c.granted ? 'privacy.consents.granted' : 'privacy.consents.declined')}</span></span>
                  <span className="text-xs text-muted">{formatDate(c.at, lang)} · {timeOf(c.at, lang)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section icon={Activity} title={t('privacy.activity.title')}>
          <p className="mb-2 text-sm text-muted">{t('privacy.activity.body')}</p>
          {activity === null ? <p className="text-sm text-muted">{t('auth.loading')}</p>
            : activity.length === 0 ? <p className="text-sm text-muted">{t('privacy.activity.empty')}</p> : (
              <ul className="flex flex-col divide-y divide-line text-sm">
                {activity.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                    <span>{t(`privacy.activity.actions.${a.action}`, { item: t(`privacy.activity.tables.${a.table}`, { defaultValue: a.table }) })}</span>
                    <span className="text-xs text-muted">{formatDate(a.at, lang)} · {timeOf(a.at, lang)}</span>
                  </li>
                ))}
              </ul>
            )}
        </Section>

        <Section icon={LogOut} title={t('privacy.signOutAll.title')}>
          <p className="text-sm text-muted">{t('privacy.signOutAll.body')}</p>
          <button type="button" onClick={() => void supabase?.auth.signOut({ scope: 'global' })} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm font-medium">
            {t('privacy.signOutAll.button')}
          </button>
        </Section>

        <Section icon={Trash2} title={t('privacy.delete.title')} tone="danger">
          <p className="text-sm">{t('privacy.delete.body')}</p>
          <p className="mt-2 text-sm text-muted">{t('privacy.delete.exportFirst')}</p>
          <label className="mt-3 flex flex-col gap-2 text-sm font-medium">
            {t('privacy.delete.typeToConfirm', { word: confirmWord })}
            <input className="min-h-11 rounded-xl border border-line bg-surface px-3" value={confirmText} autoComplete="off" onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <button type="button" disabled={deleting || confirmText.trim() !== confirmWord} onClick={() => void remove()}
            className="mt-3 min-h-11 rounded-xl bg-status-urgent px-4 text-sm font-medium text-white disabled:opacity-40">
            {deleting ? t('privacy.delete.deleting') : t('privacy.delete.button')}
          </button>
          {deleteError && <p role="alert" className="mt-2 text-sm text-status-urgent">{t('privacy.delete.error')}</p>}
        </Section>
      </div>
    </>
  )
}
