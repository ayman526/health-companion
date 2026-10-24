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

export function formatNumber(value: number, lang: string, maxFractionDigits = 2) {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: maxFractionDigits }).format(value)
}
