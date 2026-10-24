import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lightbulb } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { setInsightStatus, syncInsights, type Insight } from '../lib/insights'
import { InsightCard } from '../components/InsightCard'
import { EmptyState, PageHeader } from '../components/ui'

export function InsightsPage() {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<Insight[]>([])
  const [showDismissed, setShowDismissed] = useState(false)

  useEffect(() => {
    if (!profile) return
    void syncInsights(profile.id).then((list) => {
      setItems(list)
      setLoading(false)
    })
  }, [profile])

  async function setStatus(id: string, status: 'active' | 'dismissed') {
    if (await setInsightStatus(id, status)) setItems((list) => list.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  const visible = items.filter((i) => i.status !== 'dismissed')
  const dismissed = items.filter((i) => i.status === 'dismissed')
  const country = profile?.country ?? 'EG'

  return (
    <>
      <PageHeader title={t('insights.title')} subtitle={t('insights.subtitle')} />
      {visible.length === 0 ? (
        <EmptyState icon={Lightbulb} text={t('insights.empty')} />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((i) => <InsightCard key={i.id} insight={i} country={country} onDismiss={() => void setStatus(i.id, 'dismissed')} />)}
        </div>
      )}
      {dismissed.length > 0 && (
        <div className="mt-6">
          <button type="button" onClick={() => setShowDismissed((v) => !v)} className="min-h-11 text-sm font-medium text-brand-700">
            {showDismissed ? t('insights.hideDismissed') : t('insights.showDismissed', { count: dismissed.length })}
          </button>
          {showDismissed && (
            <div className="mt-3 flex flex-col gap-3 opacity-80">
              {dismissed.map((i) => <InsightCard key={i.id} insight={i} country={country} onRestore={() => void setStatus(i.id, 'active')} />)}
            </div>
          )}
        </div>
      )}
      <p className="mt-6 text-xs text-muted">{t('insights.disclaimer')}</p>
    </>
  )
}
