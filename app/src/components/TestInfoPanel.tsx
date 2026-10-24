import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookOpen, ExternalLink } from 'lucide-react'
import type { LabTest } from '../domain/labs/catalog'
import type { MeasurementStatus } from '../domain/labs/rules'
import { loadTestInfo, medlinePlusUrl, type TestInfo } from '../content/testInfo'

/**
 * "What this means": general education for a test, focused on the user's own
 * result (high / low / within range). Not personal advice; never changes a dose.
 */
export function TestInfoPanel({ test, status, positive }: { test: LabTest; status: MeasurementStatus | null; positive?: boolean }) {
  const { t, i18n } = useTranslation()
  const [info, setInfo] = useState<TestInfo | undefined>()
  useEffect(() => {
    let current = true
    void loadTestInfo(i18n.language).then((table) => current && setInfo(table[test.code]))
    return () => { current = false }
  }, [test.code, i18n.language])
  if (!info) return null

  const isHigh = status === 'high' || (status === 'urgent' && !!info.high)
  const isLow = status === 'low'
  const meaning = test.qualitative ? (positive ? info.positive : undefined) : isHigh ? info.high : isLow ? info.low : undefined
  const outOfRange = !!meaning
  const name = test.name[i18n.language === 'ar' ? 'ar' : 'en']

  return (
    <details className="group mt-3 rounded-xl bg-canvas" open={outOfRange}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-brand-700">
        <BookOpen className="size-4" aria-hidden /> {t('info.title')}
      </summary>
      <div className="space-y-3 px-3 pb-3 text-sm">
        <section>
          <h4 className="font-medium">{t('info.about', { test: name })}</h4>
          <p className="text-muted">{info.about}</p>
        </section>
        {meaning && (
          <section>
            <h4 className="font-medium">{test.qualitative ? t('info.positive') : isHigh ? t('info.high') : t('info.low')}</h4>
            <p className="text-muted">{meaning}</p>
          </section>
        )}
        {!meaning && status === 'within_range' && <p className="text-muted">{t('info.within')}</p>}
        {info.helps && (
          <section>
            <h4 className="font-medium">{t('info.helps')}</h4>
            <p className="text-muted">{info.helps}</p>
          </section>
        )}
        {outOfRange && <p className="text-muted">{t('info.medicines')}</p>}
        {test.loinc[0] && (
          <a href={medlinePlusUrl(test.loinc[0])} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 font-medium text-brand-700">
            <ExternalLink className="size-4" aria-hidden /> {t('info.learnMore')}
          </a>
        )}
        <p className="text-xs text-muted">{t('info.disclaimer')}</p>
      </div>
    </details>
  )
}
