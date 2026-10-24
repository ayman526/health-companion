import { describe, expect, it } from 'vitest'
import { MEDICINES } from '../content/medicines'
import { normalizeMedicineName, suggestMedicines } from './medicineSearch'

const names = (q: string, own?: { name: string; generic: string }[]) => suggestMedicines(q, own).map((s) => s.name)

describe('medicine name suggestions', () => {
  it('suggests from the first letters, brand and generic', () => {
    expect(names('lipi')).toContain('Lipitor')
    expect(names('ator')[0]).toBe('Atorvastatin')
    expect(suggestMedicines('crest')[0]).toEqual({ name: 'Crestor', generic: 'Rosuvastatin', mine: false })
  })

  it('finds Egyptian brands and Arabic spellings', () => {
    expect(names('cata')).toContain('Cataflam')
    expect(names('كونكور')).toEqual(['Concor'])
    expect(names('جلوكو')).toContain('Glucophage')
    expect(names('اوجمنتين')).toContain('Augmentin')
  })

  it('matches words inside combination names', () => {
    expect(names('clavul')).toContain('Amoxicillin + Clavulanic acid')
  })

  it("puts the user's own medicines first", () => {
    expect(names('fic', [{ name: 'Fictostatin', generic: '' }])[0]).toBe('Fictostatin')
    expect(suggestMedicines('fic', [{ name: 'Fictostatin', generic: '' }])[0].mine).toBe(true)
  })

  it('needs 2 characters and never returns duplicates', () => {
    expect(names('a')).toEqual([])
    const all = names('in')
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('medicine list', () => {
  it('has no duplicate names', () => {
    const keys = MEDICINES.map(([n]) => normalizeMedicineName(n))
    expect(keys.filter((k, i) => keys.indexOf(k) !== i)).toEqual([])
  })

  it('every brand points to an active ingredient written in Latin letters', () => {
    for (const [name, generic] of MEDICINES) {
      if (generic) expect(generic, name).toMatch(/^[A-Za-z0-9 +().,-]+$/)
    }
  })

  it('never contains doses', () => {
    expect(MEDICINES.filter(([n, g]) => /\d+\s?(mg|mcg|ml|g|iu)\b/i.test(`${n} ${g}`))).toEqual([])
  })
})
