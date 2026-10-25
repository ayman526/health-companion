import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Keyboard, Loader2, Mic, Square, X } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { loadMedications } from '../lib/medications'
import { listen, parseVoice, saveVoiceItems, speechSupported, toReading, type VoiceItem } from '../lib/voice'
import { mgToMmol } from '../domain/vitals'
import { track } from '../lib/usage'

type Phase = { kind: 'idle' } | { kind: 'listening' } | { kind: 'reading' } | { kind: 'confirm'; items: VoiceItem[] } | { kind: 'done'; saved: number; noDose: string[] } | { kind: 'error'; code: string }

/**
 * "Say it instead of typing": speak a reading, a medicine you took, a life
 * change or how you feel, in Arabic or English. Shows what it understood for
 * the person to confirm before saving. Typing works too (and when the browser
 * can't listen).
 */
export function VoiceLog({ className = '', startOpen = false, onClose }: { className?: string; startOpen?: boolean; onClose?: () => void }) {
  const { t, i18n } = useTranslation()
  const { profile } = useAuth()
  const [open, setOpen] = useState(startOpen)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(!speechSupported)
  const [keep, setKeep] = useState<Set<number>>(new Set())
  const stop = useRef<() => void>(() => {})

  useEffect(() => () => stop.current(), [])
  // Opened from the "+" menu: start listening straight away.
  useEffect(() => {
    if (startOpen && speechSupported) start()
  // Only on first open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function understand(spoken: string) {
    if (!spoken.trim()) return setPhase({ kind: 'idle' })
    setPhase({ kind: 'reading' })
    const meds = (await loadMedications()).filter((m) => m.is_active).map((m) => m.brand_name)
    const r = await parseVoice(spoken, meds)
    if ('error' in r) { track('voice_failed'); return setPhase({ kind: 'error', code: r.error }) }
    if (r.items.length === 0) { track('voice_failed'); return setPhase({ kind: 'error', code: 'not_understood' }) }
    setKeep(new Set(r.items.map((_, i) => i)))
    setPhase({ kind: 'confirm', items: r.items })
  }

  function start() {
    setText('')
    setPhase({ kind: 'listening' })
    track('voice_started')
    stop.current = listen(i18n.language, (said, final) => {
      setText(said)
      if (final) void understand(said)
    }, (code) => {
      if (code === 'no-speech' || code === 'aborted') return setPhase({ kind: 'idle' })
      setTyping(true)
      setPhase({ kind: 'error', code: code === 'not-allowed' ? 'mic_blocked' : 'unsupported' })
    })
  }

  const describe = (it: VoiceItem) => {
    const r = toReading(it)
    if (r?.kind === 'blood_pressure') return t('voice.items.blood_pressure', { value: `${r.systolic}/${r.diastolic}${r.pulse ? ` · ${r.pulse} ${t('vitals.bpm')}` : ''}` })
    if (r?.kind === 'glucose') return t('voice.items.glucose', { value: `${r.glucose_mg_dl} mg/dL (${mgToMmol(r.glucose_mg_dl)} mmol/L)`, context: t(`vitals.contexts.${r.glucose_context}`) })
    if (r?.kind === 'weight') return t('voice.items.weight', { value: r.weight_kg })
    if (r?.kind === 'heart_rate') return t('voice.items.heart_rate', { value: r.pulse })
    if (r?.kind === 'oxygen') return t('voice.items.oxygen', { value: r.spo2 })
    if (r?.kind === 'temperature') return t('voice.items.temperature', { value: r.temperature_c })
    if (it.type === 'dose_taken') return it.medicine ? t('voice.items.dose', { medicine: it.medicine }) : t('voice.items.doseUnknown')
    if (it.type === 'life_change') return t('voice.items.life', { title: it.life_title })
    if (it.type === 'symptom') return t('voice.items.symptom', { symptom: t(`checkin.symptoms.${it.symptom}`) })
    if (it.type === 'mood') return t('voice.items.mood', { mood: t(`checkin.moods.${it.mood}`) })
    return t('voice.items.unclear')
  }
  const savable = (it: VoiceItem) => !!toReading(it) || (it.type === 'dose_taken' && !!it.medicine) || (it.type === 'life_change' && !!it.life_title)
    || (it.type === 'symptom' && it.symptom !== 'none') || (it.type === 'mood' && it.mood >= 1)

  async function save(items: VoiceItem[]) {
    if (!profile) return
    setPhase({ kind: 'reading' })
    const chosen = items.filter((it, i) => keep.has(i) && savable(it))
    const r = await saveVoiceItems(profile.id, profile.time_zone, chosen)
    setPhase({ kind: 'done', ...r })
  }

  const close = () => { stop.current(); setOpen(false); setPhase({ kind: 'idle' }); setText(''); onClose?.() }

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); if (speechSupported) start() }}
        className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-4 text-sm font-medium ${className}`}>
        <Mic className="size-5 text-brand-700" aria-hidden /> {t('voice.button')}
      </button>
    )
  }

  return (
    <section className={startOpen ? className : `rounded-2xl border border-brand-600 bg-surface p-4 ${className}`} aria-live="polite">
      <div className={startOpen ? 'hidden' : 'flex items-center justify-between gap-2'}>
        <h2 className="flex items-center gap-2 font-semibold"><Mic className="size-5 text-brand-700" aria-hidden /> {t('voice.title')}</h2>
        <button type="button" aria-label={t('report.cancel')} onClick={close} className="grid min-h-10 min-w-10 place-items-center rounded-full text-muted"><X className="size-4" aria-hidden /></button>
      </div>
      <p className="mt-1 text-xs text-muted">{t('voice.examples')}</p>
      {!typing && <p className="mt-1 text-[11px] text-muted">{t('voice.privacy')}</p>}

      {phase.kind === 'listening' && (
        <div className="mt-3 flex items-center gap-3">
          <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-status-urgent-bg text-status-urgent"><Mic className="size-6" aria-hidden /><span className="absolute inset-0 animate-ping rounded-full bg-status-urgent/20" /></span>
          <p className="sensitive flex-1 text-sm">{text || t('voice.listening')}</p>
          <button type="button" onClick={() => stop.current()} aria-label={t('voice.stop')} className="grid min-h-11 min-w-11 place-items-center rounded-full border border-line"><Square className="size-4" aria-hidden /></button>
        </div>
      )}

      {(phase.kind === 'idle' || phase.kind === 'error') && (
        <div className="mt-3">
          {phase.kind === 'error' && <p role="alert" className="mb-2 rounded-xl bg-status-watch-bg px-3 py-2 text-sm text-status-watch">{t(`voice.errors.${phase.code}`, t('voice.errors.ai_unavailable'))}</p>}
          {typing ? (
            <div className="flex gap-2">
              <input className="sensitive min-h-12 flex-1 rounded-xl border border-line bg-surface px-3" value={text} placeholder={t('voice.typePlaceholder')} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void understand(text) }} />
              <button type="button" onClick={() => void understand(text)} className="min-h-12 rounded-xl bg-brand-700 px-4 font-medium text-white">{t('voice.go')}</button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={start} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-4 font-medium text-white"><Mic className="size-5" aria-hidden /> {t('voice.speak')}</button>
              <button type="button" onClick={() => setTyping(true)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line px-4 font-medium"><Keyboard className="size-5" aria-hidden /> {t('voice.type')}</button>
            </div>
          )}
        </div>
      )}

      {phase.kind === 'reading' && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" aria-hidden /> {t('voice.reading')}</p>}

      {phase.kind === 'confirm' && (
        <div className="mt-3">
          <p className="sensitive mb-2 text-xs text-muted">“{text}”</p>
          <p className="mb-2 text-sm font-medium">{t('voice.confirm')}</p>
          <ul className="flex flex-col gap-2">
            {phase.items.map((it, i) => (
              <li key={i}>
                <label className={`flex min-h-12 items-center gap-3 rounded-xl border px-3 ${savable(it) ? 'border-line' : 'border-dashed border-line text-muted'}`}>
                  <input type="checkbox" className="size-5 accent-brand-700" disabled={!savable(it)} checked={keep.has(i) && savable(it)}
                    onChange={(e) => { const k = new Set(keep); if (e.target.checked) k.add(i); else k.delete(i); setKeep(k) }} />
                  <span className="sensitive text-sm">{describe(it)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void save(phase.items)} disabled={!phase.items.some((it, i) => keep.has(i) && savable(it))}
              className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-brand-700 font-medium text-white disabled:opacity-40"><Check className="size-5" aria-hidden /> {t('voice.save')}</button>
            <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 rounded-xl border border-line px-4 font-medium">{t('voice.again')}</button>
          </div>
        </div>
      )}

      {phase.kind === 'done' && (
        <div className="mt-3">
          <p className="flex items-center gap-2 text-sm font-medium text-status-ok"><Check className="size-4" aria-hidden /> {t('voice.saved', { count: phase.saved })}</p>
          {phase.noDose.length > 0 && <p className="mt-1 text-sm text-status-watch">{t('voice.noDose', { medicine: phase.noDose.join(t('checkin.listSep')) })}</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => { setPhase({ kind: 'idle' }); setText(''); if (!typing) start() }} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium"><Mic className="size-4" aria-hidden /> {t('voice.more')}</button>
            <button type="button" onClick={close} className="min-h-11 rounded-xl px-4 text-sm font-medium text-muted">{t('voice.close')}</button>
          </div>
        </div>
      )}
    </section>
  )
}
