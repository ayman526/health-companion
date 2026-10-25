import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Activity, BellRing, Camera, Droplet, HeartPulse, Info, Loader2, Phone, Plus, Scale, Thermometer, Trash2, Wind } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { addVital, deleteVital, findRepeatingReminder, loadVitals, readMonitor, setRepeatingReminder, type NewReading } from '../lib/daily'
import { loadProfileDetails } from '../lib/profile'
import { formatDate, formatNumber } from '../lib/format'
import { localTime } from '../lib/medications'
import { ageOn } from '../domain/profileOptions'
import { parseNumber, normalizeNumberInput } from '../domain/numbers'
import { EMERGENCY_NUMBERS } from '../domain/emergency'
import {
  assessReading, average, bmi, bpAverage, cToF, fToC, mgToMmol, mmolToMg, suggestedGlucoseContext,
  type GlucoseContext, type PersonFacts, type VitalKind, type VitalReading,
} from '../domain/vitals'
import { TrendChart, type ChartPoint } from '../components/TrendChart'
import { LEVEL_STYLE, ReadingValue } from '../components/ReadingValue'
import { EvidenceChips } from '../components/TrustChips'
import { PageHeader } from '../components/ui'
import { fieldClass } from '../components/ProfileFields'

const KINDS: { kind: VitalKind; icon: typeof HeartPulse }[] = [
  { kind: 'blood_pressure', icon: HeartPulse },
  { kind: 'glucose', icon: Droplet },
  { kind: 'weight', icon: Scale },
  { kind: 'heart_rate', icon: Activity },
  { kind: 'oxygen', icon: Wind },
  { kind: 'temperature', icon: Thermometer },
]
const PHOTO_KINDS: Record<string, VitalKind> = { blood_pressure: 'blood_pressure', glucose: 'glucose', oxygen: 'oxygen', temperature: 'temperature', weight: 'weight' }
const CONTEXTS: GlucoseContext[] = ['fasting', 'before_meal', 'after_meal', 'bedtime', 'random']

