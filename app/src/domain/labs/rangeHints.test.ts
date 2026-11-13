import { describe, expect, it } from 'vitest'
import { LAB_TESTS } from './catalog'
import { TYPICAL_RANGES, suggestByRange } from './rangeHints'

describe('suggestions from the printed unit and range', () => {
  it('has a typical range for every numeric test (viral loads have none)', () => {
    const numeric = LAB_TESTS.filter((t) => !t.qualitative && !['hcv_rna', 'hbv_dna', 'urine_volume'].includes(t.code)).map((t) => t.code)
    expect(numeric.filter((c) => !TYPICAL_RANGES[c])).toEqual([])
    expect(Object.keys(TYPICAL_RANGES).filter((c) => !LAB_TESTS.some((t) => t.code === c))).toEqual([])
    for (const [low, high] of Object.values(TYPICAL_RANGES)) expect(low).toBeLessThan(high)
  })

  it('ranks the closest tests first', () => {
    expect(suggestByRange({ unit: 'mg/dL', refLow: 70, refHigh: 100 })[0]).toBe('glucose_fasting')
    expect(suggestByRange({ unit: 'U/L', refLow: 0, refHigh: 41 })).toEqual(expect.arrayContaining(['alt', 'ast']))
    expect(suggestByRange({ unit: '%', refLow: 4, refHigh: 5.6 })[0]).toBe('hba1c')
    expect(suggestByRange({ unit: 'mIU/L', refLow: 0.27, refHigh: 4.2 })[0]).toBe('tsh')
    expect(suggestByRange({ unit: 'mmol/L', refLow: 3.9, refHigh: 5.6 })[0]).toBe('glucose_fasting') // converts units
  })

  it('needs a unit and a range, and stays within 3', () => {
    expect(suggestByRange({ unit: '', refLow: 70, refHigh: 100 })).toEqual([])
    expect(suggestByRange({ unit: 'mg/dL', refLow: null, refHigh: null })).toEqual([])
    expect(suggestByRange({ unit: 'mg/dL', refLow: null, refHigh: 200 }).length).toBeLessThanOrEqual(3)
    expect(suggestByRange({ unit: 'furlongs', refLow: 1, refHigh: 2 })).toEqual([])
  })

  it('suggests nothing from blood for another sample', () => {
    expect(suggestByRange({ unit: 'mg/dL', refLow: 70, refHigh: 100, section: 'Semen analysis' })).toEqual([])
    expect(suggestByRange({ unit: '/HPF', refLow: 0, refHigh: 5, section: 'Urine Analysis' })).toEqual(['urine_pus', 'urine_rbc'])
  })
})
