// Number input that works with Arabic keyboards: Arabic-Indic (٠١٢…) and
// Persian (۰۱۲…) digits become 0-9, and the Arabic decimal mark (٫) or a
// comma becomes a decimal point. Medical values are always stored in 0-9.

const ARABIC = '٠١٢٣٤٥٦٧٨٩'
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'

/** Converts digits to 0-9 and the Arabic decimal/thousands marks; leaves other text alone. */
export function toWesternDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/٫/g, '.')
    .replace(/٬/g, '')
}

/** For a number field as the user types: Western digits, one decimal point. */
export function normalizeNumberInput(s: string): string {
  return toWesternDigits(s).replace(/,/g, '.')
}

/** Parses a typed number (any digits); null when empty or not a number. */
export function parseNumber(s: string | null | undefined): number | null {
  const t = normalizeNumberInput(s ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}
