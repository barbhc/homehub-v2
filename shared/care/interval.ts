/**
 * Custom repeat intervals, in the units a person actually uses.
 *
 * HH-55 (Chris, beta round 6): "I want to do something like every two weeks but
 * that's not an option." He was right, and the reason is worth recording — the
 * DATA model has supported arbitrary intervals the whole time (`every_n_days`
 * plus `intervalDays`, with the due window already scaling proportionally). It
 * was only ever the pickers that didn't offer it, and the one that did called
 * it "Every N days" and asked for a number of days.
 *
 * The owner's instruction was to let the user customise rather than add a chip
 * per permutation, so this is the shared conversion: nobody says "every 14
 * days", they say "every 2 weeks", and both directions of that live here so the
 * review sheet and the task sheet cannot drift.
 *
 * Months are 30 days and years 365 — deliberately, and only as INPUT units.
 * Nothing here claims a calendar month; it is a way to say roughly-monthly
 * without typing 30, and `everyNDaysLabel` reads the same convention back.
 */

export type IntervalUnit = "days" | "weeks" | "months" | "years"

export const UNIT_DAYS: Record<IntervalUnit, number> = {
  days: 1, weeks: 7, months: 30, years: 365,
}

/** Longest interval we will accept, matching the existing input's ceiling. */
export const MAX_INTERVAL_DAYS = 3650

export function toDays(n: number, unit: IntervalUnit): number {
  const raw = Math.round(n) * UNIT_DAYS[unit]
  return Math.min(Math.max(raw, 1), MAX_INTERVAL_DAYS)
}

/**
 * Days back into the largest unit that divides them exactly.
 *
 * 14 → 2 weeks · 1825 → 5 years · 45 → 45 days. Mirrors `everyNDaysLabel`'s
 * rules on purpose: the value shown in the picker has to match the label the
 * rest of the app renders from the same number.
 */
export function splitInterval(days: number | null | undefined): { n: number; unit: IntervalUnit } {
  const d = days && days > 0 ? Math.round(days) : 14
  if (d % 365 === 0) return { n: d / 365, unit: "years" }
  if (d % 30 === 0) return { n: d / 30, unit: "months" }
  if (d % 7 === 0) return { n: d / 7, unit: "weeks" }
  return { n: d, unit: "days" }
}
