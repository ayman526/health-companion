import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Camera, ChevronDown, ChevronRight, ClipboardList, FileText, MessageCircleHeart, Plus, Sparkles, TrendingUp, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadProfileDetails, profileCompleteness } from '../lib/profile'
import { useAuth } from '../auth/AuthProvider'
import { renderInsight, syncInsights, type Insight } from '../lib/insights'
import { loadSuggestions } from '../lib/suggestions'
import { formatDate } from '../lib/format'
import { todayIn } from '../lib/medications'
import { YourDayCard } from '../components/home/YourDayCard'
import { WeekTiles } from '../components/home/WeekTiles'
import { InstallPrompt } from '../components/InstallPrompt'
import { VoiceLog } from '../components/VoiceLog'
import { ContextCard } from '../components/ContextCard'
import { loadUserTopics } from '../lib/userTopics'

/**
 * Home, most important first: anything needing attention (only when there is
 * something), today's checklist, quick actions, this week at a glance.
 * Explanations live on the detail screens, not here.
 */
export function HomePage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const [toReview, setToReview] = useState(0)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [suggested, setSuggested] = useState(0)
  const [completeness, setCompleteness] = useState<number | null>(null)
  const [topics, setTopics] = useState<Map<string, number> | null>(null)
  const bannerKey = `hc.profileBanner.${profile?.id ?? ''}`
  const [bannerHidden, setBannerHidden] = useState(() => { try { return localStorage.getItem(bannerKey) === '1' } catch { return false } })

  useEffect(() => {
    if (!supabase || !profile) return
    void supabase.from('laboratory_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft')
      .then(({ count }) => setToReview(count ?? 0))
    void syncInsights(profile.id).then(setInsights)
    void loadSuggestions(todayIn(profile.time_zone)).then((list) => setSuggested(list.length))
    void loadProfileDetails().then(({ profile: p, lists }) => p && setCompleteness(profileCompleteness(p, lists)))
    void loadUserTopics(todayIn(profile.time_zone)).then(setTopics)
  }, [profile])

  if (!profile) return null
  const country = profile.country
  const visible = (insights ?? []).filter((i) => i.status !== 'dismissed')
  const attention = visible.filter((i) => i.kind === 'attention')
  const changes = visible.filter((i) => i.kind === 'change')
  const forFamily = profile.relationship !== 'self'
  const personName = profile.display_name || t(`family.relationships.${profile.relationship}`)
  const greeting = forFamily ? t('family.healthOf', { name: personName })
    : profile.display_name ? t('home.greetingName', { name: profile.display_name }) : t('home.greeting')
  const hasAttention = attention.length > 0 || toReview > 0 || suggested > 0

  const actions = [
    { to: '/vitals', icon: Plus, label: t('home.actions.log'), primary: true },
    { to: '/records/scan', icon: Camera, label: t('home.actions.scan') },
    { to: '/advisor', icon: MessageCircleHeart, label: t('home.actions.ask') },
    { to: '/visits', icon: ClipboardList, label: t('home.actions.visit') },
  ]

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">{new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
        </div>
        <Link to="/family" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium">
          <UserRound className="size-4 text-brand-700" aria-hidden />
          <span className="max-w-24 truncate">{forFamily ? personName : t('family.you')}</span>
          <ChevronDown className="size-3.5 text-muted" aria-hidden />
        </Link>
      </header>

      {hasAttention && (
        <section className="rounded-2xl border border-status-watch/30 bg-status-watch-bg p-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-status-watch"><AlertTriangle className="size-4" aria-hidden /> {t('home.attention')}</h2>
          <ul className="flex flex-col">
            {attention.slice(0, 3).map((i) => (
              <li key={i.id}>
                <Link to={`/records/tests/${encodeURIComponent(i.testKey)}`} className={`flex min-h-11 items-center gap-2 text-sm ${i.level === 'urgent' ? 'font-semibold text-status-urgent' : ''}`}>
                  <span className="sensitive flex-1">{renderInsight(i, lang, country).title}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
                </Link>
              </li>
            ))}
            {toReview > 0 && (
              <li><Link to="/records" className="flex min-h-11 items-center gap-2 text-sm"><FileText className="size-4 shrink-0 text-status-watch" aria-hidden /><span className="flex-1">{t('home.reviewsPending', { count: toReview })}</span><ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden /></Link></li>
            )}
            {suggested > 0 && (
              <li><Link to="/reminders" className="flex min-h-11 items-center gap-2 text-sm"><Sparkles className="size-4 shrink-0 text-status-watch" aria-hidden /><span className="flex-1">{t('suggestions.homeLink', { count: suggested })}</span><ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden /></Link></li>
            )}
          </ul>
        </section>
      )}

      <InstallPrompt />

      <YourDayCard timeZone={profile.time_zone} />

      <nav aria-label={t('home.quickActions')} className="grid grid-cols-4 gap-2">
        {actions.map(({ to, icon: Icon, label, primary }) => (
          <Link key={to} to={to} className="flex flex-col items-center gap-1.5 text-center text-xs font-medium">
            <span className={`grid size-14 place-items-center rounded-2xl ${primary ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700'}`}><Icon className="size-6" aria-hidden /></span>
            {label}
          </Link>
        ))}
      </nav>

      <VoiceLog />

      <WeekTiles profileId={profile.id} />

      {topics && <ContextCard topics={topics} allowGeneral heading={t('library.forYou')} />}

      {changes.length > 0 && (
        <Link to="/insights" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 text-sm">
          <TrendingUp className="size-4 shrink-0 text-brand-700" aria-hidden />
          <span className="flex-1">{t('home.changesLine', { count: changes.length, date: formatDate(changes[0].date ?? new Date(), lang) })}</span>
          <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
        </Link>
      )}

      {completeness != null && completeness < 1 && !bannerHidden && (
        <div className="flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2 text-sm">
          <Link to="/profile" className="flex min-h-10 flex-1 items-center gap-2 font-medium text-brand-700">
            <UserRound className="size-4 shrink-0" aria-hidden /> {t('home.completeProfile', { percent: Math.round(completeness * 100) })}
          </Link>
          <button type="button" aria-label={t('home.hide')} onClick={() => { setBannerHidden(true); try { localStorage.setItem(bannerKey, '1') } catch { /* optional */ } }}
            className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted"><X className="size-4" aria-hidden /></button>
        </div>
      )}
    </div>
  )
}
