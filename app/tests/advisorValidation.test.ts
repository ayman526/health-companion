import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cleanCitations, numbersIn, safetyIssues, unverifiedNumbers, type AdvisorAnswer } from '../../supabase/functions/advisor/validate'

const base: AdvisorAnswer = {
  direct_answer: '', explanation: '', record_points: [], changes: '', uncertainties: '', next_steps: '',
  see_doctor: 'routine', warning_signs: '', proposed_facts: [], conversation_title: '', conversation_summary: '', language: 'en',
}
const ctx = JSON.stringify({ tests: [{ id: 'T1', results: [{ date: '2026-05-10', value: 279 }, { date: '2026-10-12', value: 63 }], latest_change: { change: -216, percent: -77.42 } }] })

describe('numbers in answers', () => {
  it('reads Western and Arabic digits, ignoring ISO dates', () => {
    expect(numbersIn('LDL went from 279 to ٦٣ on 2026-10-12')).toEqual([279, 63])
  })

  it('accepts numbers from the records, rounded forms and published thresholds', () => {
    const a = { ...base, direct_answer: 'LDL fell from 279 to 63 mg/dL (-216, about 77.4%), below the 190 threshold.' }
    expect(unverifiedNumbers(a, ctx, 'How has my LDL changed?')).toEqual([])
  })

  it('flags numbers that are not in the records', () => {
    const a = { ...base, direct_answer: 'Your LDL is now 85 mg/dL.' }
    expect(unverifiedNumbers(a, ctx, '')).toEqual([85])
  })
})

describe('safety checks', () => {
  it('blocks direct medication instructions', () => {
    expect(safetyIssues({ ...base, next_steps: 'Stop taking your statin for a week.' })[0].kind).toBe('medication_instruction')
    expect(safetyIssues({ ...base, next_steps: 'قلل الجرعة إلى النصف.' })[0].kind).toBe('medication_instruction')
  })

  it('allows deferring to a doctor or telling the user not to change anything', () => {
    expect(safetyIssues({ ...base, next_steps: "Don't stop your medicine without talking to your doctor." })).toEqual([])
    expect(safetyIssues({ ...base, next_steps: 'Ask your doctor whether to change the dose.' })).toEqual([])
    expect(safetyIssues({ ...base, next_steps: 'لا توقف الدواء قبل استشارة طبيبك.' })).toEqual([])
  })

  it('blocks a definite diagnosis but allows hedged statements', () => {
    expect(safetyIssues({ ...base, direct_answer: 'You have diabetes.' })[0].kind).toBe('diagnosis')
    expect(safetyIssues({ ...base, direct_answer: 'This result is in the range that may suggest diabetes; one result is not a diagnosis.' })).toEqual([])
  })
})

describe('citations', () => {
  it('drops references that are not in the context', () => {
    const { answer, dropped } = cleanCitations({ ...base, record_points: [{ text: 'x', refs: ['T1', 'R9'] }] }, new Set(['T1', 'R1']))
    expect(answer.record_points[0].refs).toEqual(['T1'])
    expect(dropped).toEqual(['R9'])
  })
})

it('the server emergency rules are identical to the app rules', () => {
  const app = readFileSync(resolve(__dirname, '../src/domain/emergency.ts'), 'utf8')
  const server = readFileSync(resolve(__dirname, '../../supabase/functions/advisor/emergency.ts'), 'utf8')
  expect(server.split('\n').slice(1).join('\n')).toBe(app)
})
