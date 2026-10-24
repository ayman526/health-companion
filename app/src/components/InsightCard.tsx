import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertOctagon, Info, Stethoscope, TrendingDown, TrendingUp } from 'lucide-react'
import { LEVEL_LABEL_KEY, renderInsight, type Insight } from '../lib/insights'
import { EvidenceChips } from './TrustChips'

// Calm hierarchy: only urgent uses red; follow-ups amber; information neutral (SPEC §7).
const LEVEL_STYLE = {
  urgent: 'border-status-urgent bg-status-urgent-bg',
  follow_up: 'border-line bg-surface',
  informational: 'border-line bg-surface',
} as const

export function InsightCard({ insight, country, onDismiss, onRestore, compact }: {
  insight: Insight
  country: string
  onDismiss?: () => void
  onRestore?: () => void
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const text = renderInsight(insight, i18n.language, country)
  const Icon = insight.level === 'urgent' ? AlertOctagon
    : insight.ruleId === 'trend_improving' ? TrendingDown
    : insight.ruleId === 'trend_worsening' ? TrendingUp
    : insight.level === 'follow_up' ? Stethoscope : Info
  const iconColor = insight.level === 'urgent' ? 'text-status-urgent' : insight.level === 'follow_up' ? 'text-status-watch' : 'text-brand-700'

  return (
    <article className={`rounded-2xl border p-4 ${LEVEL_STYLE[insight.level]}`}>
      <div className="flex gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${iconColor}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium ${iconColor}`}>{t(LEVEL_LABEL_KEY[insight.level])}</p>
          <h3 className="font-medium">{text.title}</h3>
          {!compact && <p className="mt-1 text-sm text-muted">{text.body}</p>}
          {!compact && text.action && <p className="mt-2 text-sm font-medium">{text.action}</p>}
          {!compact && <EvidenceChips sources={insight.sources} />}
          <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <Link to={`/records/tests/${encodeURIComponent(insight.testKey)}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700">
              {t('insights.viewHistory')}
            </Link>
            <Link to={`/records/reports/${insight.reportIds[insight.reportIds.length - 1]}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700">
              {t('insights.sourceReport')}
            </Link>
            {onDismiss && (
              <button type="button" onClick={onDismiss} className="ms-auto inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
                {t('insights.dismiss')}
              </button>
            )}
            {onRestore && (
              <button type="button" onClick={onRestore} className="ms-auto inline-flex min-h-11 items-center text-sm text-muted hover:text-ink">
                {t('insights.restore')}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