const nowLocal = () => {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export function VitalsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const [params, setParams] = useSearchParams()
  const kind = (KINDS.find((k) => k.kind === params.get('kind'))?.kind ?? 'blood_pressure') as VitalKind
  const [readings, setReadings] = useState<VitalReading[] | null>(null)
  const [person, setPerson] = useState<PersonFacts>({ age: null, heightCm: null, hasDiabetes: false })
  const [unit, setUnit] = useState<'mg' | 'mmol'>(() => { try { return localStorage.getItem('hc.glucoseUnit') === 'mmol' ? 'mmol' : 'mg' } catch { return 'mg' } })
  const [form, setForm] = useState({ a: '', b: '', c: '', context: suggestedGlucoseContext(new Date().getHours()), at: nowLocal(), note: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(false)
  const [reminder, setReminder] = useState<{ on: boolean; time: string }>({ on: false, time: '08:00' })
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>(() => { try { const v = localStorage.getItem('hc.tempUnit'); return v === 'F' || v === 'C' ? v : profile?.country === 'US' ? 'F' : 'C' } catch { return 'C' } })
  const [photo, setPhoto] = useState<{ busy: boolean; used: boolean; low: boolean; error: string | null }>({ busy: false, used: false, low: false, error: null })

  async function fromPhoto(file: File | undefined) {
    if (!file) return
    setPhoto({ busy: true, used: false, low: false, error: null })
    const r = await readMonitor(file)
    if ('error' in r) return setPhoto({ busy: false, used: false, low: false, error: r.error })
    if (r.problem !== 'none' || r.device === 'none') return setPhoto({ busy: false, used: false, low: false, error: r.problem === 'none' ? 'not_a_device' : r.problem })
    const k = PHOTO_KINDS[r.device]
    const f = { ...form, at: nowLocal(), note: '' }
    if (k === 'blood_pressure') Object.assign(f, { a: r.systolic?.toString() ?? '', b: r.diastolic?.toString() ?? '', c: r.pulse?.toString() ?? '' })
    if (k === 'glucose') {
      const u = r.glucose_unit === 'mmol/L' ? 'mmol' : 'mg'
      setUnit(u)
      Object.assign(f, { a: r.glucose?.toString() ?? '' })
    }
    if (k === 'oxygen') Object.assign(f, { a: r.spo2?.toString() ?? '', c: r.pulse?.toString() ?? '' })
    if (k === 'temperature') {
      if (r.temperature_unit) setTempUnit(r.temperature_unit)
      Object.assign(f, { a: r.temperature?.toString() ?? '' })
    }
    if (k === 'weight') Object.assign(f, { a: r.weight != null ? String(r.weight_unit === 'lb' ? Math.round(r.weight * 0.4536 * 10) / 10 : r.weight) : '' })
    setForm(f)
    setParams({ kind: k }, { replace: true })
    setPhoto({ busy: false, used: true, low: r.confidence === 'low', error: null })
  }

  const load = useCallback(async () => setReadings(await loadVitals()), [])

  useEffect(() => {
    void load()
    void loadProfileDetails().then(({ profile: p, lists }) => setPerson({
      age: ageOn(p?.date_of_birth ?? null, new Date().toISOString().slice(0, 10)),
      heightCm: p?.height_cm ?? null,
      hasDiabetes: lists.conditions.some((c) => /diabet|سكري/i.test(c) && !/pre/i.test(c)),
    }))
    void findRepeatingReminder('vital_check').then((r) => r && setReminder({ on: true, time: localTime(r.due_at, r.time_zone, 'en') }))
  }, [load, profile?.id])

  const list = useMemo(() => (readings ?? []).filter((r) => r.kind === kind), [readings, kind])
  const latest = list[0]
  const latestAssessment = latest ? assessReading(latest, person) : null

  async function save() {
    if (!profile) return
    setError(false)
    const a = parseNumber(form.a)
    const b = parseNumber(form.b)
    let reading: NewReading | null = null
    if (kind === 'blood_pressure' && a && b && a > b) reading = { kind, systolic: Math.round(a), diastolic: Math.round(b), pulse: parseNumber(form.c) ? Math.round(parseNumber(form.c)!) : null }
    if (kind === 'glucose' && a) reading = { kind, glucose_mg_dl: unit === 'mmol' ? mmolToMg(a) : Math.round(a), glucose_context: form.context }
    if (kind === 'weight' && a) reading = { kind, weight_kg: Math.round(a * 10) / 10 }
    if (kind === 'heart_rate' && a && a >= 20 && a <= 250) reading = { kind, pulse: Math.round(a) }
    if (kind === 'oxygen' && a && a >= 50 && a <= 100) reading = { kind, spo2: Math.round(a), pulse: parseNumber(form.c) ? Math.round(parseNumber(form.c)!) : null }
    if (kind === 'temperature' && a) {
      const c = tempUnit === 'F' ? fToC(a) : Math.round(a * 10) / 10
      if (c >= 30 && c <= 45) reading = { kind, temperature_c: c }
    }
    if (!reading) return setError(true)
    setSaving(true)
    const ok = await addVital(profile.id, reading, new Date(form.at).toISOString(), form.note, photo.used ? 'photo' : 'user_entered')
    setSaving(false)
    if (!ok) return setError(true)
    setForm({ ...form, a: '', b: '', c: '', note: '', at: nowLocal() })
    setPhoto({ busy: false, used: false, low: false, error: null })
    await load()
  }

  async function toggleReminder(on: boolean, time = reminder.time) {
    if (!profile) return
    if (await setRepeatingReminder(profile.id, 'vital_check', on, t('vitals.reminderTitle'), time, tz)) setReminder({ on, time })
  }

  const points: ChartPoint[] = list.slice(0, 60).reverse().map((r) => {
    const s = assessReading(r, person)
    return {
      id: r.id,
      date: r.measured_at.slice(0, 10),
      value: kind === 'blood_pressure' ? r.systolic! : kind === 'glucose' ? (unit === 'mmol' ? mgToMmol(r.glucose_mg_dl!) : r.glucose_mg_dl!)
        : kind === 'heart_rate' ? r.pulse! : kind === 'oxygen' ? r.spo2! : kind === 'temperature' ? (tempUnit === 'F' ? cToF(r.temperature_c!) : r.temperature_c!) : r.weight_kg!,
      status: !s ? 'no_range' : s.level === 'urgent' ? 'urgent' : s.level === 'ok' ? 'within_range' : r.kind === 'blood_pressure' && s.category === 'bp_low' ? 'low' : s.category.includes('low') ? 'low' : 'high',
    }
  })

  const bp7 = bpAverage(list, 7)
  const bp30 = bpAverage(list, 30)
  const bpPrev7 = bpAverage(list, 7, Date.now(), 7)
  const fasting7 = average(list.filter((r) => r.glucose_context === 'fasting'), (r) => r.glucose_mg_dl, 7)
  const glucose30 = average(list, (r) => r.glucose_mg_dl, 30)
  const weightThen = list.find((r) => Date.parse(r.measured_at) <= Date.now() - 28 * 86_400_000)
  const pickSimple = (r: VitalReading) => (kind === 'heart_rate' ? r.pulse : kind === 'oxygen' ? r.spo2 ?? null : kind === 'temperature' ? r.temperature_c ?? null : null)
  const simple7 = average(list, pickSimple, 7)
  const simple30 = average(list, pickSimple, 30)
  const fmtSimple = (v: number) => (kind === 'heart_rate' ? `${v} ${t('vitals.bpm')}` : kind === 'oxygen' ? `${v}%` : tempUnit === 'F' ? `${cToF(v)} °F` : `${v} °C`)
  const fmtGlucose = (mg: number) => (unit === 'mmol' ? `${formatNumber(mgToMmol(mg), lang, 1)} mmol/L` : `${mg} mg/dL`)
  const emergency = EMERGENCY_NUMBERS[profile?.country ?? 'EG'] ?? EMERGENCY_NUMBERS.EG

  return (
    <>
      <PageHeader title={t('vitals.title')} subtitle={t('vitals.subtitle')} />

      {/* Read the numbers from a photo of the device's screen */}
      <label className={`mb-3 flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-brand-600 bg-brand-50 px-4 font-medium text-brand-700 ${photo.busy ? 'opacity-60' : ''}`}>
        {photo.busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
        <span className="flex-1">
          <span className="block">{photo.busy ? t('vitals.photo.reading') : t('vitals.photo.button')}</span>
          <span className="block text-xs font-normal text-muted">{t('vitals.photo.hint')}</span>
        </span>
        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photo.busy}
          onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      {photo.error && <p role="alert" className="mb-3 rounded-xl bg-status-watch-bg px-4 py-3 text-sm text-status-watch">{t(`vitals.photo.errors.${photo.error}`, t('vitals.photo.errors.ai_unavailable'))}</p>}

      <div className="mb-4 grid grid-cols-3 gap-2" role="tablist">
        {KINDS.map(({ kind: k, icon: Icon }) => (
          <button key={k} type="button" role="tab" aria-selected={k === kind} onClick={() => setParams({ kind: k }, { replace: true })}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border text-xs font-medium ${k === kind ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-surface'}`}>
            <Icon className="size-5" aria-hidden /> {t(`vitals.kinds.${k}`)}
          </button>
        ))}
      </div>

      {/* Add a reading */}
      <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Plus className="size-5 text-brand-700" aria-hidden /> {t('vitals.add')}</h2>
        <div className="grid grid-cols-2 gap-3">
          {kind === 'blood_pressure' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.systolic')}
                <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="120" value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.diastolic')}
                <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="80" value={form.b} onChange={(e) => setForm({ ...form, b: normalizeNumberInput(e.target.value) })} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.pulse')}
                <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="72" value={form.c} onChange={(e) => setForm({ ...form, c: normalizeNumberInput(e.target.value) })} />
              </label>
            </>
          )}
          {kind === 'glucose' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.kinds.glucose')}
                <input className={fieldClass} dir="ltr" inputMode="decimal" placeholder={unit === 'mmol' ? '5.5' : '100'} value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.unit')}
                <select className={fieldClass} value={unit} onChange={(e) => { const u = e.target.value as 'mg' | 'mmol'; setUnit(u); try { localStorage.setItem('hc.glucoseUnit', u) } catch { /* optional */ } }}>
                  <option value="mg">mg/dL</option>
                  <option value="mmol">mmol/L</option>
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.when')}
                <select className={fieldClass} value={form.context} onChange={(e) => setForm({ ...form, context: e.target.value as GlucoseContext })}>
                  {CONTEXTS.map((c) => <option key={c} value={c}>{t(`vitals.contexts.${c}`)}</option>)}
                </select>
              </label>
            </>
          )}
          {kind === 'weight' && (
            <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.weightKg')}
              <input className={fieldClass} dir="ltr" inputMode="decimal" placeholder="70" value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
            </label>
          )}
          {kind === 'heart_rate' && (
            <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.heartRate')}
              <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="72" value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
              <span className="text-xs font-normal text-muted">{t('vitals.restingHint')}</span>
            </label>
          )}
          {kind === 'oxygen' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.spo2')}
                <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="97" value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.pulse')}
                <input className={fieldClass} dir="ltr" inputMode="numeric" placeholder="72" value={form.c} onChange={(e) => setForm({ ...form, c: normalizeNumberInput(e.target.value) })} />
              </label>
            </>
          )}
          {kind === 'temperature' && (
            <>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.kinds.temperature')}
                <input className={fieldClass} dir="ltr" inputMode="decimal" placeholder={tempUnit === 'F' ? '98.6' : '37.0'} value={form.a} onChange={(e) => setForm({ ...form, a: normalizeNumberInput(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">{t('vitals.unit')}
                <select className={fieldClass} value={tempUnit} onChange={(e) => { const u = e.target.value as 'C' | 'F'; setTempUnit(u); try { localStorage.setItem('hc.tempUnit', u) } catch { /* optional */ } }}>
                  <option value="C">°C</option>
                  <option value="F">°F</option>
                </select>
              </label>
            </>
          )}
          <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.measuredAt')}
            <input className={fieldClass} type="datetime-local" dir="ltr" value={form.at} max={nowLocal()} onChange={(e) => setForm({ ...form, at: e.target.value })} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm font-medium">{t('vitals.note')}
            <input className={fieldClass} maxLength={500} placeholder={t('vitals.notePlaceholder')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </label>
        </div>
        {photo.used && <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${photo.low ? 'bg-status-watch-bg text-status-watch' : 'bg-brand-50 text-brand-700'}`}>{t(photo.low ? 'vitals.photo.checkLow' : 'vitals.photo.check')}</p>}
        {error && <p role="alert" className="mt-2 text-sm text-status-urgent">{t(`vitals.invalid.${kind}`)}</p>}
        <button type="button" disabled={saving} onClick={() => void save()} className="mt-3 min-h-12 w-full rounded-xl bg-brand-700 font-medium text-white disabled:opacity-60">
          {saving ? t('onboarding.saving') : t('vitals.save')}
        </button>
      </section>

      {/* Latest reading and what it means */}
      {latest && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">{t('vitals.latest')} · {formatDate(latest.measured_at, lang, tz)} {localTime(latest.measured_at, tz, lang)}</p>
          <p className="mt-1 text-2xl font-semibold"><ReadingValue r={latest} unit={unit} tempUnit={tempUnit} /></p>
          {latestAssessment ? (
            <>
              <p className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium ${LEVEL_STYLE[latestAssessment.level]}`}>{t(`vitals.categories.${latestAssessment.category}`)}</p>
              <p className="mt-2 text-sm text-muted">{t(`vitals.meaning.${latestAssessment.category}`)}</p>
              {latestAssessment.level === 'urgent' && (
                <a href={`tel:${emergency.general}`} className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-xl bg-status-urgent px-4 font-semibold text-white">
                  <Phone className="size-4" aria-hidden /> {t('advisor.emergency.call', { number: emergency.general })}
                </a>
              )}
              <EvidenceChips sources={latestAssessment.sources} />
            </>
          ) : kind === 'blood_pressure' && person.age != null && person.age < 18 ? (
            <p className="mt-2 text-sm text-muted">{t('vitals.childNote')}</p>
          ) : kind === 'weight' && !person.heightCm ? (
            <p className="mt-2 text-sm text-muted">{t('vitals.addHeight')}</p>
          ) : null}
          {kind !== 'weight' && <p className="mt-3 flex items-start gap-2 text-xs text-muted"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('vitals.oneReading')}</p>}
        </section>
      )}

      {/* Averages: what doctors look at */}
      {list.length > 0 && (
        <section className="mb-4 grid grid-cols-2 gap-2">
          {kind === 'blood_pressure' && (
            <>
              <Stat label={t('vitals.avg7')} value={bp7 ? `${bp7.systolic}/${bp7.diastolic}` : '—'} hint={bp7 ? t('vitals.readingsCount', { count: bp7.count }) : ''}
                change={bp7 && bpPrev7 ? t('vitals.vsLastWeek', { diff: `${bp7.systolic - bpPrev7.systolic >= 0 ? '+' : ''}${bp7.systolic - bpPrev7.systolic}` }) : ''} />
              <Stat label={t('vitals.avg30')} value={bp30 ? `${bp30.systolic}/${bp30.diastolic}` : '—'} hint={bp30 ? t('vitals.readingsCount', { count: bp30.count }) : ''} />
            </>
          )}
          {kind === 'glucose' && (
            <>
              <Stat label={t('vitals.fastingAvg7')} value={fasting7 ? fmtGlucose(fasting7.value) : '—'} hint={fasting7 ? t('vitals.readingsCount', { count: fasting7.count }) : ''} />
              <Stat label={t('vitals.avg30')} value={glucose30 ? fmtGlucose(glucose30.value) : '—'} hint={glucose30 ? t('vitals.readingsCount', { count: glucose30.count }) : ''} />
            </>
          )}
          {(kind === 'heart_rate' || kind === 'oxygen' || kind === 'temperature') && (
            <>
              <Stat label={t('vitals.avg7')} value={simple7 ? fmtSimple(simple7.value) : '—'} hint={simple7 ? t('vitals.readingsCount', { count: simple7.count }) : ''} />
              <Stat label={t('vitals.avg30')} value={simple30 ? fmtSimple(simple30.value) : '—'} hint={simple30 ? t('vitals.readingsCount', { count: simple30.count }) : ''} />
            </>
          )}
          {kind === 'weight' && latest && (
            <>
              <Stat label={t('vitals.change30')} value={weightThen ? `${latest.weight_kg! - weightThen.weight_kg! >= 0 ? '+' : ''}${formatNumber(latest.weight_kg! - weightThen.weight_kg!, lang, 1)} kg` : '—'} hint="" />
              <Stat label={t('profile.bmi')} value={bmi(latest.weight_kg!, person.heightCm)?.toString() ?? '—'} hint={person.heightCm ? '' : t('vitals.addHeightShort')} />
            </>
          )}
        </section>
      )}

      {points.length > 1 && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Activity className="size-4 text-brand-700" aria-hidden /> {t(`vitals.chart.${kind}`)}</h2>
          <TrendChart points={points} unit={kind === 'blood_pressure' ? 'mmHg' : kind === 'glucose' ? (unit === 'mmol' ? 'mmol/L' : 'mg/dL') : kind === 'heart_rate' ? t('vitals.bpm') : kind === 'oxygen' ? '%' : kind === 'temperature' ? `°${tempUnit}` : 'kg'}
            refLow={kind === 'blood_pressure' ? 90 : kind === 'glucose' ? (unit === 'mmol' ? 4.4 : 80) : kind === 'heart_rate' ? 60 : kind === 'oxygen' ? 95 : kind === 'temperature' ? (tempUnit === 'F' ? 95 : 35) : null}
            refHigh={kind === 'blood_pressure' ? 129 : kind === 'glucose' ? (unit === 'mmol' ? 7.2 : 130) : kind === 'heart_rate' ? 100 : kind === 'oxygen' ? 100 : kind === 'temperature' ? (tempUnit === 'F' ? 100.3 : 37.9) : null}
            statusLabel={(s) => t(`vitals.chartStatus.${s}`)} bandNote={t(`vitals.band.${kind}`)} />
        </section>
      )}

      {/* Daily reminder */}
      <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm">
        <BellRing className="size-5 text-brand-700" aria-hidden />
        <label className="flex flex-1 items-center gap-2 font-medium">
          <input type="checkbox" className="size-5 accent-brand-700" checked={reminder.on} onChange={(e) => void toggleReminder(e.target.checked)} />
          {t('vitals.remindDaily')}
        </label>
        <input type="time" dir="ltr" className="min-h-11 rounded-lg border border-line bg-surface px-3" value={reminder.time}
          onChange={(e) => { setReminder({ ...reminder, time: e.target.value }); if (reminder.on) void toggleReminder(true, e.target.value) }} />
      </section>

      {/* History */}
      {readings === null ? <p className="text-sm text-muted">{t('auth.loading')}</p> : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">{t(`vitals.empty.${kind}`)}</p>
      ) : (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('vitals.history')}</h2>
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.slice(0, 50).map((r) => {
              const s = assessReading(r, person)
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium"><ReadingValue r={r} unit={unit} tempUnit={tempUnit} /></p>
                    <p className="text-xs text-muted">
                      {formatDate(r.measured_at, lang, tz)} {localTime(r.measured_at, tz, lang)}
                      {r.glucose_context && ` · ${t(`vitals.contexts.${r.glucose_context}`)}`}
                      {r.note && <span className="sensitive"> · {r.note}</span>}
                    </p>
                  </div>
                  {s && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${LEVEL_STYLE[s.level]}`}>{t(`vitals.categories.${s.category}`)}</span>}
                  <button type="button" aria-label={t('vitals.delete')} onClick={async () => { if (await deleteVital(r.id)) await load() }}
                    className="grid min-h-11 min-w-11 place-items-center rounded-full text-muted hover:bg-canvas"><Trash2 className="size-4" aria-hidden /></button>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}

function Stat({ label, value, hint, change }: { label: string; value: string; hint: string; change?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-lg font-semibold"><span className="ltr-value sensitive">{value}</span></p>
      {change && <p className="text-xs text-muted"><span className="ltr-value sensitive">{change}</span></p>}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
