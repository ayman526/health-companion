import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { addVital, loadCheckIns, saveCheckIn, type NewReading } from './daily'
import { loadDosesBetween, localDayBounds, logDose, todayIn } from './medications'
import { fToC, mmolToMg, type GlucoseContext } from '../domain/vitals'
import { normalizeNumberInput } from '../domain/numbers'
import { track } from './usage'

// Voice logging: the phone's own speech recognition turns speech into text
// (no audio leaves the phone for this), the parse-voice function turns the
// text into entries, and the person confirms them before anything is saved.

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

const w = typeof window === 'undefined' ? undefined : (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition

export const speechSupported = !!Ctor

/** Listens until the person stops talking; calls back with the text so far. */
export function listen(lang: string, onText: (text: string, final: boolean) => void, onError: (code: string) => void): () => void {
  if (!Ctor) {
    onError('unsupported')
    return () => {}
  }
  const r = new Ctor()
  r.lang = lang === 'ar' ? 'ar-EG' : 'en-US'
  r.interimResults = true
  r.continuous = false
  let text = ''
  r.onresult = (e) => {
    text = Array.from(e.results).map((res) => res[0].transcript).join(' ')
    onText(text, Array.from(e.results).every((res) => res.isFinal))
  }
  r.onerror = (e) => onError(e.error)
  r.onend = () => onText(text, true)
  r.start()
  return () => r.stop()
}

export interface VoiceItem {
  type: 'blood_pressure' | 'glucose' | 'weight' | 'heart_rate' | 'oxygen' | 'temperature' | 'dose_taken' | 'life_change' | 'symptom' | 'mood'
  systolic: string; diastolic: string; pulse: string
  glucose: string; glucose_unit: 'mg/dL' | 'mmol/L' | 'none'; glucose_context: GlucoseContext | 'none'
  weight: string; weight_unit: 'kg' | 'lb' | 'none'
  spo2: string; temperature: string; temperature_unit: 'C' | 'F' | 'none'
  medicine: string
  life_category: string; life_title: string
  symptom: string; mood: number
  when: 'now' | 'this_morning' | 'earlier_today' | 'yesterday'
}

export async function parseVoice(text: string, medicines: string[]): Promise<{ items: VoiceItem[]; not_understood: boolean } | { error: string }> {
  if (!supabase) return { error: 'no_backend' }
  const { data, error } = await supabase.functions.invoke('parse-voice', { body: { text: normalizeNumberInput(text), medicines } })
  if (error) {
    const code = error instanceof FunctionsHttpError ? (await error.context.json().catch(() => ({}))).error : null
    return { error: code ?? 'ai_unavailable' }
  }
  return data
}

const num = (s: string) => {
  const v = Number(String(s).replace(',', '.'))
  return s !== '' && Number.isFinite(v) ? v : null
}

function when(w: VoiceItem['when']): Date {
  const d = new Date()
  if (w === 'yesterday') d.setDate(d.getDate() - 1)
  if (w === 'earlier_today') d.setHours(d.getHours() - 2)
  if (w === 'this_morning') d.setHours(8, 0, 0, 0)
  return d
}

/** The reading an item describes, or null if a number is missing or implausible. */
export function toReading(it: VoiceItem): NewReading | null {
  if (it.type === 'blood_pressure') {
    const s = num(it.systolic), d = num(it.diastolic)
    return s && d && s > d && s <= 300 && d >= 30 ? { kind: 'blood_pressure', systolic: Math.round(s), diastolic: Math.round(d), pulse: num(it.pulse) ? Math.round(num(it.pulse)!) : null } : null
  }
  if (it.type === 'glucose') {
    const g = num(it.glucose)
    if (!g) return null
    const mg = it.glucose_unit === 'mmol/L' ? mmolToMg(g) : Math.round(g)
    return mg >= 10 && mg <= 1000 ? { kind: 'glucose', glucose_mg_dl: mg, glucose_context: it.glucose_context === 'none' ? 'random' : it.glucose_context } : null
  }
  if (it.type === 'weight') {
    const w = num(it.weight)
    const kg = w && (it.weight_unit === 'lb' ? Math.round(w * 0.4536 * 10) / 10 : w)
    return kg && kg >= 2 && kg <= 400 ? { kind: 'weight', weight_kg: kg } : null
  }
  if (it.type === 'heart_rate') {
    const p = num(it.pulse)
    return p && p >= 20 && p <= 250 ? { kind: 'heart_rate', pulse: Math.round(p) } : null
  }
  if (it.type === 'oxygen') {
    const o = num(it.spo2)
    return o && o >= 50 && o <= 100 ? { kind: 'oxygen', spo2: Math.round(o), pulse: num(it.pulse) ? Math.round(num(it.pulse)!) : null } : null
  }
  if (it.type === 'temperature') {
    const t = num(it.temperature)
    const c = t && (it.temperature_unit === 'F' ? fToC(t) : Math.round(t * 10) / 10)
    return c && c >= 30 && c <= 45 ? { kind: 'temperature', temperature_c: c } : null
  }
  return null
}

/** Saves the confirmed items. Returns how many were saved and any medicine with no dose due today. */
export async function saveVoiceItems(profileId: string, timeZone: string, items: VoiceItem[]): Promise<{ saved: number; noDose: string[] }> {
  if (!supabase) return { saved: 0, noDose: [] }
  let saved = 0
  const noDose: string[] = []
  const today = todayIn(timeZone)

  for (const it of items) {
    const reading = toReading(it)
    if (reading && await addVital(profileId, reading, when(it.when).toISOString(), '')) saved++
  }

  const doses = items.filter((i) => i.type === 'dose_taken' && i.medicine)
  if (doses.length) {
    const { start, end } = localDayBounds(timeZone)
    const todays = await loadDosesBetween(start, end)
    for (const it of doses) {
      const due = todays.find((d) => d.medication_schedules.medications.brand_name === it.medicine && (d.status === 'pending' || d.status === 'snoozed'))
      if (due && await logDose(due.id, 'taken')) saved++
      else noDose.push(it.medicine)
    }
  }

  for (const it of items.filter((i) => i.type === 'life_change' && i.life_title.trim())) {
    const { error } = await supabase.from('lifestyle_events').insert({
      profile_id: profileId, category: it.life_category === 'none' ? 'other' : it.life_category, title: it.life_title.trim().slice(0, 200), started_on: today,
    })
    if (!error) saved++
  }

  const symptoms = items.filter((i) => i.type === 'symptom' && i.symptom !== 'none').map((i) => i.symptom)
  const mood = items.find((i) => i.type === 'mood' && i.mood >= 1 && i.mood <= 5)?.mood ?? null
  if (symptoms.length || mood) {
    const current = (await loadCheckIns(1)).find((c) => c.day === today) ?? { day: today, mood: null, sleep_hours: null, symptoms: [], note: null }
    if (await saveCheckIn(profileId, { ...current, mood: mood ?? current.mood, symptoms: [...new Set([...current.symptoms, ...symptoms])] })) saved += symptoms.length + (mood ? 1 : 0)
  }
  if (saved) track('voice_saved')
  return { saved, noDose }
}
