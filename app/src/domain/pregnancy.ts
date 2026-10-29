/**
 * Where a pregnancy is, from the due month alone (no exact date, no last
 * period). We take the middle of the month as the due date, so the week can be
 * about two weeks off; the app only says "about week N".
 */

export interface PregnancyProgress {
  week: number
  /** 1 to 9 */
  month: number
  trimester: 1 | 2 | 3
  /** The due month is over: time to ask if the baby has arrived. */
  pastDue: boolean
}

const DAY = 86_400_000
const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** "2027-03" or "2027-03-01" → "2027-03-01". */
export function firstOfMonth(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** The months someone can be due in: this month and the next nine. */
export function dueMonthOptions(today: string): string[] {
  const [y, m] = today.split('-').map(Number)
  return Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 + i, 1))
    return d.toISOString().slice(0, 10)
  })
}

export function pregnancyProgress(dueMonth: string, today: string): PregnancyProgress {
  const due = toUtc(dueMonth) + 14 * DAY
  const [y, m] = dueMonth.split('-').map(Number)
  const endOfMonth = Date.UTC(y, m, 1)
  const now = toUtc(today)
  const weeksLeft = Math.round((due - now) / (7 * DAY))
  const week = Math.min(42, Math.max(1, 40 - weeksLeft))
  const month = Math.min(9, Math.max(1, Math.ceil(week / 4.45)))
  const trimester = week <= 13 ? 1 : week <= 27 ? 2 : 3
  return { week, month, trimester, pastDue: now >= endOfMonth }
}

/** Icons for the two tips of each month (the text is in i18n: pregnancy.tips.m1.a…). */
export const TIP_ICONS: Record<number, [TipIcon, TipIcon]> = {
  1: ['pill', 'test'],
  2: ['scan', 'file'],
  3: ['heart', 'calendar'],
  4: ['baby', 'test'],
  5: ['scan', 'calendar'],
  6: ['test', 'test'],
  7: ['calendar', 'baby'],
  8: ['bag', 'file'],
  9: ['calendar', 'phone'],
}
export type TipIcon = 'pill' | 'test' | 'scan' | 'file' | 'heart' | 'calendar' | 'baby' | 'bag' | 'phone'
