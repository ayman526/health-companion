import { describe, expect, it } from 'vitest'
import { adherenceSummary, formatDose, proposeSchedule, schedulePayload, splitDoseUnit, suggestTimes, validateSchedule } from './medications'

const start = '2026-10-24'

describe('schedules proposed from a prescription', () => {
  it('"1×3 after meals for a week" becomes 1 unit, 3 times a day, 7 days, times left for the user to check', () => {
    const { form, check } = proposeSchedule({ name_as_written: 'Fictomox 500', dose_amount: '1', dose_unit: 'capsule', times_per_day: '3', duration_days: '7', timing: 'after_meals' }, start)
    expect(form).toMatchObject({ dose_amount: '1', frequency: 'daily', times_of_day: ['08:00', '14:00', '20:00'], valid_to: '2026-10-30' })
    expect(check).toEqual(['times_of_day'])
  })

  it('never invents a dose or frequency that is not written', () => {
    const { form, check } = proposeSchedule({ name_as_written: 'Fictostatin 20' }, start)
    expect(form.dose_amount).toBe('')
    expect(check).toEqual(expect.arrayContaining(['dose_amount', 'times_per_day', 'times_of_day']))
    expect(validateSchedule(form)).toContain('dose_amount')
  })

  it('as needed (PRN / عند اللزوم) has no clock times and no reminders', () => {
    const { form } = proposeSchedule({ name_as_written: 'Fictofen', dose_amount: '1', as_needed: true }, start)
    expect(form).toMatchObject({ frequency: 'as_needed', times_of_day: [], reminders_enabled: false })
    expect(validateSchedule(form)).toEqual([])
    expect(schedulePayload(form, 'Africa/Cairo').times_of_day).toEqual([])
  })

  it('weekly and every-other-day schedules', () => {
    expect(proposeSchedule({ dose_amount: '1', every_n_days: '7' }, start).form.frequency).toBe('weekly')
    const alt = proposeSchedule({ dose_amount: '1', every_n_days: '2' }, start).form
    expect(alt).toMatchObject({ frequency: 'every_n_days', every_n_days: '2' })
  })

  it('carries over what the reader was unsure about', () => {
    const { check } = proposeSchedule({ dose_amount: '1', times_per_day: '2', uncertain_fields: ['strength'] }, start)
    expect(check).toContain('strength')
  })

  it('suggests bedtime for a single bedtime dose', () => {
    expect(suggestTimes(1, 'bedtime')).toEqual(['22:00'])
  })
})

describe('adherence', () => {
  it('counts self-reported doses and never treats "not recorded" as missed', () => {
    const now = new Date('2026-10-24T12:00:00Z')
    const s = adherenceSummary([
      { scheduled_for: '2026-10-20T09:00:00Z', status: 'taken' },
      { scheduled_for: '2026-10-21T09:00:00Z', status: 'taken' },
      { scheduled_for: '2026-10-22T09:00:00Z', status: 'skipped' },
      { scheduled_for: '2026-10-23T09:00:00Z', status: 'not_recorded' },
      { scheduled_for: '2026-10-25T09:00:00Z', status: 'pending' },
    ], now)
    expect(s).toEqual({ taken: 2, skipped: 1, notRecorded: 1, total: 4, takenOfRecorded: 67 })
  })
})

describe('dose amount and unit', () => {
  it("doesn't repeat an amount the unit already contains", () => {
    expect(formatDose(1, '1 قرص')).toBe('1 قرص')
    expect(formatDose('2', 'drops')).toBe('2 drops')
    expect(formatDose(null, '1 قرص')).toBe('')
    expect(splitDoseUnit('', '٢ نقطة')).toEqual({ amount: '2', unit: 'نقطة' })
    expect(splitDoseUnit('1', 'tablet')).toEqual({ amount: '1', unit: 'tablet' })
  })
})
