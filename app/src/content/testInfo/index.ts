import type { TestInfo } from './types'

export type { TestInfo }

type InfoTable = Record<string, TestInfo>
const loaded: Partial<Record<'en' | 'ar', Promise<InfoTable>>> = {}

/** Test explanations for one language, downloaded only when first needed. */
export function loadTestInfo(lang: string): Promise<InfoTable> {
  const key = lang === 'ar' ? 'ar' : 'en'
  loaded[key] ??= key === 'ar'
    ? import('./ar').then((m) => m.TEST_INFO_AR)
    : import('./en').then((m) => m.TEST_INFO_EN)
  return loaded[key]
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
