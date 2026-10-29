import { describe, expect, it } from 'vitest'
import { dueMonthOptions, firstOfMonth, pregnancyProgress } from './pregnancy'

describe('pregnancy', () => {
  it('offers this month and the next nine', () => {
    const months = dueMonthOptions('2026-10-29')
    expect(months).toHaveLength(10)
    expect(months[0]).toBe('2026-10-01')
    expect(months[3]).toBe('2027-01-01')
    expect(months[9]).toBe('2027-07-01')
  })

  it('works out about which week and month', () => {
    expect(pregnancyProgress('2027-03-01', '2026-10-29')).toEqual({ week: 20, month: 5, trimester: 2, pastDue: false })
    expect(pregnancyProgress('2027-07-01', '2026-10-29')).toMatchObject({ week: 3, month: 1, trimester: 1 })
    expect(pregnancyProgress('2026-11-01', '2026-10-29')).toMatchObject({ month: 9, trimester: 3 })
  })

  it('stays within weeks 1 to 42', () => {
    expect(pregnancyProgress('2027-12-01', '2026-10-29').week).toBe(1)
    expect(pregnancyProgress('2026-06-01', '2026-10-29')).toMatchObject({ week: 42, month: 9 })
  })

  it('asks about the baby once the due month is over', () => {
    expect(pregnancyProgress('2026-10-01', '2026-10-31').pastDue).toBe(false)
    expect(pregnancyProgress('2026-10-01', '2026-11-01').pastDue).toBe(true)
  })

  it('stores the first of the month', () => {
    expect(firstOfMonth('2027-03')).toBe('2027-03-01')
    expect(firstOfMonth('2027-03-15')).toBe('2027-03-01')
  })
})
