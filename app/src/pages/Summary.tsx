import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, Share2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadProfileDetails, type ProfileDetails } from '../lib/profile'
import { loadMedications, currentSchedule, type MedicationRow } from '../lib/medications'
import { loadHistories } from '../lib/labData'
import { loadCheckIns, loadVitals, type CheckIn } from '../lib/daily'
import { supabase } from '../lib/supabase'
import { formatDate, formatNumber } from '../lib/format'
import { ageOn } from '../domain/profileOptions'
import { measurementStatus } from '../domain/labs/rules'
import { average, bpAverage, type VitalReading } from '../domain/vitals'
import type { TestHistory } from '../domain/labs/history'
import { useScheduleText } from '../components/ScheduleSummary'
import { PageHeader } from '../components/ui'

interface Data {
  details: ProfileDetails | null
  conditions: string[]
  allergies: string[]
  family: string[]
  meds: MedicationRow[]
  histories: TestHistory[]
  vitals: VitalReading[]
  checkIns: CheckIn[]
  lifeChanges: { category: string; title: string; started_on: string }[]
}

/**
 * One page for a doctor's visit: who, current medicines, home readings,
 * results outside the lab's range, symptoms and the person's own questions.
 * Printed or saved as PDF from the browser; shared as text only when asked.
 */
