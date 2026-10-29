// Medical values always use Western digits, even in Arabic, to avoid
// misreading values. Dates use the Gregorian calendar.
function locale(lang: string) {
  return lang === 'ar' ? 'ar-EG-u-nu-latn-ca-gregory' : 'en-GB'
}

export function formatDate(date: Date | string, lang: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale(lang), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone,
  }).format(typeof date === 'string' ? new Date(date) : date)
}

/** "March 2027" from "2027-03-01" (a calendar month, so no time zone shift). */
export function formatMonth(isoDate: string, lang: string, month: 'long' | 'short' = 'long') {
  return new Intl.DateTimeFormat(locale(lang), { year: 'numeric', month, timeZone: 'UTC' }).format(new Date(`${isoDate.slice(0, 10)}T00:00:00Z`))
}

export function formatNumber(value: number, lang: string, maxFractionDigits = 2) {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: maxFractionDigits }).format(value)
}
