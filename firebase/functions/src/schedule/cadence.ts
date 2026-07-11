/**
 * Pure recurring-cadence math, shared by the roll-forward scheduler (Phase 4)
 * and completeTask (Phase 5). Mirrors v1 migration 20260701000002's roll-forward
 * cadence map. Calendar dates are "YYYY-MM-DD" strings (firestore-model.md §0).
 *
 * Non-recurring types (after_each_use / as_needed / seasonal / setup) return null
 * → the caller leaves the instance where it is (a genuinely lapsed one-off keeps
 * its real overdue date; seasonal re-anchoring is handled elsewhere).
 */
export type ScheduleType =
  | "after_each_use"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semiannual"
  | "annual"
  | "seasonal"
  | "every_n_days"
  | "as_needed"
  | "setup"

/** Parse a "YYYY-MM-DD" string to a UTC Date at midnight. */
function parseYmd(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`)
}
function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return toYmd(d)
}
function addMonths(ymd: string, months: number): string {
  const d = parseYmd(ymd)
  d.setUTCMonth(d.getUTCMonth() + months)
  return toYmd(d)
}

/**
 * Next due date for a recurring cadence, computed FROM `from` (usually today for
 * roll-forward, or the completion date for completeTask). Returns null for
 * non-recurring types.
 */
export function addCadence(from: string, scheduleType: ScheduleType, intervalDays: number | null): string | null {
  switch (scheduleType) {
    case "weekly":
      return addDays(from, 7)
    case "monthly":
      return addMonths(from, 1)
    case "quarterly":
      return addMonths(from, 3)
    case "semiannual":
      return addMonths(from, 6)
    case "annual":
      return addMonths(from, 12)
    case "every_n_days":
      return addDays(from, intervalDays && intervalDays > 0 ? intervalDays : 30)
    // after_each_use / as_needed / seasonal / setup → not rolled forward.
    default:
      return null
  }
}