export function SummaryPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const scheduleText = useScheduleText()
  const [data, setData] = useState<Data | null>(null)
  const qKey = `hc.questions.${profile?.id ?? ''}`
  const [questions, setQuestions] = useState(() => { try { return localStorage.getItem(qKey) ?? '' } catch { return '' } })
  const today = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    void Promise.all([
      loadProfileDetails(), loadMedications(), loadHistories(), loadVitals(30), loadCheckIns(30),
      supabase ? supabase.from('lifestyle_events').select('category, title, started_on').gte('started_on', new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10)).order('started_on', { ascending: false }) : Promise.resolve({ data: [] }),
    ]).then(([{ profile: details, lists }, meds, histories, vitals, checkIns, life]) => setData({
      details, ...lists, meds: meds.filter((m) => m.is_active), histories: [...histories.values()], vitals, checkIns,
      lifeChanges: (life.data ?? []) as Data['lifeChanges'],
    }))
  }, [profile?.id])

  const outOfRange = useMemo(() => (data?.histories ?? []).map((h) => {
    const latest = h.series.points[h.series.points.length - 1]
    return { h, latest, status: measurementStatus(h.test, latest) }
  }).filter((x) => x.status === 'high' || x.status === 'low' || x.status === 'urgent')
    .sort((a, b) => b.latest.collectedAt.localeCompare(a.latest.collectedAt)), [data])

  if (!data) return <p className="text-sm text-muted">{t('auth.loading')}</p>

  const d = data.details
  const age = ageOn(d?.date_of_birth ?? null, today)
  const bp = bpAverage(data.vitals, 30)
  const fasting = average(data.vitals.filter((r) => r.glucose_context === 'fasting'), (r) => r.glucose_mg_dl, 30)
  const weights = data.vitals.filter((r) => r.kind === 'weight')
  const symptomCounts = new Map<string, number>()
  for (const c of data.checkIns) for (const s of c.symptoms) symptomCounts.set(s, (symptomCounts.get(s) ?? 0) + 1)
  const symptoms = [...symptomCounts.entries()].sort((a, b) => b[1] - a[1])
  const testName = (h: TestHistory) => (h.byNameOnly ? h.test.name.en : h.test.name[lang === 'ar' ? 'ar' : 'en'])

  // Plain-text version for sharing (e.g. to WhatsApp), built from the same data.
  const lines: string[] = [
    `${t('summary.title')} · ${formatDate(today, lang)}`,
    `${d?.display_name ?? ''}${age != null ? ` · ${t('family.age', { age })}` : ''}${d?.sex ? ` · ${t(`profileFields.sexes.${d.sex}`)}` : ''}`,
    '',
    `${t('summary.conditions')}: ${data.conditions.join(', ') || t('summary.noneRecorded')}`,
    `${t('summary.allergies')}: ${data.allergies.join(', ') || t('summary.noneRecorded')}`,
    '',
    `${t('summary.medicines')}:`,
    ...data.meds.map((m) => { const s = currentSchedule(m); return `- ${m.brand_name}${m.strength ? ` ${m.strength}` : ''}${s ? `: ${scheduleText(s)}` : ''}` }),
  ]
  if (bp || fasting || weights.length) {
    lines.push('', `${t('summary.readings30')}:`)
    if (bp) lines.push(`- ${t('vitals.kinds.blood_pressure')}: ${bp.systolic}/${bp.diastolic} mmHg (${t('vitals.readingsCount', { count: bp.count })})`)
    if (fasting) lines.push(`- ${t('summary.fastingGlucose')}: ${fasting.value} mg/dL (${t('vitals.readingsCount', { count: fasting.count })})`)
    if (weights.length) lines.push(`- ${t('vitals.kinds.weight')}: ${weights[0].weight_kg} kg`)
  }
  if (outOfRange.length) {
    lines.push('', `${t('summary.outOfRange')}:`)
    for (const x of outOfRange) lines.push(`- ${testName(x.h)}: ${formatNumber(x.latest.value, lang)} ${x.latest.unit} (${formatDate(x.latest.collectedAt, lang)})`)
  }
  if (symptoms.length) lines.push('', `${t('summary.symptoms30')}: ${symptoms.map(([k, n]) => `${t(`checkin.symptoms.${k}`)} (${n})`).join(', ')}`)
  if (questions.trim()) lines.push('', `${t('summary.questions')}:`, questions.trim())
  lines.push('', t('summary.footer'))
  const text = lines.join('\n')

  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: t('summary.title'), text })
      else await navigator.clipboard.writeText(text)
    } catch {
      // Cancelled by the person; nothing to do.
    }
  }

  return (
    <>
      <div className="print:hidden">
        <PageHeader title={t('summary.title')} subtitle={t('summary.subtitle')} />
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-4 font-medium text-white">
            <Printer className="size-5" aria-hidden /> {t('summary.print')}
          </button>
          <button type="button" onClick={() => void share()} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-surface px-4 font-medium">
            <Share2 className="size-5" aria-hidden /> {t('summary.share')}
          </button>
        </div>
        <p className="mb-4 text-xs text-muted">{t('summary.shareNote')}</p>
      </div>

      <article className="rounded-2xl border border-line bg-surface p-5 text-sm print:border-0 print:p-0">
        <header className="mb-4 border-b border-line pb-3">
          <h1 className="text-lg font-semibold">{t('summary.title')}</h1>
          <p className="sensitive">{d?.display_name}{age != null ? ` · ${t('family.age', { age })}` : ''}{d?.sex ? ` · ${t(`profileFields.sexes.${d.sex}`)}` : ''}</p>
          <p className="text-xs text-muted">{t('summary.prepared', { date: formatDate(today, lang) })}{d?.physician_name ? ` · ${t('summary.forDoctor', { name: d.physician_name })}` : ''}</p>
        </header>

        <Section title={t('summary.conditions')}><p className="sensitive">{data.conditions.join(t('checkin.listSep')) || t('summary.noneRecorded')}</p></Section>
        <Section title={t('summary.allergies')}><p className="sensitive">{data.allergies.join(t('checkin.listSep')) || t('summary.noneRecorded')}</p></Section>

        <Section title={t('summary.medicines')}>
          {data.meds.length === 0 ? <p>{t('summary.noneRecorded')}</p> : (
            <ul className="list-disc ps-5">
              {data.meds.map((m) => { const s = currentSchedule(m); return <li key={m.id} className="sensitive">{m.brand_name}{m.strength && <span className="ltr-value"> {m.strength}</span>}{s && <span className="text-muted"> · {scheduleText(s)}</span>}</li> })}
            </ul>
          )}
        </Section>

        {(bp || fasting || weights.length > 0) && (
          <Section title={t('summary.readings30')}>
            <ul className="list-disc ps-5">
              {bp && <li>{t('vitals.kinds.blood_pressure')}: <span className="ltr-value sensitive">{bp.systolic}/{bp.diastolic} mmHg</span> <span className="text-muted">({t('vitals.readingsCount', { count: bp.count })})</span></li>}
              {fasting && <li>{t('summary.fastingGlucose')}: <span className="ltr-value sensitive">{fasting.value} mg/dL</span> <span className="text-muted">({t('vitals.readingsCount', { count: fasting.count })})</span></li>}
              {weights.length > 0 && <li>{t('vitals.kinds.weight')}: <span className="ltr-value sensitive">{weights[0].weight_kg} kg</span></li>}
            </ul>
          </Section>
        )}

        {outOfRange.length > 0 && (
          <Section title={t('summary.outOfRange')}>
            <ul className="list-disc ps-5">
              {outOfRange.map((x) => (
                <li key={x.h.key}>{testName(x.h)}: <span className="ltr-value sensitive">{formatNumber(x.latest.value, lang)} {x.latest.unit}</span> <span className="text-muted">({t(`labs.status.${x.status}`)} · {formatDate(x.latest.collectedAt, lang)})</span></li>
              ))}
            </ul>
          </Section>
        )}

        {symptoms.length > 0 && (
          <Section title={t('summary.symptoms30')}>
            <p className="sensitive">{symptoms.map(([k, n]) => `${t(`checkin.symptoms.${k}`)} (${t('summary.days', { count: n })})`).join(t('checkin.listSep'))}</p>
          </Section>
        )}

        {data.lifeChanges.length > 0 && (
          <Section title={t('summary.lifeChanges')}>
            <ul className="list-disc ps-5">
              {data.lifeChanges.slice(0, 6).map((l, i) => <li key={i} className="sensitive">{l.title} <span className="text-muted">({formatDate(l.started_on, lang)})</span></li>)}
            </ul>
          </Section>
        )}

        <Section title={t('summary.questions')}>
          <textarea className="min-h-24 w-full rounded-xl border border-line bg-surface p-3 print:hidden" value={questions} placeholder={t('summary.questionsPlaceholder')}
            onChange={(e) => { setQuestions(e.target.value); try { localStorage.setItem(qKey, e.target.value) } catch { /* optional */ } }} />
          <p className="hidden whitespace-pre-line print:block">{questions || '—'}</p>
        </Section>

        <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{t('summary.footer')}</p>
      </article>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 break-inside-avoid">
      <h2 className="mb-1 font-semibold text-brand-700">{title}</h2>
      {children}
    </section>
  )
}
