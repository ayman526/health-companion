import { describe, expect, it } from 'vitest'
import { CONDITION_OPTIONS, askPregnancy, bmi, optionKey } from './profileOptions'

describe('profile options', () => {
  it('finds the translation key for a stored name, case-insensitively', () => {
    expect(optionKey(CONDITION_OPTIONS, 'high blood pressure')).toBe('hypertension')
    expect(optionKey(CONDITION_OPTIONS, 'Something else')).toBeNull()
  })

  it('asks about pregnancy only when it can apply', () => {
    expect(askPregnancy('female', '1990-05-01', '2026-10-24')).toBe(true)
    expect(askPregnancy('male', '1990-05-01', '2026-10-24')).toBe(false)
    expect(askPregnancy('female', '1950-05-01', '2026-10-24')).toBe(false)
    expect(askPregnancy(null, null, '2026-10-24')).toBe(true)
  })

  it('calculates BMI', () => {
    expect(bmi(175, 80)).toBe(26.1)
    expect(bmi(null, 80)).toBeNull()
  })

  it('stored condition names contain the words the suggestion rules look for', () => {
    expect(CONDITION_OPTIONS.diabetes.toLowerCase()).toContain('diabet')
  })
})
