import type { ScheduleType, Season } from "@/integrations/types"

/**
 * Computes the next due date for a recurring task from the *completion date*.
 *
 * This is the client-side mirror of the `complete_task_instance` SQL RPC — it
 * powers the completion sheet's "Next due {date}" preview (and the ±-week
 * adjust) before the user confirms. The RPC is the source of truth that
 * actually writes the next instance; keep the two in sync.
 *
 * Returns null for non-recurring schedules (after_each_use / as_needed /
 * setup), which generate no next occurrence.
 */
export function computeNextDueDate(
  scheduleType: ScheduleType,
  completedOn: string, // YYYY-MM-DD
  opts?: { intervalDays?: number | null; season?: Season | null }
): string | null {
  const base = new Date(completedOn + "T12:00:00")

  switch (scheduleType) {
    case "after_each_use":
    case "as_needed":
    case "setup":
      return null

    case "weekly":
      return addDays(base, 7)
    case "monthly":
      return addMonths(base, 1)
    case "quarterly":
      return addMonths(base, 3)
    case "semiannual":
      return addMonths(base, 6)
    case "annual":
      return addMonths(base, 12)
    case "every_n_days":
      return addDays(base, opts?.intervalDays ?? 30)

    case "seasonal": {
      if (!opts?.season) return null
      const month = SEASON_MONTH[opts.season]
      const year = base.getFullYear()
      let anchor = new Date(year, month, 15, 12, 0, 0)
      // Roll to next year if this year's anchor already passed on/before completion.
      if (anchor.getTime() <= base.getTime()) anchor = new Date(year + 1, month, 15, 12, 0, 0)
      return iso(anchor)
    }

    default:
      return addDays(base, opts?.intervalDays ?? 365)
  }
}

const SEASON_MONTH: Record<Season, number> = {
  winter: 0, // Jan
  spring: 3, // Apr
  summer: 6, // Jul
  fall: 9, // Oct
}

function addDays(d: Date, n: number): string {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return iso(x)
}

function addMonths(d: Date, n: number): string {
  const x = new Date(d)
  x.setMonth(x.getMonth() + n)
  return iso(x)
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
