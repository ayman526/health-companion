import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, UserRoundPen, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadProfileDetails, profileCompleteness } from '../lib/profile'
import { todayIn } from '../lib/medications'
import { askPregnancy } from '../domain/profileOptions'
import { track } from '../lib/usage'

// Profile questions that used to be part of sign-up, asked where they matter:
//  home      - "Complete your profile (40%)" (health background, allergies, goals…)
//  pregnancy - with lab results, for women of an age where ranges can differ
//  family    - with suggested checkups
//  doctor    - on the visit summary
export type ProfileTopic = 'home' | 'pregnancy' | 'family' | 'doctor'

const SNOOZE_DAYS = 14
const key = (topic: ProfileTopic, profileId: string) => `hc.profileAsk.${topic}.${profileId}`
function snoozed(topic: ProfileTopic, profileId: string) {
  try {
    const at = Number(localStorage.getItem(key(topic, profileId)))
    return !!at && Date.now() - at < SNOOZE_DAYS * 86_400_000
  } catch {
    return false
  }
}

export function ProfileAsk({ topic, className = '' }: { topic: ProfileTopic; className?: string }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [pct, setPct] = useState<number | null>(null)

  useEffect(() => {
    if (!profile || snoozed(topic, profile.id)) return
    let alive = true
    void loadProfileDetails().then(({ profile: p, lists }) => {
      if (!alive || !p) return
      const today = todayIn(p.time_zone)
      const missing =
        topic === 'home' ? profileCompleteness(p, lists) < 1
        : topic === 'pregnancy' ? !p.pregnancy_status && askPregnancy(p.sex, p.date_of_birth, today)
        : topic === 'family' ? lists.family.length === 0
        : !p.physician_name
      if (!missing) return
      setPct(Math.round(profileCompleteness(p, lists) * 100))
      if (topic === 'home') track('profile_nudge_shown')
    })
    return () => {
      alive = false
    }
  }, [profile, topic])

  if (pct == null || !profile) return null

  const dismiss = () => {
    try {
      localStorage.setItem(key(topic, profile.id), String(Date.now()))
    } catch {
      // private mode: it shows again next time
    }
    if (topic === 'home') track('profile_nudge_dismissed')
    setPct(null)
  }
  const anchor = topic === 'home' ? 'health' : topic

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 ${className}`}>
      <Link to={`/profile#${anchor}`} onClick={() => topic === 'home' && track('profile_nudge_opened')} className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><UserRoundPen className="size-5" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t(`profileAsk.${topic}.title`, { pct })}</span>
          <span className="block text-xs text-muted">{t(`profileAsk.${topic}.body`)}</span>
          {topic === 'home' && (
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
      </Link>
      <button type="button" aria-label={t('profileAsk.notNow')} onClick={dismiss} className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-full text-muted">
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
}
