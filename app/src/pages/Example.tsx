import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Footprints, Pill, X } from 'lucide-react'
import { StatusBadge } from '../components/LabStatus'
import { TrendChart } from '../components/TrendChart'
import { getTest } from '../domain/labs/catalog'
import type { MeasurementStatus } from '../domain/labs/rules'
import { formatDate, formatNumber } from '../lib/format'
import { trackPublic } from '../lib/usage'

// "See an example first": four read-only screens built like the real ones
// (your tests, one test over time with treatment changes, medicines, your day)
// with made-up data. Nothing is saved and nothing is sent anywhere.

const TESTS: { code: string; value: number; unit: string; status: MeasurementStatus; count: number }[] = [
  { code: 'hba1c', value: 6.4, unit: '%', status: 'high', count: 5 },
  { code: 'ldl_c', value: 96, unit: 'mg/dL', status: 'within_range', count: 4 },
  { code: 'hdl_c', value: 44, unit: 'mg/dL', status: 'low', count: 4 },
  { code: 'triglycerides', value: 138, unit: 'mg/dL', status: 'within_range', count: 4 },
  { code: 'alt', value: 28, unit: 'U/L', status: 'within_range', count: 3 },
  { code: 'creatinine', value: 0.9, unit: 'mg/dL', status: 'within_range', count: 3 },
]
const HBA1C = [
  { date: '2024-02-15', value: 8.1 }, { date: '2024-09-20', value: 7.6 }, { date: '2025-04-12', value: 7.0 },
  { date: '2025-11-20', value: 6.7 }, { date: '2026-10-11', value: 6.4 },
]
const MEDS = [
  { name: 'Glucophage 500', times: ['09:00', '21:00'] },
  { name: 'Concor 5', times: ['09:00'] },
  { name: 'Lipitor 20', times: ['21:00'] },
]
const DAY = [
  { name: 'Glucophage 500', time: '09:00', done: true },
  { name: 'Concor 5', time: '09:00', done: true },
  { name: 'Glucophage 500', time: '21:00', done: false },
  { name: 'Lipitor 20', time: '21:00', done: false },
]
const STEPS = 4

