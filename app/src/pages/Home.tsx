import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, FileText, Sparkles, TrendingUp, UserRound, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { renderInsight, syncInsights, type Insight } from '../lib/insights'
import { loadSuggestions } from '../lib/suggestions'
import { todayIn } from '../lib/medications'
import { YourDayCard } from '../components/home/YourDayCard'
import { WeekTiles } from '../components/home/WeekTiles'
import { AddButton } from '../components/home/AddButton'
import { InstallPrompt } from '../components/InstallPrompt'
import { PushPrompt } from '../components/PushPrompt'
import { ContextCard } from '../components/ContextCard'
import { Sheet } from '../components/Sheet'
import { loadUserTopics } from '../lib/userTopics'
import { ProfileAsk } from '../components/ProfileAsk'
import { loadShares, pendingForMe } from '../lib/sharing'

interface Notice { key: string; to: string; text: string; icon: typeof FileText; urgent?: boolean; info?: boolean }

/**
 * Home, kept short: one line for anything needing attention, today's
 * checklist (only what's left), two tiles for this week, one line "For you".
 * Everything you can add sits behind the "+" button.
 */
export function HomePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const [toReview, setToReview] = useState(0)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [suggested, setSuggested] = useState(0)
  const [topics, setTopics] = useState<Map<string, number> | null>(null)
  const [noticesOpen, setNoticesOpen] = useState(false)
  const [sharingWaiting, setSharingWaiting] = useState(0)

  useEffect(() => {
    if (!supabase || !profile) return
    void supabase.from('laboratory_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft')
      .then(({ count }) => setToReview(count ?? 0))
    void syncInsights(profile.id).then(setInsights)
    void loadSuggestions(todayIn(profile.time_zone)).then((list) => setSuggested(list.length))
    void loadUserTopics(todayIn(profile.time_zone)).then(setTopics)
    void loadShares().then((s) => setSharingWaiting(pendingForMe(s).length))
  }, [profile])

  if (!profile) return null
  const visible = (insights ?? []).filter((i) => i.status !== 'dismissed')
  const changes = visible.filter((i) => i.kind === 'change')
  const forFamily = profile.relationship !== 'self'
  const personName = profile.display_name || t(`family.relationships.${profile.relationship}`)
  const greeting = forFamily ? t('family.healthOf', { name: personName })
    : profile.display_name ? t('home.greetingName', { name: profile.display_name }) : t('home.greeting')

  // Everything that needs a look, most important first; Home shows the first in one line.
  const notices: Notice[] = [
    ...visible.filter((i) => i.kind === 'attention').map((i) => ({
      key: i.id, to: `/records/tests/${encodeURIComponent(i.testKey)}`, text: renderInsight(i, lang, profile.country).title, icon: TrendingUp, urgent: i.level === 'urgent',
    })),
    ...(sharingWaiting > 0 ? [{ key: 'sharing', to: '/sharing', text: t('sharing.homeLine', { count: sharingWaiting }), icon: Users }] : []),
    ...(toReview > 0 ? [{ key: 'review', to: '/records', text: t('home.reviewsPending', { count: toReview }), icon: FileText }] : []),
    ...(suggested > 0 ? [{ key: 'suggested', to: '/reminders', text: t('suggestions.homeLink', { count: suggested }), icon: Sparkles }] : []),
    ...(changes.length > 0 ? [{ key: 'changes', to: '/insights', text: t('home.changesLine', { count: changes.length }), icon: TrendingUp, info: true }] : []),
  ]
  const first = notices[0]
  const onlyInfo = notices.every((n) => n.info)

  return (
    <div className="flex flex-col gap-4 pb-24">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">{greeting}</h1>
        </div>
        <Link to="/family" aria-label={t('family.switchPerson')} className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
          {forFamily ? personName.slice(0, 1) : <UserRound className="size-5" aria-hidden />}
        </Link>
      </header>

      {first && (
        notices.length === 1 ? (
          <Link to={first.to} className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm ${onlyInfo ? 'bg-brand-50 text-brand-700' : 'bg-status-watch-bg text-status-watch'}`}>
            <span className={`size-2 shrink-0 rounded-full ${first.urgent ? 'bg-status-urgent' : 'bg-current'}`} aria-hidden />
            <span className="sensitive min-w-0 flex-1 truncate">{first.text}</span>
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={() => setNoticesOpen(true)} className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-start text-sm ${onlyInfo ? 'bg-brand-50 text-brand-700' : 'bg-status-watch-bg text-status-watch'}`}>
            <span className={`size-2 shrink-0 rounded-full ${first.urgent ? 'bg-status-urgent' : 'bg-current'}`} aria-hidden />
            <span className="sensitive min-w-0 flex-1 truncate">{first.text}</span>
            <span className="shrink-0 rounded-full bg-surface/60 px-2 text-xs font-medium">+{notices.length - 1}</span>
            <ChevronRight className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
          </button>
        )
      )}

      <PushPrompt />
      <InstallPrompt />

      <YourDayCard timeZone={profile.time_zone} />

      <WeekTiles profileId={profile.id} max={2} />

      {!forFamily && <ProfileAsk topic="home" />}

      {topics && <ContextCard topics={topics} allowGeneral heading={t('library.forYou')} teaser />}

      {profile.access !== 'view' && <AddButton />}

      <Sheet open={noticesOpen} onClose={() => setNoticesOpen(false)} title={t('home.attention')}>
        <ul className="flex flex-col">
          {notices.map((n) => (
            <li key={n.key}>
              <Link to={n.to} onClick={() => setNoticesOpen(false)} className={`flex min-h-12 items-center gap-3 border-b border-line text-sm last:border-0 ${n.urgent ? 'font-semibold text-status-urgent' : ''}`}>
                <n.icon className={`size-4 shrink-0 ${n.urgent ? '' : n.info ? 'text-brand-700' : 'text-status-watch'}`} aria-hidden />
                <span className="sensitive flex-1">{n.text}</span>
                <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}
