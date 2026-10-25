import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, HeartPulse } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadVitals } from '../lib/daily'
import { loadProfileDetails } from '../lib/profile'
import { formatDate } from '../lib/format'
import { ageOn } from '../domain/profileOptions'
import { assessReading, type PersonFacts, type VitalKind, type VitalReading } from '../domain/vitals'
import { LEVEL_STYLE, ReadingValue } from './ReadingValue'

/** The most recent blood pressure, blood sugar and weight, each with its category. */
export function LatestReadingsCard() {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const [latest, setLatest] = useState<VitalReading[] | null>(null)
  const [person, setPerson] = useState<PersonFacts>({ age: null, heightCm: null, hasDiabetes: false })

  useEffect(() => {
    void loadVitals(60).then((all) => {
      const firsts = new Map<VitalKind, VitalReading>()
      for (const r of all) if (!firsts.has(r.kind)) firsts.set(r.kind, r)
      setLatest([...firsts.values()])
    })
    void loadProfileDetails().then(({ profile: p, lists }) => setPerson({
      age: ageOn(p?.date_of_birth ?? null, new Date().toISOString().slice(0, 10)),
      heightCm: p?.height_cm ?? null,
      hasDiabetes: lists.conditions.some((c) => /diabet|سكري/i.test(c) && !/pre/i.test(c)),
    }))
  }, [profile?.id])

  if (!latest || latest.length === 0) return null
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 font-semibold"><HeartPulse className="size-5 text-brand-700" aria-hidden /> {t('vitals.latestTitle')}</h2>
      <ul className="divide-y divide-line">
        {latest.map((r) => {
          const a = assessReading(r, person)
          return (
            <li key={r.id}>
              <Link to={`/vitals?kind=${r.kind}`} className="flex min-h-14 items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-muted">{t(`vitals.kinds.${r.kind}`)} · {formatDate(r.measured_at, i18n.language, profile?.time_zone)}</span>
                  <span className="block font-semibold"><ReadingValue r={r} unit="mg" /></span>
                </span>
                {a && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[a.level]}`}>{t(`vitals.categories.${a.category}`)}</span>}
                <ChevronRight className="size-4 shrink-0 text-muted rtl:rotate-180" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
