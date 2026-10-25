import { useTranslation } from 'react-i18next'
import { formatNumber } from '../lib/format'
import { mgToMmol, type Level, type VitalReading } from '../domain/vitals'

export const LEVEL_STYLE: Record<Level, string> = {
  ok: 'bg-status-ok-bg text-status-ok',
  watch: 'bg-status-watch-bg text-status-watch',
  follow_up: 'bg-status-watch-bg text-status-watch',
  urgent: 'bg-status-urgent-bg text-status-urgent',
}

export function ReadingValue({ r, unit }: { r: VitalReading; unit: 'mg' | 'mmol' }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  if (r.kind === 'blood_pressure') {
    return <span className="ltr-value sensitive">{r.systolic}/{r.diastolic} <span className="text-sm font-normal text-muted">mmHg</span>{r.pulse ? <span className="text-sm font-normal text-muted"> · {r.pulse} {t('vitals.bpm')}</span> : null}</span>
  }
  if (r.kind === 'glucose') {
    const v = unit === 'mmol' ? `${formatNumber(mgToMmol(r.glucose_mg_dl!), lang, 1)} mmol/L` : `${formatNumber(r.glucose_mg_dl!, lang, 0)} mg/dL`
    return <span className="ltr-value sensitive">{v}</span>
  }
  return <span className="ltr-value sensitive">{formatNumber(r.weight_kg!, lang, 1)} kg</span>
}
