/**
 * Month-grid maths for the purchase-date picker.
 *
 * Kept as pure number/string work on purpose. `new Date("2024-03-14")` parses
 * as UTC midnight, so in every timezone west of Greenwich `.getDate()` returns
 * the 13th — the classic off-by-one that turns a purchase date into the day
 * before it every time the page reloads. Nothing here ever constructs a local
 * Date from a stored string; day-of-week comes from `Date.UTC`, which is
 * timezone-free by definition.
 *
 * ISO dates are `YYYY-MM-DD` throughout, matching `ItemUnit.purchase_date`.
 */

export interface DayCell {
  /** ISO date, always a real day — grid padding uses neighbouring months. */
  iso: string
  day: number
  /** False for the leading/trailing days borrowed from the adjacent month. */
  inMonth: boolean
}

const pad = (n: number) => String(n).padStart(2, "0")

export const toIso = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`

/** Days in a month. `month` is 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Weekday of the 1st, 0 = Monday … 6 = Sunday (the grid starts on Monday). */
export function firstWeekdayMondayFirst(year: number, month: number): number {
  const sundayFirst = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return (sundayFirst + 6) % 7
}

/** Parse `YYYY-MM-DD` without touching local time. Null on anything else. */
export function parseIso(iso: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!iso) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

/** Step a year/month pair by whole months, rolling the year over. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + by
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 }
}

/**
 * Six weeks of cells, Monday-first, padded from the neighbouring months so the
 * grid never changes height as you page through it — a calendar that reflows
 * between a 4-row and a 6-row month makes the buttons move under your thumb.
 */
export function monthGrid(year: number, month: number): DayCell[] {
  const lead = firstWeekdayMondayFirst(year, month)
  const count = daysInMonth(year, month)
  const prev = shiftMonth(year, month, -1)
  const prevCount = daysInMonth(prev.year, prev.month)
  const next = shiftMonth(year, month, 1)

  const cells: DayCell[] = []
  for (let i = lead; i > 0; i--) {
    const day = prevCount - i + 1
    cells.push({ iso: toIso(prev.year, prev.month, day), day, inMonth: false })
  }
  for (let day = 1; day <= count; day++) {
    cells.push({ iso: toIso(year, month, day), day, inMonth: true })
  }
  let day = 1
  while (cells.length < 42) {
    cells.push({ iso: toIso(next.year, next.month, day), day, inMonth: false })
    day++
  }
  return cells
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export const monthLabel = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`

/** "14 Mar 2024" — the field's display value. Empty string when unset. */
export function formatIsoShort(iso: string | null | undefined): string {
  const parsed = parseIso(iso)
  if (!parsed) return ""
  return `${parsed.day} ${MONTHS[parsed.month - 1].slice(0, 3)} ${parsed.year}`
}
