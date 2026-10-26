import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Eye, HandHelping, History, Inbox, Send, Share2, UserRound } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import {
  handOver, inviteToShare, loadActivity, loadShares, pendingForMe, requestAccess, respond, revokeShare, updateShare,
  type Share, type ShareAccess, type ShareActivity,
} from '../lib/sharing'
import { formatDate } from '../lib/format'
import { PageHeader } from '../components/ui'
import { fieldClass } from '../components/ProfileFields'

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Inbox; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="size-5 text-brand-700" aria-hidden /> {title}</h2>
      {children}
    </section>
  )
}

const button = 'min-h-11 rounded-xl px-4 text-sm font-medium'
const primary = `${button} bg-brand-700 text-white disabled:opacity-50`
const secondary = `${button} border border-line bg-surface`

function AccessPicker({ value, onChange }: { value: ShareAccess; onChange: (v: ShareAccess) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('sharing.accessLabel')}</legend>
      {(['view', 'help'] as const).map((a) => (
        <label key={a} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${value === a ? 'border-brand-700 bg-brand-50' : 'border-line'}`}>
          <input type="radio" className="mt-0.5 size-4 accent-brand-700" checked={value === a} onChange={() => onChange(a)} />
          <span><span className="block font-medium">{t(`sharing.access.${a}`)}</span><span className="block text-xs text-muted">{t(`sharing.accessHint.${a}`)}</span></span>
        </label>
      ))}
    </fieldset>
  )
}

/**
 * Sharing between accounts: what is waiting for your answer, who can see your
 * records (change or stop at any time, with their activity), records shared
 * with you, and the actions: share, ask to see, hand over.
 */
export function SharingPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profiles, refreshProfile, switchProfile } = useAuth()
  const [params] = useSearchParams()
  const mine = profiles.filter((p) => p.access === 'owner')
  const kept = mine.filter((p) => p.relationship !== 'self')
  const nameOf = (id: string | null) => {
    const p = profiles.find((x) => x.id === id)
    return !p ? '' : p.relationship === 'self' ? t('family.you') : p.display_name || t(`family.relationships.${p.relationship}`)
  }

  const isSelf = (id: string | null) => profiles.find((x) => x.id === id)?.relationship === 'self'
  const recordsOf = (id: string | null) => (isSelf(id) ? t('sharing.yourRecords') : nameOf(id))
  const [shares, setShares] = useState<Share[] | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [choices, setChoices] = useState<Record<string, { profileId: string; access: ShareAccess; alerts: boolean; keep: boolean }>>({})
  const [activity, setActivity] = useState<Record<string, ShareActivity[]>>({})
  const [form, setForm] = useState<'share' | 'ask' | 'handover' | null>(params.get('profile') ? 'share' : null)
  const [share, setShare] = useState({ profileId: params.get('profile') ?? mine[0]?.id ?? '', email: '', access: 'view' as ShareAccess, alerts: false, days: 0 })
  const [ask, setAsk] = useState('')
  const [hand, setHand] = useState({ profileId: kept[0]?.id ?? '', email: '', keep: 'view' as ShareAccess | '' })

  const reload = useCallback(async () => setShares(await loadShares()), [])
  useEffect(() => {
    void reload()
  }, [reload])

  async function run(action: () => Promise<string | true>, okText: string, after?: () => void) {
    setBusy(true)
    setMessage(null)
    const r = await action()
    setBusy(false)
    if (r === true) {
      setMessage({ ok: true, text: okText })
      after?.()
      await reload()
      await refreshProfile()
    } else setMessage({ ok: false, text: t(`sharing.errors.${r}`, t('sharing.errors.failed')) })
  }

  const list = shares ?? []
  const waiting = pendingForMe(list)
  const given = list.filter((s) => s.direction === 'given' && s.kind !== 'transfer')
  const transfersSent = list.filter((s) => s.direction === 'given' && s.kind === 'transfer')
  const received = list.filter((s) => s.direction === 'received' && s.status === 'active')
  const sent = list.filter((s) => s.direction === 'sent')
  const choice = (s: Share) => choices[s.id] ?? { profileId: mine.find((p) => p.relationship === 'self')?.id ?? '', access: 'view' as ShareAccess, alerts: false, keep: true }
  const setChoice = (s: Share, patch: Partial<ReturnType<typeof choice>>) => setChoices({ ...choices, [s.id]: { ...choice(s), ...patch } })
  const who = (name: string, email: string | null) => name || email || ''

  return (
    <div className="flex flex-col gap-4 pb-8">
      <PageHeader title={t('sharing.title')} subtitle={t('sharing.subtitle')} />
      {message && <p role={message.ok ? 'status' : 'alert'} className={`rounded-xl px-4 py-3 text-sm ${message.ok ? 'bg-brand-50 text-brand-700' : 'bg-status-watch-bg text-status-watch'}`}>{message.text}</p>}

      {waiting.length > 0 && (
        <Card title={t('sharing.waitingTitle')} icon={Inbox}>
          <ul className="flex flex-col gap-4">
            {waiting.map((s) => (
              <li key={s.id} className="rounded-xl bg-canvas p-3">
                {s.kind === 'invite' && (
                  <>
                    <p className="text-sm"><span className="font-semibold">{who(s.owner_name, s.owner_email)}</span> {t('sharing.inviteText', { access: t(`sharing.access.${s.access}`) })}</p>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy} className={primary} onClick={() => void run(() => respond(s.id, true), t('sharing.done.accepted'))}>{t('sharing.accept')}</button>
                      <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => respond(s.id, false), t('sharing.done.declined'))}>{t('sharing.decline')}</button>
                    </div>
                  </>
                )}
                {s.kind === 'transfer' && (
                  <>
                    <p className="text-sm"><span className="font-semibold">{who(s.owner_name, s.owner_email)}</span> {t('sharing.transferText', { name: s.profile_name })}</p>
                    <p className="mt-1 text-xs text-muted">{t('sharing.transferNote')}</p>
                    {s.keep_access && (
                      <label className="mt-2 flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={choice(s).keep} onChange={(e) => setChoice(s, { keep: e.target.checked })} />
                        <span>{t('sharing.keepAccess', { name: who(s.owner_name, s.owner_email), access: t(`sharing.access.${s.keep_access}`) })}</span>
                      </label>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy} className={primary} onClick={() => void run(() => respond(s.id, true, { keep: choice(s).keep }), t('sharing.done.transferred'), () => s.profile_id && switchProfile(s.profile_id))}>{t('sharing.takeOver')}</button>
                      <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => respond(s.id, false), t('sharing.done.declined'))}>{t('sharing.decline')}</button>
                    </div>
                  </>
                )}
                {s.kind === 'request' && (
                  <>
                    <p className="text-sm"><span className="font-semibold">{who(s.grantee_name, s.grantee_email)}</span> {t('sharing.requestText')}</p>
                    <div className="mt-3 flex flex-col gap-3">
                      {mine.length > 1 && (
                        <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.whichRecords')}
                          <select className={fieldClass} value={choice(s).profileId} onChange={(e) => setChoice(s, { profileId: e.target.value })}>
                            {mine.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
                          </select>
                        </label>
                      )}
                      <AccessPicker value={choice(s).access} onChange={(access) => setChoice(s, { access })} />
                      <label className="flex items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={choice(s).alerts} onChange={(e) => setChoice(s, { alerts: e.target.checked })} />
                        <span>{t('sharing.alertsLabel')}<span className="block text-xs text-muted">{t('sharing.alertsHint')}</span></span>
                      </label>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={busy} className={primary} onClick={() => void run(() => respond(s.id, true, choice(s)), t('sharing.done.approved'))}>{t('sharing.approve')}</button>
                      <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => respond(s.id, false), t('sharing.done.declined'))}>{t('sharing.decline')}</button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('sharing.givenTitle')} icon={Eye}>
        {given.length === 0 && transfersSent.length === 0 ? <p className="text-sm text-muted">{t('sharing.givenEmpty')}</p> : (
          <ul className="flex flex-col divide-y divide-line">
            {given.map((s) => (
              <li key={s.id} className="py-3 first:pt-0">
                <p className="text-sm"><span dir="ltr" className="font-medium">{who(s.grantee_name, s.grantee_email)}</span> · {recordsOf(s.profile_id)}</p>
                <p className="text-xs text-muted">
                  {s.status === 'pending' ? t('sharing.waitingForThem') : t(`sharing.access.${s.access}`)}
                  {s.alerts ? ` · ${t('sharing.withAlerts')}` : ''}
                  {s.expires_at ? ` · ${t('sharing.until', { date: formatDate(s.expires_at.slice(0, 10), lang) })}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.status === 'active' && (
                    <>
                      <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => updateShare(s.id, s.access === 'view' ? 'help' : 'view', s.alerts), t('sharing.done.updated'))}>
                        {s.access === 'view' ? t('sharing.allowHelp') : t('sharing.viewOnly')}
                      </button>
                      <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => updateShare(s.id, s.access, !s.alerts), t('sharing.done.updated'))}>
                        {s.alerts ? t('sharing.alertsOff') : t('sharing.alertsOn')}
                      </button>
                    </>
                  )}
                  <button type="button" disabled={busy} className={`${button} border border-status-urgent text-status-urgent`} onClick={() => void run(() => revokeShare(s.id), t('sharing.done.stopped'))}>
                    {s.status === 'pending' ? t('sharing.cancel') : t('sharing.stop')}
                  </button>
                </div>
              </li>
            ))}
            {transfersSent.map((s) => (
              <li key={s.id} className="py-3">
                <p className="text-sm">{t('sharing.handOverPending', { name: s.profile_name, email: s.grantee_email })}</p>
                <button type="button" disabled={busy} className={`${secondary} mt-2`} onClick={() => void run(() => revokeShare(s.id), t('sharing.done.stopped'))}>{t('sharing.cancel')}</button>
              </li>
            ))}
          </ul>
        )}
        {[...new Set(given.filter((s) => s.status === 'active').map((s) => s.profile_id!))].map((pid) => (
          <div key={pid} className="mt-3 border-t border-line pt-3">
            {activity[pid] ? (
              activity[pid].length === 0 ? <p className="text-xs text-muted">{t('sharing.noActivity')}</p> : (
                <ul className="flex flex-col gap-1 text-xs text-muted">
                  {activity[pid].slice(0, 20).map((a, i) => (
                    <li key={i}><span dir="ltr">{a.who}</span> · {t(`sharing.activity.${a.action}`)}{a.what ? ` · ${t(`sharing.tables.${a.what}`, a.what)}` : ''} · {formatDate(a.at.slice(0, 10), lang)}</li>
                  ))}
                </ul>
              )
            ) : (
              <button type="button" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-brand-700" onClick={async () => setActivity({ ...activity, [pid]: await loadActivity(pid) })}>
                <History className="size-4" aria-hidden /> {isSelf(pid) ? t('sharing.showActivityMine') : t('sharing.showActivity', { name: nameOf(pid) })}
              </button>
            )}
          </div>
        ))}
      </Card>

      {(received.length > 0 || sent.length > 0) && (
        <Card title={t('sharing.receivedTitle')} icon={UserRound}>
          <ul className="flex flex-col divide-y divide-line">
            {received.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
                <span className="text-sm"><span className="font-medium">{who(s.owner_name, s.owner_email)}</span><span className="block text-xs text-muted">{t(`sharing.access.${s.access}`)}</span></span>
                <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => revokeShare(s.id), t('sharing.done.left'))}>{t('sharing.leave')}</button>
              </li>
            ))}
            {sent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-sm">{t('sharing.askPending')} <span dir="ltr" className="font-medium">{s.owner_email}</span></span>
                <button type="button" disabled={busy} className={secondary} onClick={() => void run(() => revokeShare(s.id), t('sharing.done.stopped'))}>{t('sharing.cancel')}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-2">
        {([['share', Share2], ['ask', Send], ...(kept.length ? [['handover', ArrowRightLeft]] : [])] as [typeof form, typeof Share2][]).map(([k, Icon]) => (
          <button key={k} type="button" aria-expanded={form === k} onClick={() => { setForm(form === k ? null : k); setMessage(null) }}
            className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 text-start font-medium ${form === k ? 'border-brand-700 bg-brand-50 text-brand-700' : 'border-line bg-surface'}`}>
            <Icon className="size-5 shrink-0 text-brand-700" aria-hidden /> {t(`sharing.actions.${k}`)}
          </button>
        ))}
      </div>

      {form === 'share' && (
        <Card title={t('sharing.actions.share')} icon={Share2}>
          <div className="flex flex-col gap-3">
            {mine.length > 1 && (
              <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.whichRecords')}
                <select className={fieldClass} value={share.profileId} onChange={(e) => setShare({ ...share, profileId: e.target.value })}>
                  {mine.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.theirEmail')}
              <input className={fieldClass} type="email" dir="ltr" inputMode="email" autoComplete="off" value={share.email} onChange={(e) => setShare({ ...share, email: e.target.value })} />
            </label>
            <AccessPicker value={share.access} onChange={(access) => setShare({ ...share, access })} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-5 accent-brand-700" checked={share.alerts} onChange={(e) => setShare({ ...share, alerts: e.target.checked })} />
              <span>{t('sharing.alertsLabel')}<span className="block text-xs text-muted">{t('sharing.alertsHint')}</span></span>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.howLong')}
              <select className={fieldClass} value={share.days} onChange={(e) => setShare({ ...share, days: Number(e.target.value) })}>
                <option value={0}>{t('sharing.untilStopped')}</option>
                <option value={30}>{t('sharing.forDays', { count: 30 })}</option>
                <option value={90}>{t('sharing.forDays', { count: 90 })}</option>
              </select>
            </label>
            <p className="text-xs text-muted">{t('sharing.inAppNote')}</p>
            <button type="button" disabled={busy || !share.email.trim() || !share.profileId} className={primary}
              onClick={() => void run(() => inviteToShare(share.profileId, share.email, share.access, share.alerts, share.days || null), t('sharing.done.invited'), () => setShare({ ...share, email: '' }))}>
              {t('sharing.sendInvite')}
            </button>
          </div>
        </Card>
      )}

      {form === 'ask' && (
        <Card title={t('sharing.actions.ask')} icon={Send}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t('sharing.askIntro')}</p>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.theirEmail')}
              <input className={fieldClass} type="email" dir="ltr" inputMode="email" autoComplete="off" value={ask} onChange={(e) => setAsk(e.target.value)} />
            </label>
            <p className="text-xs text-muted">{t('sharing.inAppNote')}</p>
            <button type="button" disabled={busy || !ask.trim()} className={primary} onClick={() => void run(() => requestAccess(ask), t('sharing.done.asked'), () => setAsk(''))}>{t('sharing.sendRequest')}</button>
          </div>
        </Card>
      )}

      {form === 'handover' && kept.length > 0 && (
        <Card title={t('sharing.actions.handover')} icon={HandHelping}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">{t('sharing.handOverIntro')}</p>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.whichRecords')}
              <select className={fieldClass} value={hand.profileId} onChange={(e) => setHand({ ...hand, profileId: e.target.value })}>
                {kept.map((p) => <option key={p.id} value={p.id}>{nameOf(p.id)}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.theirEmail')}
              <input className={fieldClass} type="email" dir="ltr" inputMode="email" autoComplete="off" value={hand.email} onChange={(e) => setHand({ ...hand, email: e.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">{t('sharing.keepLabel')}
              <select className={fieldClass} value={hand.keep} onChange={(e) => setHand({ ...hand, keep: e.target.value as ShareAccess | '' })}>
                <option value="view">{t('sharing.access.view')}</option>
                <option value="help">{t('sharing.access.help')}</option>
                <option value="">{t('sharing.keepNone')}</option>
              </select>
            </label>
            <p className="text-xs text-muted">{t('sharing.handOverNote')}</p>
            <button type="button" disabled={busy || !hand.email.trim() || !hand.profileId} className={primary}
              onClick={() => void run(() => handOver(hand.profileId, hand.email, hand.keep || null), t('sharing.done.handOverSent'), () => setHand({ ...hand, email: '' }))}>
              {t('sharing.sendHandOver')}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
