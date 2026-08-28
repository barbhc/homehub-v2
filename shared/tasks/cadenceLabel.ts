/**
 * Human cadence labels.
 *
 * Written because the review wizard showed a task literally captioned
 * "Repeats every_n_days" — the raw enum, leaked to the user, on a task whose own
 * description said "replace after 5 years". Two separate failures: the wizard's
 * label map had no entry for `every_n_days` and fell through to the enum name,
 * and the one place that DID handle it rendered "Every 1825 days", which is
 * technically true and useless.
 *
 * Shared so the wizard, the item page and anything later all say the same thing.
 */

export const CADENCE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Yearly",
  // Adjective, like every other label here. "Seasonally" was the one
  // adverb in a column of adjectives, and round 18 put these in a chip
  // column where they line up and the odd one out is visible.
  seasonal: "Seasonal",
  setup: "One-time setup",
  as_needed: "When needed",
  after_each_use: "After each use",
}

/** 1825 days is "every 5 years", not "every 1825 days". */
export function everyNDaysLabel(days: number | null | undefined): string {
  if (!days || days <= 0) return "Every so often"
  const unit = (n: number, one: string, many: string) => (n === 1 ? `Every ${one}` : `Every ${n} ${many}`)
  if (days % 365 === 0) return unit(days / 365, "year", "years")
  if (days % 30 === 0) return unit(days / 30, "month", "months")
  if (days % 7 === 0) return unit(days / 7, "week", "weeks")
  return unit(days, "day", "days")
}

/** The label to show for a task's cadence. Never returns a raw enum. */
export function cadenceLabel(scheduleType: string | null | undefined, intervalDays?: number | null): string {
  if (!scheduleType) return "When needed"
  if (scheduleType === "every_n_days") return everyNDaysLabel(intervalDays)
  return (
    CADENCE_LABELS[scheduleType] ??
    // Anything unrecognised still reads as words rather than snake_case.
    scheduleType.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  )
}

/** Lower-case form for mid-sentence use ("From the manual · every 5 years"). */
export function cadenceLabelInline(scheduleType: string | null | undefined, intervalDays?: number | null): string {
  const l = cadenceLabel(scheduleType, intervalDays)
  return l.charAt(0).toLowerCase() + l.slice(1)
}
