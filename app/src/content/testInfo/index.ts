import { TEST_INFO_AR } from './ar'
import { TEST_INFO_EN } from './en'
import type { TestInfo } from './types'

export type { TestInfo }

export function getTestInfo(code: string, lang: string): TestInfo | undefined {
  return (lang === 'ar' ? TEST_INFO_AR : TEST_INFO_EN)[code]
}

/**
 * NIH MedlinePlus Connect page for a LOINC code. Only the test code is sent,
 * never personal data (SPEC §10). MedlinePlus is available in English and Spanish.
 */
export function medlinePlusUrl(loinc: string): string {
  const q = new URLSearchParams({
    'mainSearchCriteria.v.cs': '2.16.840.1.113883.6.1', // LOINC code system
    'mainSearchCriteria.v.c': loinc,
    'informationRecipient.languageCode.c': 'en',
  })
  return `https://connect.medlineplus.gov/application?${q}`
}
