import { describe, expect, it } from 'vitest'
import { LAB_TESTS } from '../../domain/labs/catalog'
import { TEST_INFO_AR } from './ar'
import { TEST_INFO_EN } from './en'
import { medlinePlusUrl } from '.'

describe('test education content', () => {
  for (const [lang, content] of [['en', TEST_INFO_EN], ['ar', TEST_INFO_AR]] as const) {
    it(`covers every catalog test in ${lang}`, () => {
      const missing = LAB_TESTS.filter((t) => {
        const i = content[t.code]
        if (!i?.about || !i.helps) return true
        return t.qualitative ? !i.positive : !i.high || !i.low
      }).map((t) => t.code)
      expect(missing).toEqual([])
      expect(Object.keys(content).filter((k) => !LAB_TESTS.some((t) => t.code === k))).toEqual([])
    })
  }

  it('never tells users to change a dose on their own', () => {
    const text = JSON.stringify([TEST_INFO_EN, TEST_INFO_AR]).toLowerCase()
    expect(text).not.toMatch(/(increase|double|stop taking|reduce) (your )?(dose|medicine|medication)/)
  })

  it('links to MedlinePlus by test code only', () => {
    const url = medlinePlusUrl('13457-7')
    expect(url).toContain('connect.medlineplus.gov/application')
    expect(url).toContain('mainSearchCriteria.v.c=13457-7')
  })
})
