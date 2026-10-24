import { describe, expect, it } from 'vitest'
import { changesBetween } from './lifestyle'

describe('changes during a period', () => {
  it('lists medicine starts, dose changes, stops and life changes between two results', () => {
    const changes = changesBetween('2026-05-10', '2026-10-12',
      [
        { name: 'Fictostatin', active: true, regimens: [{ from: '2026-06-01', to: '2026-08-31' }, { from: '2026-09-01', to: null }] },
        { name: 'Oldmed', active: false, regimens: [{ from: '2025-01-01', to: '2026-07-15' }] },
        { name: 'Later', active: true, regimens: [{ from: '2026-10-20', to: null }] },
      ],
      [
        { id: 'l1', category: 'exercise', title: 'Started running', details: null, started_on: '2026-06-03', ended_on: null },
        { id: 'l2', category: 'diet', title: 'Low sugar', details: null, started_on: '2026-02-01', ended_on: '2026-08-01' },
      ])
    expect(changes.map((c) => [c.date, c.kind, c.label])).toEqual([
      ['2026-06-01', 'medication_started', 'Fictostatin'],
      ['2026-06-03', 'lifestyle_started', 'Started running'],
      ['2026-07-15', 'medication_stopped', 'Oldmed'],
      ['2026-08-01', 'lifestyle_ended', 'Low sugar'],
      ['2026-09-01', 'medication_changed', 'Fictostatin'],
    ])
  })
})
