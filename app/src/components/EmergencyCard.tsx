import { useTranslation } from 'react-i18next'
import { Phone, Siren } from 'lucide-react'
import { EMERGENCY_NUMBERS, type EmergencyKind } from '../domain/emergency'

/** Shown immediately when the pre-screen detects a possible emergency, before any AI answer. */
export function EmergencyCard({ kinds, country }: { kinds: string[]; country: string }) {
  const { t } = useTranslation()
  const numbers = EMERGENCY_NUMBERS[country] ?? EMERGENCY_NUMBERS.EG
  const crisis = kinds.includes('suicide' satisfies EmergencyKind)
  return (
    <aside role="alert" className="rounded-2xl border-2 border-status-urgent bg-status-urgent-bg p-4 text-status-urgent">
      <p className="flex items-center gap-2 font-semibold"><Siren className="size-5" aria-hidden /> {t('advisor.emergency.title')}</p>
      <p className="mt-1 text-sm">{crisis ? t('advisor.emergency.crisisBody') : t('advisor.emergency.body')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${numbers.general}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-status-urgent px-4 font-semibold text-white">
          <Phone className="size-4" aria-hidden /> {t('advisor.emergency.call', { number: numbers.general })}
        </a>
        {crisis && numbers.crisis && (
          <a href={`tel:${numbers.crisis}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-status-urgent px-4 font-semibold">
            <Phone className="size-4" aria-hidden /> {t('advisor.emergency.crisisCall', { number: numbers.crisis })}
          </a>
        )}
      </div>
    </aside>
  )
}