export function ExamplePage({ onClose, onStart }: { onClose: () => void; onStart: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'ar' ? 'ar' : 'en'
  const [step, setStep] = useState(1)

  useEffect(() => {
    trackPublic(step === 1 ? 'example_opened' : (`example_step_${step}` as 'example_step_2'))
    window.scrollTo({ top: 0 })
  }, [step])

  const time = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(2026, 0, 1, h, m))
  }
  const start = () => {
    trackPublic('example_start_clicked')
    onStart()
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button type="button" aria-label={t('example.close')} onClick={onClose} className="grid size-10 place-items-center rounded-full text-muted"><X className="size-5" aria-hidden /></button>
        <p className="flex-1 truncate text-sm font-semibold">{t('app.name')}</p>
        <span className="rounded-full bg-status-watch-bg px-3 py-1 text-xs font-medium text-status-watch">{t('example.banner')}</span>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-40 pt-4">
        <p className="mb-4 text-lg font-semibold leading-snug">{t(`example.captions.${step}`)}</p>

        {step === 1 && (
          <section>
            <p className="mb-2 text-sm font-medium text-muted">{t('records.tests')} · {t('example.reportsKept', { count: 14 })}</p>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {TESTS.map((x) => (
                <li key={x.code} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{getTest(x.code)?.name[lang] ?? x.code}</span>
                    <span className="block text-xs text-muted"><span className="ltr-value">{formatNumber(x.value, lang)} {x.unit}</span> · {formatDate('2026-10-11', lang)} · {t('records.resultCount', { count: x.count })}</span>
                  </span>
                  <StatusBadge status={x.status} />
                  <ChevronRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
                </li>
              ))}
            </ul>
          </section>
        )}

        {step === 2 && (
          <>
            <h2 className="mb-3 text-xl font-semibold">{getTest('hba1c')?.name[lang]}</h2>
            <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted">{t('history.latest', { date: formatDate('2026-10-11', lang) })}</p>
                  <p className="text-2xl font-semibold"><span className="ltr-value">6.4 %</span></p>
                </div>
                <span className="rounded-full bg-status-ok-bg px-2.5 py-1 text-xs font-medium text-status-ok">{t('example.improved', { from: '8.1', to: '6.4' })}</span>
              </div>
              <div className="mt-4">
                <TrendChart points={HBA1C.map((p, i) => ({ id: String(i), date: p.date, value: p.value, status: 'high' }))} unit="%" refLow={4} refHigh={5.6} bandNote={t('example.bandNote')} />
              </div>
            </section>
            <section className="rounded-2xl border border-line bg-surface p-4">
              <h3 className="text-sm font-semibold">{t('history.changesTitle')}</h3>
              <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                <li className="flex items-center gap-2"><Pill className="size-4 shrink-0 text-brand-700" aria-hidden /><span className="w-24 shrink-0 text-xs text-muted">{formatDate('2024-03-01', lang)}</span><span>{t('history.changeKinds.medication_started', { name: 'Glucophage 500' })}</span></li>
                <li className="flex items-center gap-2"><Footprints className="size-4 shrink-0 text-brand-700" aria-hidden /><span className="w-24 shrink-0 text-xs text-muted">{formatDate('2025-01-10', lang)}</span><span>{t('example.walking')}</span></li>
              </ul>
            </section>
          </>
        )}

        {step === 3 && (
          <section>
            <p className="mb-2 text-sm font-medium text-muted">{t('meds.current')}</p>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {MEDS.map((m) => (
                <li key={m.name} className="flex min-h-16 items-center gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><Pill className="size-5" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span dir="ltr" className="block text-start font-semibold rtl:text-end">{m.name}</span>
                    <span className="block text-xs text-muted">{t('example.schedule', { count: m.times.length, times: m.times.map(time).join(lang === 'ar' ? '، ' : ', ') })}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted rtl:-scale-x-100" aria-hidden />
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">{t('example.medsNote')}</p>
          </section>
        )}

        {step === 4 && (
          <section className="rounded-2xl border border-line bg-surface p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="font-semibold">{t('home.yourDay')}</h2>
              <span className="text-xs text-muted">{t('home.left', { count: DAY.filter((d) => !d.done).length })}</span>
            </div>
            <ul className="flex flex-col">
              {DAY.map((d, i) => (
                <li key={i} className="flex min-h-12 items-center gap-3 border-b border-line py-2 last:border-0">
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${d.done ? 'border-status-ok bg-status-ok text-white' : 'border-brand-700'}`} aria-hidden>{d.done ? '✓' : ''}</span>
                  <span dir="ltr" className={`flex-1 text-start text-sm font-medium rtl:text-end ${d.done ? 'text-muted line-through' : ''}`}>{d.name}</span>
                  <span dir="ltr" className="text-xs text-muted">{time(d.time)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">{t('example.remindersNote')}</p>
          </section>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="flex justify-center gap-1.5" aria-label={t('example.stepOf', { n: step, total: STEPS })}>
            {Array.from({ length: STEPS }, (_, i) => <span key={i} className={`h-1.5 w-6 rounded-full ${i < step ? 'bg-brand-600' : 'bg-line'}`} />)}
          </div>
          <div className="flex gap-2">
            {step > 1 && (
              <button type="button" onClick={() => setStep(step - 1)} aria-label={t('example.back')} className="grid min-h-12 min-w-12 place-items-center rounded-xl border border-line"><ChevronRight className="size-5 ltr:rotate-180" aria-hidden /></button>
            )}
            {step < STEPS ? (
              <button type="button" onClick={() => setStep(step + 1)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-1 rounded-xl border border-line font-medium">
                {t('example.next')} <ChevronLeft className="size-5 ltr:rotate-180" aria-hidden />
              </button>
            ) : null}
            <button type="button" onClick={start} className="min-h-12 flex-1 rounded-xl bg-brand-700 font-semibold text-white">{t('example.start')}</button>
          </div>
          <p className="text-center text-xs text-muted">{t('example.nothingSaved')}</p>
        </div>
      </footer>
    </div>
  )
}
