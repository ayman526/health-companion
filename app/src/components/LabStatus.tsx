import { useTranslation } from 'react-i18next'
import type { MeasurementStatus } from '../domain/labs/rules'
import type { Trend } from '../domain/labs/compare'

// Calm by design: amber for high/low, red only for urgent (SPEC §5).
const STATUS_STYLE: Record<MeasurementStatus, string> = {
  within_range: 'bg-status-ok-bg text-status-ok',
  high: 'bg-status-watch-bg text-status-watch',
  low: 'bg-status-watch-bg text-status-watch',
  urgent: 'bg-status-urgent-bg text-status-urgent',
  no_range: 'bg-canvas text-muted',
}

export function StatusBadge({ status }: { status: MeasurementStatus }) {
  const { t } = useTranslation()
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>{t(`labs.status.${status}`)}</span>
}

const TREND_STYLE: Record<Trend, string> = {
  improving: 'text-status-ok',
  worsening: 'text-status-watch',
  stable: 'text-muted',
  changed_within_range: 'text-muted',
  changed: 'text-muted',
  not_comparable: 'text-muted',
}

export function TrendLabel({ trend }: { trend: Trend }) {
  const { t } = useTranslation()
  return <span className={`font-medium ${TREND_STYLE[trend]}`}>{t(`labs.trend.${trend}`)}</span>
}
