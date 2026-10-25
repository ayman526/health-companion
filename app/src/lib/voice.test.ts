import { describe, expect, it } from 'vitest'
import { toReading, type VoiceItem } from './voice'

const item = (o: Partial<VoiceItem>): VoiceItem => ({
  type: 'blood_pressure', systolic: '', diastolic: '', pulse: '', glucose: '', glucose_unit: 'none', glucose_context: 'none',
  weight: '', weight_unit: 'none', spo2: '', temperature: '', temperature_unit: 'none', medicine: '', life_category: 'none',
  life_title: '', symptom: 'none', mood: 0, when: 'now', ...o,
})

describe('voice entries to readings', () => {
  it('turns spoken values into readings, converting units', () => {
    expect(toReading(item({ systolic: '130', diastolic: '85', pulse: '72' }))).toEqual({ kind: 'blood_pressure', systolic: 130, diastolic: 85, pulse: 72 })
    expect(toReading(item({ type: 'glucose', glucose: '6.1', glucose_unit: 'mmol/L', glucose_context: 'fasting' }))).toEqual({ kind: 'glucose', glucose_mg_dl: 110, glucose_context: 'fasting' })
    expect(toReading(item({ type: 'weight', weight: '176', weight_unit: 'lb' }))).toEqual({ kind: 'weight', weight_kg: 79.8 })
    expect(toReading(item({ type: 'temperature', temperature: '101.2', temperature_unit: 'F' }))).toEqual({ kind: 'temperature', temperature_c: 38.4 })
  })
  it('refuses missing or impossible values instead of guessing', () => {
    expect(toReading(item({ systolic: '130' }))).toBeNull()
    expect(toReading(item({ systolic: '80', diastolic: '130' }))).toBeNull()
    expect(toReading(item({ type: 'oxygen', spo2: '140' }))).toBeNull()
    expect(toReading(item({ type: 'dose_taken', medicine: 'Concor' }))).toBeNull()
  })
})
