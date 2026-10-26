import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, HeartHandshake, LineChart, LockKeyhole, MessageCircle, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { joinInterest, joinedPlans, price, type InterestSource } from '../lib/familyCare'
import { track } from '../lib/usage'

const BENEFITS = [['alerts', BellRing], ['whatsapp', MessageCircle], ['summary', LineChart], ['people', Users]] as const
const SOURCES: InterestSource[] = ['second_person', 'scans', 'missed_dose', 'visit', 'settings']

/**
 * Family Care (interest test): what the plan offers and its prices. "Join
 * early access" only adds the account to the list; nobody is charged.
 */
export function FamilyCarePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { session, self } = useAuth()
  const [params] = useSearchParams()
  const from = params.get('from') as InterestSource | null
  const source: InterestSource = from && SOURCES.includes(from) ? from : 'page'
  const country = self?.country ?? 'EG'
  const [plan, setPlan] = useState<'family_annual' | 'family_monthly'>('family_annual')
  const [joined, setJoined] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    track('family_care_viewed')
    void joinedPlans().then((p) => setJoined(p.some((x) => x !== 'scan_pack')))
  }, [])

  async function join() {
    if (!session) return
    setBusy(true)
    setError(false)
    const ok = await joinInterest(session.user.id, plan, source, country)
    setBusy(false)
    if (ok) setJoined(true)
    else setError(true)
  }

  if (joined) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-2 py-10 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><Check className="size-7" aria-hidden /></span>
        <h1 className="text-xl font-semibold">{t('familyCare.thanksTitle')}</h1>
        <p className="text-sm text-muted">{t('familyCare.thanksBody')}</p>
        <Link to="/family" className="mt-2 inline-flex min-h-12 items-center rounded-xl bg-brand-700 px-5 font-medium text-white">{t('familyCare.thanksCta')}</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 pb-10">
      <header className="pt-4 text-center">
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-brand-50 text-brand-700"><HeartHandshake className="size-7" aria-hidden /></span>
        <h1 className="text-2xl font-semibold tracking-tight">{t('familyCare.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('familyCare.subtitle')}</p>
      </header>

      <ul className="flex flex-col gap-4">
        {BENEFITS.map(([k, Icon]) => (
          <li key={k} className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" aria-hidden /></span>
            <span><span className="block font-medium">{t(`familyCare.benefits.${k}.title`)}</span><span className="block text-sm text-muted">{t(`familyCare.benefits.${k}.body`)}</span></span>
          </li>
        ))}
      </ul>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="sr-only">{t('familyCare.choosePlan')}</legend>
        {(['family_annual', 'family_monthly'] as const).map((p) => {
          const annual = p === 'family_annual'
          const on = plan === p
          return (
            <label key={p} className={`relative flex cursor-pointer flex-col gap-0.5 rounded-2xl border p-4 ${on ? 'border-2 border-brand-700 bg-brand-50' : 'border-line bg-surface'}`}>
              <input type="radio" name="plan" className="sr-only" checked={on} onChange={() => setPlan(p)} />
              {annual && <span className="absolute -top-3 start-3 rounded-full bg-brand-700 px-2 py-0.5 text-xs font-medium text-white">{t('familyCare.save')}</span>}
              <span className="text-xs text-muted">{t(annual ? 'familyCare.annual' : 'familyCare.monthly')}</span>
              <span dir="auto" className="text-lg font-semibold">{price(country, lang, annual ? 'annual' : 'monthly')}</span>
              <span className="text-xs text-muted">{annual ? t('familyCare.perMonth', { price: price(country, lang, 'annualPerMonth') }) : t('familyCare.cancelAnytime')}</span>
            </label>
          )
        })}
      </fieldset>

      {error && <p role="alert" className="text-sm text-status-urgent">{t('sharing.errors.failed')}</p>}
      <button type="button" disabled={busy || joined === null} onClick={() => void join()} className="min-h-14 rounded-xl bg-brand-700 font-semibold text-white disabled:opacity-60">
        {t('familyCare.join')}
      </button>
      <p className="-mt-2 text-center text-xs text-muted">{t('familyCare.noCharge')}</p>
      <p className="flex items-start justify-center gap-1.5 text-center text-xs text-muted"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('familyCare.alwaysFree')}</p>
    </div>
  )
}
