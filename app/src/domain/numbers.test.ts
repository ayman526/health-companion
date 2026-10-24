import { describe, expect, it } from 'vitest'
import { normalizeNumberInput, parseNumber, toWesternDigits } from './numbers'
import { proposeSchedule, schedulePayload, validateSchedule } from './medications'

describe('Arabic digits', () => {
  it('converts Arabic-Indic and Persian digits and the Arabic decimal mark', () => {
    expect(toWesternDigits('٢٧٩')).toBe('279')
    expect(toWesternDigits('۱۲۳')).toBe('123')
    expect(normalizeNumberInput('٠٫٥')).toBe('0.5')
    expect(normalizeNumberInput('1,5')).toBe('1.5')
    expect(toWesternDigits('+٢٠١٠٠١٢٣٤٥٦٧')).toBe('+201001234567')
  })

  it('parses typed numbers in any digits', () => {
    expect(parseNumber('٢')).toBe(2)
    expect(parseNumber(' ٦٫٥ ')).toBe(6.5)
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('abc')).toBeNull()
  })

  it('medication doses typed in Arabic digits are valid and saved as numbers', () => {
    const { form } = proposeSchedule({ dose_amount: '1', times_per_day: '2' }, '2026-10-24')
    const arabic = { ...form, dose_amount: '٢', every_n_days: '' }
    expect(validateSchedule(arabic)).toEqual([])
    expect(schedulePayload(arabic, 'Africa/Cairo').dose_amount).toBe(2)
  })
})
