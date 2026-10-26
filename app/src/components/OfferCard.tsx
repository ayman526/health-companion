import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, HeartHandshake, X } from 'lucide-react'
import { dismissOffer, offerHidden, type OfferMoment } from '../lib/familyCare'
import { track } from '../lib/usage'

/**
 * A small, dismissible Family Care card shown at a moment of need (never a
 * pop-up). Hidden for 30 days after "x", and for good once someone joins.
 */
export function OfferCard({ moment, extra, className = '' }: { moment: OfferMoment; extra?: ReactNode; className?: string }) {
  const { t } = useTranslation()
  const [hidden, setHidden] = useState(() => offerHidden(moment))

  useEffect(() => {
    if (!hidden) track(`offer_shown_${moment}`)
  }, [hidden, moment])

  if (hidden) return null
  return (
    <section className={`rounded-2xl bg-brand-50 p-4 text-brand-700 ${className}`}>
      <div className="flex items-start gap-3">
        <HeartHandshake className="mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t(`familyCare.offers.${moment}.title`)}</p>
          <p className="mt-0.5 text-sm">{t(`familyCare.offers.${moment}.body`)}</p>
        </div>
        <button type="button" aria-label={t('familyCare.notNow')} onClick={() => { dismissOffer(moment); setHidden(true) }} className="grid min-h-10 min-w-10 shrink-0 place-items-center rounded-full">
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {extra}
        <Link to={`/family-care?from=${moment}`} onClick={() => track(`offer_opened_${moment}`)} className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">
          {t(`familyCare.offers.${moment}.cta`)} <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      </div>
    </section>
  )
}
