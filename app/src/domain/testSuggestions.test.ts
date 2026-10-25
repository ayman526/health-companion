import { describe, expect, it } from 'vitest'
import { addMonths, suggestCheckups, type SuggestionInput } from './testSuggestions'

const base = (over: Partial<SuggestionInput> = {}): SuggestionInput => ({
  today: '2026-10-24', latest: new Map(), medications: [], conditions: [], remindedTests: new Set(), decided: new Set(), ...over,
})
const statin = (start: string) => ({ name: 'Fictostatin', ingredient: 'Atorvastatin', active: true, regimenStarts: [start] })

describe('suggested checkups', () => {
  it('cholesterol medicine started: first check 4–12 weeks later (8 weeks proposed)', () => {
    const [s] = suggestCheckups(base({ today: '2026-06-10', medications: [statin('2026-06-01')], latest: new Map([['ldl_c', { date: '2026-05-10', value: 279 }]]) }))
    expect(s).toMatchObject({ rule: 'statin_first_check', due: '2026-07-27', overdue: false, interval: 'weeks4to12', basis: { kind: 'medication', date: '2026-06-01' } })
  })

  it('cholesterol checked after starting: next check 6 months after the last one', () => {
    const [s] = suggestCheckups(base({ medications: [statin('2026-06-01')], latest: new Map([['ldl_c', { date: '2026-10-12', value: 63 }]]) }))
    expect(s).toMatchObject({ rule: 'statin_routine', due: '2027-04-12', interval: 'months3to12' })
  })

  it('an overdue checkup is proposed for next week and marked overdue', () => {
    const s = suggestCheckups(base({ latest: new Map([['hba1c', { date: '2025-03-14', value: 6.0 }]]) }))
    expect(s).toEqual([expect.objectContaining({ rule: 'a1c_prediabetes', overdue: true, due: '2026-10-31', basis: { kind: 'last_test', date: '2025-03-14' } })])
  })

  it('diabetes: HbA1c every 3 months when above 7%, kidney checks yearly', () => {
    const s = suggestCheckups(base({ latest: new Map([['hba1c', { date: '2026-09-01', value: 7.8 }], ['egfr', { date: '2026-01-15', value: 85 }]]) }))
    expect(s.map((x) => [x.rule, x.due])).toEqual([
      ['kidney_diabetes_acr', '2026-10-31'], // never tested → soon
      ['a1c_diabetes', '2026-12-01'],
      ['kidney_diabetes_egfr', '2027-01-15'],
    ])
  })

  it('diabetes at goal and stable: HbA1c every 6 months', () => {
    const s = suggestCheckups(base({
      latest: new Map([['hba1c', { date: '2026-09-01', value: 6.6 }]]),
      medications: [{ name: 'Glucophage', ingredient: 'Metformin', active: true, regimenStarts: ['2025-01-01'] }],
    }))
    expect(s.find((x) => x.rule === 'a1c_diabetes')).toMatchObject({ due: '2027-03-01', interval: 'months6' })
  })

  it('a GLP-1 medicine alone does not imply diabetes', () => {
    const s = suggestCheckups(base({ medications: [{ name: 'Fictoglutide', ingredient: 'Semaglutide', active: true, regimenStarts: ['2026-01-01'] }] }))
    expect(s).toEqual([])
  })

  it('thyroid medicine: TSH 6–8 weeks after a dose change', () => {
    const [s] = suggestCheckups(base({
      today: '2026-09-15',
      medications: [{ name: 'Eltroxin', ingredient: 'Levothyroxine', active: true, regimenStarts: ['2026-01-01', '2026-09-01'] }],
      latest: new Map([['tsh', { date: '2026-08-20', value: 6.1 }]]),
    }))
    expect(s).toMatchObject({ rule: 'tsh_dose_check', due: '2026-10-20', interval: 'weeks6to8' })
  })

  it('does not suggest what is already reminded or already decided', () => {
    const latest = new Map([['hba1c', { date: '2026-09-01', value: 6.0 }]])
    const first = suggestCheckups(base({ latest }))
    expect(first).toHaveLength(1)
    expect(suggestCheckups(base({ latest, decided: new Set([first[0].key]) }))).toEqual([])
    expect(suggestCheckups(base({ latest, remindedTests: new Set(['hba1c']) }))).toEqual([])
  })

  it('a newer result gives a fresh suggestion even after an earlier one was dismissed', () => {
    const old = suggestCheckups(base({ latest: new Map([['hba1c', { date: '2026-03-01', value: 6.0 }]]) }))[0]
    const fresh = suggestCheckups(base({ latest: new Map([['hba1c', { date: '2026-09-01', value: 6.1 }]]), decided: new Set([old.key]) }))
    expect(fresh).toHaveLength(1)
  })

  it('nothing to suggest without a relevant condition, result or medicine', () => {
    expect(suggestCheckups(base({ latest: new Map([['ldl_c', { date: '2026-05-10', value: 120 }]]) }))).toEqual([])
  })

  it('adds months safely at month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28')
  })
})

describe('age-based screening', () => {
  const person = (age: number, sex: string | null, smoking: string | null = 'never') => ({ age, sex, smoking, bmi: null })
  const rules = (over: Partial<SuggestionInput>) => suggestCheckups(base(over)).map((s) => s.rule)

  it('suggests nothing without age, or under 18', () => {
    expect(rules({})).toEqual([])
    expect(rules({ person: person(16, 'female') })).toEqual([])
  })

  it('follows age and sex for a 52-year-old woman with no records', () => {
    const r = rules({ person: person(52, 'female') })
    expect(r).toEqual(expect.arrayContaining(['screen_bp', 'screen_lipids', 'screen_diabetes', 'screen_hcv', 'screen_colorectal', 'screen_breast', 'screen_cervical']))
    expect(r).not.toContain('screen_aaa')
    expect(r).not.toContain('screen_osteoporosis')
  })

  it('suggests AAA and lung screening only for older men who have smoked', () => {
    expect(rules({ person: person(68, 'male', 'former') })).toEqual(expect.arrayContaining(['screen_aaa', 'screen_lung']))
    expect(rules({ person: person(68, 'male', 'never') })).not.toContain('screen_aaa')
  })

  it('waits until the next one is due after a recent test or a test marked done', () => {
    const latest = new Map([['ldl_c', { date: '2025-01-10', value: 120 }], ['hcv_ab', { date: '2019-05-01', value: 0 }]])
    const done = new Map([['screen_colorectal', { date: '2022-06-01', months: 120 }]])
    const r = rules({ person: person(50, 'male'), latest, done, lastBpReading: '2026-09-01' })
    expect(r).not.toContain('screen_lipids') // next one in 2030
    expect(r).not.toContain('screen_hcv') // once is enough
    expect(r).not.toContain('screen_colorectal') // colonoscopy done in 2022
    expect(r).not.toContain('screen_bp') // measured last month
  })

  it("doesn't repeat checkups that a condition's own rule already covers", () => {
    const r = rules({ person: person(55, 'male'), conditions: ['Type 2 diabetes', 'High blood pressure'] })
    expect(r.filter((x) => x === 'a1c_diabetes' || x === 'screen_diabetes')).toEqual(['a1c_diabetes'])
    expect(r).not.toContain('screen_bp')
  })
})
