import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Baby, CalendarClock, ChevronRight, FileText, Heart, Luggage, Phone, Pill, ScanHeart, TestTube, type LucideIcon } from 'lucide-react'
import { useAuth, type HealthProfile } from '../../auth/AuthProvider'
import { loadProfileDetails, saveProfileFields } from '../../lib/profile'
import { formatMonth } from '../../lib/format'
import { TIP_ICONS, pregnancyProgress, type TipIcon } from '../../domain/pregnancy'

const ICONS: Record<TipIcon, LucideIcon> = {
  pill: Pill, test: TestTube, scan: ScanHeart, file: FileText, heart: Heart, calendar: CalendarClock, baby: Baby, bag: Luggage, phone: Phone,
}
const TINTS = ['bg-plum-50 text-plum-700', 'bg-sun-50 text-sun-700', 'bg-brand-50 text-brand-700']

const SNOOZE_DAYS = 7
const snoozeKey = (profileId: string) => `hc.babyArrived.${profileId}`
function snoozed(profileId: string) {
  try {
    const at = Number(localStorage.getItem(snoozeKey(profileId)))
    return !!at && Date.now() - at < SNOOZE_DAYS * 86_400_000
  } catch {
    return false
  }
}

function Tip({ icon, tint, title, body }: { icon: LucideIcon; tint: string; title: string; body: string }) {
  const Icon = icon
  return (
    <li className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tint}`}><Icon className="size-5" aria-hidden /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted">{body}</p>
      </div>
    </li>
  )
}

/** While pregnant: about which week, and two tips for this month. General guideline facts only. */
export function PregnancyCard({ today }: { today: string }) {
  const { profile } = useAuth()
  const [state, setState] = useState<{ status: string | null; due: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    void loadProfileDetails().then(({ profile: p }) => alive && setState({ status: p?.pregnancy_status ?? null, due: p?.due_month ?? null }))
    return () => {
      alive = false
    }
  }, [profile?.id])

  if (!profile || state?.status !== 'pregnant') return null
  return <PregnancyCardView key={profile.id} profile={profile} due={state.due} today={today} />
}

/** The card itself, for someone who is pregnant (split out so it can be shown without loading). */
export function PregnancyCardView({ profile, due: dueMonth, today }: { profile: HealthProfile; due: string | null; today: string }) {
  const { t, i18n } = useTranslation()
  const [arrived, setArrived] = useState(false)
  const [, setTick] = useState(0)

  if (arrived) return <p role="status" className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-700">{t('pregnancy.card.arrivedDone')}</p>

  const forFamily = profile.relationship !== 'self'
  const name = profile.display_name || t(`family.relationships.${profile.relationship}`)
  const canEdit = profile.access !== 'view'

  if (!dueMonth) {
    if (!canEdit) return null
    return (
      <Link to="/profile#pregnancy" className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-brand-700"><Baby className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-brand-700">{t('pregnancy.card.addDueTitle')}</span>
          <span className="block text-sm text-muted">{t('pregnancy.card.addDueBody')}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-brand-700 rtl:rotate-180" aria-hidden />
      </Link>
    )
  }

  const p = pregnancyProgress(dueMonth, today)
  const due = formatMonth(dueMonth, i18n.language)

  if (p.pastDue && canEdit && !snoozed(profile.id)) {
    const babyHere = async () => {
      if (await saveProfileFields(profile.id, { pregnancy_status: null, due_month: null })) setArrived(true)
    }
    const notYet = () => {
      try {
        localStorage.setItem(snoozeKey(profile.id), String(Date.now()))
      } catch {
        // private mode: it asks again next time
      }
      setTick((n) => n + 1)
    }
    return (
      <section className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <h2 className="font-semibold text-brand-700">{t('pregnancy.card.arrivedTitle')}</h2>
        <p className="mt-1 text-sm text-muted">{t('pregnancy.card.arrivedBody')}</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => void babyHere()} className="min-h-11 flex-1 rounded-xl bg-brand-700 px-3 text-sm font-medium text-white">{t('pregnancy.card.arrivedYes')}</button>
          <button type="button" onClick={notYet} className="min-h-11 rounded-xl border border-line bg-surface px-4 text-sm font-medium">{t('pregnancy.card.arrivedNotYet')}</button>
        </div>
      </section>
    )
  }

  const tips = TIP_ICONS[p.month]
  const circumference = 2 * Math.PI * 22
  return (
    <section className="flex flex-col gap-2">
      <Link to="/profile#pregnancy" className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
        <span className="relative grid size-14 shrink-0 place-items-center rounded-full bg-surface">
          <svg viewBox="0 0 52 52" className="absolute inset-0 size-14 -rotate-90" aria-hidden>
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-brand-100)" strokeWidth="5" />
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--color-brand-700)" strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(p.week, 40) / 40)} />
          </svg>
          <span className="sensitive ltr-value relative text-sm font-bold text-brand-700">{p.week}</span>
        </span>
        <span className="sensitive min-w-0 flex-1">
          <span className="block font-semibold text-brand-700">{forFamily ? t('pregnancy.card.titleFor', { month: p.month, name }) : t('pregnancy.card.title', { month: p.month })}</span>
          <span className="block text-sm text-muted">{p.week >= 40 ? t('pregnancy.card.anyDay', { due }) : t('pregnancy.card.sub', { week: p.week, due })}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-brand-700 rtl:rotate-180" aria-hidden />
      </Link>
      <h3 className="px-1 text-xs text-muted">{t('pregnancy.card.forThisMonth')}</h3>
      <ul className="sensitive flex flex-col gap-2">
        {(['a', 'b'] as const).map((k, i) => (
          <Tip key={k} icon={ICONS[tips[i]]} tint={TINTS[i]} title={t(`pregnancy.tips.m${p.month}.${k}.title`)} body={t(`pregnancy.tips.m${p.month}.${k}.body`)} />
        ))}
        <Tip icon={TestTube} tint={TINTS[2]} title={t('pregnancy.labs.title')} body={t('pregnancy.labs.body')} />
      </ul>
    </section>
  )
}
