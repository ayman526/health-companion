import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BellOff, BellRing, BookOpen, Camera, ExternalLink, Pencil, Square } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { formatDate } from '../lib/format'
import { currentSchedule, loadMedications, todayIn, type MedicationRow } from '../lib/medications'
import { adherenceSummary, type DoseLog } from '../domain/medications'
import { useScheduleText } from '../components/ScheduleSummary'
import { PageHeader } from '../components/ui'
import { SourceChip, provenanceOf } from '../components/TrustChips'
import { photoUrls, removeMedicationPhoto, setMedicationPhoto } from '../lib/medicationPhotos'
import { medlinePlusDrugUrl, usesFor } from '../domain/medicineInfo'
import { ContextCard } from '../components/ContextCard'
import { medicationTags } from '../domain/libraryTags'
import { fetchMedicineInfo, type AiMedicineInfo } from '../lib/medicineInfo'

const DOT: Record<DoseLog['status'], string> = {
  taken: 'bg-status-ok',
  skipped: 'bg-status-watch',
  not_recorded: 'bg-line',
  pending: 'border border-line bg-surface',
  snoozed: 'border border-line bg-surface',
}

export function MedicationDetailPage() {
  const { medicationId } = useParams()
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const { profile } = useAuth()
  const tz = profile?.time_zone ?? 'Africa/Cairo'
  const describe = useScheduleText()
  const [med, setMed] = useState<MedicationRow | null>(null)
  const [logs, setLogs] = useState<(DoseLog & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [stopDate, setStopDate] = useState(todayIn(tz))
  const [error, setError] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [aiInfo, setAiInfo] = useState<AiMedicineInfo | null | 'loading'>(null)

  const load = useCallback(async () => {
    const m = (await loadMedications()).find((x) => x.id === medicationId) ?? null
    setMed(m)
    setPhoto(m?.photo_path ? (await photoUrls([m.photo_path]))[m.photo_path] ?? null : null)
    if (supabase && m) {
      const since = new Date(Date.now() - 30 * 864e5).toISOString()
      const { data } = await supabase
        .from('medication_dose_logs')
        .select('id, scheduled_for, status')
        .in('schedule_id', m.medication_schedules.map((s) => s.id))
        .gte('scheduled_for', since)
        .order('scheduled_for')
      setLogs((data ?? []) as (DoseLog & { id: string })[])
    }
    setLoading(false)
  }, [medicationId])

  useEffect(() => {
    void load()
  }, [load])

  // Not in the bundled list: ask for an AI summary (cached, name only).
  const localUses = med ? usesFor(med.brand_name, med.active_ingredient, lang) : null
  useEffect(() => {
    if (!med || localUses) return
    setAiInfo('loading')
    void fetchMedicineInfo(med.active_ingredient ? `${med.brand_name} (${med.active_ingredient})` : med.brand_name).then(setAiInfo)
  }, [med, localUses])

  if (loading) return <p role="status" className="text-muted">{t('auth.loading')}</p>
  if (!med) return <p className="text-muted">{t('meds.notFound')}</p>

  const current = currentSchedule(med)
  const summary = adherenceSummary(logs)

  async function setReminders(on: boolean) {
    if (!supabase || !current) return
    const { error: e } = await supabase.from('medication_schedules').update({ reminders_enabled: on }).eq('id', current.id)
    if (e) return setError(true)
    await load()
  }

  async function stop() {
    if (!supabase) return
    const { error: e } = await supabase.rpc('stop_medication', { p_medication_id: med!.id, p_end: stopDate })
    if (e) return setError(true)
    setStopping(false)
    await load()
  }

  async function onPhoto(file: File | undefined) {
    if (!file || !profile || !med) return
    setPhotoBusy(true)
    const ok = await setMedicationPhoto(profile.id, med.id, med.photo_path, file)
    setPhotoBusy(false)
    if (!ok) return setError(true)
    await load()
  }

  async function logAsNeeded() {
    if (!supabase || !current) return
    const { error: e } = await supabase.rpc('log_as_needed_dose', { p_schedule_id: current.id })
    if (e) return setError(true)
    await load()
  }

  return (
    <>
      <PageHeader title={`${med.brand_name}${med.strength ? ` ${med.strength}` : ''}`} subtitle={med.active_ingredient ?? undefined} sensitive />
      <div className="mb-4">
        <SourceChip kind={provenanceOf(med.source, !!med.document_id)} to={med.document_id ? `/records/documents/${med.document_id}` : undefined}
          detail={med.document_id ? t('trust.view') : undefined} />
      </div>
      <Link to={`/medications/${med.id}/edit`} className="-mt-3 mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-brand-700">
        <Pencil className="size-4" aria-hidden /> {t('meds.editDetails')}
      </Link>

      <section className="mb-4 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
        {photo ? (
          <img src={photo} alt={t('meds.photo.alt', { name: med.brand_name })} className="size-24 shrink-0 rounded-xl object-cover" />
        ) : (
          <span className="grid size-24 shrink-0 place-items-center rounded-xl bg-canvas text-muted"><Camera className="size-8" aria-hidden /></span>
        )}
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-muted">{photo ? t('meds.photo.hint') : t('meds.photo.addHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-line px-3 font-medium">
              <Camera className="size-4" aria-hidden /> {photoBusy ? t('onboarding.saving') : photo ? t('meds.photo.change') : t('meds.photo.add')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={photoBusy} onChange={(e) => void onPhoto(e.target.files?.[0])} />
            </label>
            {photo && med.photo_path && (
              <button type="button" onClick={async () => { if (await removeMedicationPhoto(med.id, med.photo_path!)) await load() }} className="min-h-11 px-2 text-muted">{t('meds.photo.remove')}</button>
            )}
          </div>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-line bg-surface p-4 text-sm">
        <h2 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-brand-700" aria-hidden /> {t('meds.uses.title')}</h2>
        {localUses ? (
          <p className="mt-1">{localUses}</p>
        ) : aiInfo === 'loading' ? (
          <p role="status" className="mt-1 text-muted">{t('meds.uses.looking')}</p>
        ) : aiInfo?.recognized && (lang === 'ar' ? aiInfo.uses_ar : aiInfo.uses_en) ? (
          <>
            <p className="mt-1">{lang === 'ar' ? aiInfo.uses_ar : aiInfo.uses_en}</p>
            {aiInfo.active_ingredient && !med.active_ingredient && (
              <p className="mt-1 text-xs">{t('meds.uses.likelyContains', { ingredient: aiInfo.active_ingredient })}</p>
            )}
            <p className="mt-1 text-xs font-medium text-status-watch">{t('meds.uses.aiLabel')}</p>
          </>
        ) : (
          <p className="mt-1">{t('meds.uses.unknown')}</p>
        )}
        <p className="mt-2 text-xs text-muted">{t('meds.uses.note')}</p>
        <a href={medlinePlusDrugUrl(med.brand_name, med.active_ingredient)} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 font-medium text-brand-700">
          <ExternalLink className="size-4" aria-hidden /> {t('meds.uses.learnMore')}
        </a>
      </section>

      {current && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">{med.is_active ? t('meds.currentRegimen') : t('meds.lastRegimen')}</p>
          <p className="mt-1 font-semibold">{describe(current)}</p>
          <p className="mt-1 text-xs text-muted">
            {t('meds.since', { date: formatDate(current.valid_from, lang) })}
            {current.valid_to && ` · ${t('meds.until', { date: formatDate(current.valid_to, lang) })}`}
          </p>
          {med.instructions && <p className="mt-2 text-sm">{med.instructions}</p>}
          {med.prescriber && <p className="mt-1 text-xs text-muted">{t('meds.prescribedBy', { name: med.prescriber })}</p>}

          {med.is_active && (
            <div className="mt-4 flex flex-wrap gap-2">
              {current.frequency === 'as_needed' ? (
                <button type="button" onClick={() => void logAsNeeded()} className="min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('meds.logNow')}</button>
              ) : current.reminders_enabled ? (
                <button type="button" onClick={() => void setReminders(false)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium">
                  <BellOff className="size-4" aria-hidden /> {t('meds.remindersOff')}
                </button>
              ) : (
                <button type="button" disabled={!current.dose_amount} onClick={() => void setReminders(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium disabled:opacity-50">
                  <BellRing className="size-4" aria-hidden /> {t('meds.remindersOn')}
                </button>
              )}
              <Link to={`/medications/${med.id}/change`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium">
                <Pencil className="size-4" aria-hidden /> {t('meds.changeDose')}
              </Link>
              <button type="button" onClick={() => setStopping((v) => !v)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium">
                <Square className="size-4" aria-hidden /> {t('meds.stop')}
              </button>
            </div>
          )}
          {stopping && (
            <div className="mt-3 rounded-xl bg-canvas p-3">
              <p className="text-sm">{t('meds.stopExplain')}</p>
              <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-muted">
                {t('meds.stopDate')}
                <input type="date" dir="ltr" className="min-h-11 rounded-lg border border-line bg-surface px-3 text-sm" value={stopDate} onChange={(e) => setStopDate(e.target.value)} />
              </label>
              <button type="button" disabled={!stopDate} onClick={() => void stop()} className="mt-3 min-h-11 rounded-xl bg-brand-700 px-4 text-sm font-medium text-white">{t('meds.confirmStop')}</button>
            </div>
          )}
          {error && <p role="alert" className="mt-3 text-sm text-status-urgent">{t('review.saveError')}</p>}
        </section>
      )}

      {logs.length > 0 && (
        <section className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold">{t('meds.last30')}</h2>
          <div className="mt-3 flex flex-wrap gap-1.5" role="list" aria-label={t('meds.last30')}>
            {logs.filter((l) => new Date(l.scheduled_for) <= new Date()).map((l) => (
              <span key={l.id} role="listitem" title={`${formatDate(l.scheduled_for, lang, tz)} · ${t(`meds.dose.${l.status}`)}`} className={`size-4 rounded ${DOT[l.status]}`} />
            ))}
          </div>
          <p className="mt-3 text-sm">
            {t('meds.adherence', { taken: summary.taken, skipped: summary.skipped, notRecorded: summary.notRecorded })}
          </p>
          <p className="mt-1 text-xs text-muted">{t('meds.selfReported')}</p>
        </section>
      )}

      {med.medication_schedules.length > 1 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-muted">{t('meds.history')}</h2>
          <ul className="flex flex-col gap-2">
            {[...med.medication_schedules].reverse().map((s) => (
              <li key={s.id} className="rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                <p className="font-medium">{describe(s)}</p>
                <p className="text-xs text-muted">{formatDate(s.valid_from, lang)} – {s.valid_to ? formatDate(s.valid_to, lang) : t('meds.now')}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ContextCard className="mb-4" topics={medicationTags([{ name: med.brand_name, ingredient: med.active_ingredient, active: true }])} />
      <p className="text-xs text-muted">{t('meds.disclaimer')}</p>
    </>
  )
}
