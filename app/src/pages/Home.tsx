import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { Camera, MessageCircleHeart, BellRing, TrendingUp, FileText, ChevronRight, Sparkles, Footprints, UserRound } from 'lucide-react'
import { loadProfileDetails, profileCompleteness } from '../lib/profile'
import { useAuth } from '../auth/AuthProvider'
import { setInsightStatus, syncInsights, type Insight } from '../lib/insights'
import { InsightCard } from '../components/InsightCard'
import { TodayCard } from '../components/TodayCard'
import { loadSuggestions } from '../lib/suggestions'
import { todayIn } from '../lib/medications'
import { Card, PageHeader } from '../components/ui'

const HOME_LIMIT = 3

export function HomePage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [toReview, setToReview] = useState(0)
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [suggested, setSuggested] = useState(0)
  const [completeness, setCompleteness] = useState<number | null>(null)

  useEffect(() => {
    if (!supabase || !profile) return
    void supabase
      .from('laboratory_reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .then(({ count }) => setToReview(count ?? 0))
    void syncInsights(profile.id).then(setInsights)
    void loadSuggestions(todayIn(profile.time_zone)).then((list) => setSuggested(list.length))
    void loadProfileDetails().then(({ profile: p, lists }) => p && setCompleteness(profileCompleteness(p, lists)))
  }, [profile])

  async function dismiss(id: string) {
    if (await setInsightStatus(id, 'dismissed')) setInsights((list) => list?.map((i) => (i.id === id ? { ...i, status: 'dismissed' } : i)) ?? null)
  }

  const visible = (insights ?? []).filter((i) => i.status !== 'dismissed')
  const attention = visible.filter((i) => i.kind === 'attention')
  const changes = visible.filter((i) => i.kind === 'change')
  const country = profile?.country ?? 'EG'
  const greeting = profile?.display_name ? t('home.greetingName', { name: profile.display_name }) : t('home.greeting')

  return (
    <>
      <PageHeader title={greeting} subtitle={t('home.subtitle')} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <Link to="/records/scan" className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-brand-700 px-4 font-medium text-white">
          <Camera className="size-5 shrink-0" aria-hidden /> {t('actions.scan')}
        </Link>
        <Link to="/advisor" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 font-medium">
          <MessageCircleHeart className="size-5 shrink-0 text-brand-700" aria-hidden /> {t('actions.ask')}
        </Link>
        <Link to="/lifestyle" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 font-medium sm:col-span-2">
          <Footprints className="size-5 shrink-0 text-brand-700" aria-hidden /> {t('lifestyle.homeLink')}
        </Link>
      </div>
      <div className="grid gap-4">
        {completeness != null && completeness < 1 && (
          <Link to="/profile" className="flex items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50 p-4">
            <UserRound className="size-6 shrink-0 text-brand-700" aria-hidden />
            <span className="flex-1">
              <span className="block font-semibold">{t('profile.completeTitle')}</span>
              <span className="block text-sm text-muted">{t('profile.completeBody')}</span>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.round(completeness * 100)}%` }} />
              </span>
            </span>
            <ChevronRight className="size-5 text-muted rtl:rotate-180" aria-hidden />
          </Link>
        )}
        <TodayCard timeZone={profile?.time_zone ?? 'Africa/Cairo'} />
        <Card title={t('home.attention')}>
          <div className="flex flex-col gap-3">
            {suggested > 0 && (
              <Link to="/reminders" className="flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
                <Sparkles className="size-4" aria-hidden /> {t('suggestions.homeLink', { count: suggested })}
              </Link>
            )}
            {toReview > 0 && (
              <Link to="/records" className="flex min-h-11 items-center gap-2 text-sm font-medium text-status-watch">
                <FileText className="size-4" aria-hidden /> {t('home.reviewsPending', { count: toReview })}
              </Link>
            )}
            {attention.slice(0, HOME_LIMIT).map((i) => <InsightCard key={i.id} insight={i} country={country} compact onDismiss={() => void dismiss(i.id)} />)}
            {toReview === 0 && suggested === 0 && attention.length === 0 && insights && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <BellRing className="size-4" aria-hidden /> {t('home.emptyAttention')}
              </p>
            )}
          </div>
        </Card>
        <Card title={t('home.changed')}>
          <div className="flex flex-col gap-3">
            {changes.slice(0, HOME_LIMIT).map((i) => <InsightCard key={i.id} insight={i} country={country} compact onDismiss={() => void dismiss(i.id)} />)}
            {changes.length === 0 && insights && (
              <p className="flex items-center gap-2 text-sm text-muted">
                <TrendingUp className="size-4 shrink-0" aria-hidden /> {t('home.emptyChanged')}
              </p>
            )}
          </div>
        </Card>
        {visible.length > 0 && (
          <Link to="/insights" className="flex min-h-11 items-center justify-between rounded-2xl border border-line bg-surface px-4 text-sm font-medium text-brand-700">
            {t('home.allInsights', { count: visible.length })} <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
          </Link>
        )}
      </div>
    </>
  )
}
