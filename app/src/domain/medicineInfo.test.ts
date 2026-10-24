import { describe, expect, it } from 'vitest'
import { MEDICINES } from '../content/medicines'
import { MEDICINE_USES } from '../content/medicineUses'
import { cleanMedicineName, ingredientFor, medlinePlusDrugUrl, usesFor } from './medicineInfo'

describe('medicine uses', () => {
  it('every medicine in the suggestion list has a "used for" note in both languages', () => {
    const missing = MEDICINES.filter(([n, g]) => !usesFor(n, g || null, 'en') || !usesFor(n, g || null, 'ar')).map(([n]) => n)
    expect(missing).toEqual([])
  })

  it('brands use their ingredient; user-entered ingredients win', () => {
    expect(ingredientFor('Concor')).toBe('Bisoprolol')
    expect(usesFor('Concor', null, 'en')).toMatch(/blood pressure/)
    expect(usesFor('Cataflam', null, 'ar')).toMatch(/الألم/)
    expect(usesFor('My local brand', 'Atorvastatin', 'en')).toMatch(/LDL/)
    expect(usesFor('Unknown pill', null, 'en')).toBeNull()
  })

  it('notes never mention doses', () => {
    const all = Object.values(MEDICINE_USES).flat().join(' ')
    expect(all).not.toMatch(/\d+\s?(mg|mcg|ml|units?)\b/i)
  })

  it('links to MedlinePlus by generic name only', () => {
    expect(medlinePlusDrugUrl('Lipitor')).toContain('mainSearchCriteria.v.dn=Atorvastatin')
    expect(medlinePlusDrugUrl('Augmentin')).toContain('mainSearchCriteria.v.dn=Amoxicillin')
  })
})

describe('names as written on prescriptions', () => {
  it('ignores strength, units and form words', () => {
    expect(cleanMedicineName('Concor 5 mg tab')).toBe('concor')
    expect(cleanMedicineName('Glucophage 1000mg F.C. tablets')).toBe('glucophage')
    expect(cleanMedicineName('كونكور ٥ مجم قرص')).toBe('concor')
    expect(usesFor('Concor 5 mg tab', null, 'en')).toMatch(/blood pressure/)
    expect(usesFor('Augmentin 1 g', null, 'en')).toMatch(/infections/)
    expect(usesFor('Galvus Met 50/1000', null, 'en')).toMatch(/diabetes/)
    expect(usesFor('أوجمنتين ١ جم', null, 'ar')).toMatch(/عدوى/)
  })

  it('a strength in the ingredient field still matches', () => {
    expect(usesFor('X', 'Atorvastatin 20 mg', 'en')).toMatch(/LDL/)
  })
})
