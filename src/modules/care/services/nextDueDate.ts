import type { ScheduleType, Season } from "@/integrations/types"
import { addDays, addMonths, localDateString } from "../../../../shared/dates/calendar"

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
  // Calendar arithmetic on the date itself (shared/dates/calendar.ts): the same
  // component math as the server's cadence.ts, in every zone and across DST.
  switch (scheduleType) {
    case "after_each_use":
    case "as_needed":
    case "setup":
      return null

    case "weekly":
      return addDays(completedOn, 7)
    case "monthly":
      return addMonths(completedOn, 1)
    case "quarterly":
      return addMonths(completedOn, 3)
    case "semiannual":
      return addMonths(completedOn, 6)
    case "annual":
      return addMonths(completedOn, 12)
    case "every_n_days":
      return addDays(completedOn, opts?.intervalDays ?? 30)

    case "seasonal": {
      if (!opts?.season) return null
      const base = new Date(completedOn + "T12:00:00")
      const month = SEASON_MONTH[opts.season]
      const year = base.getFullYear()
      let anchor = new Date(year, month, 15, 12, 0, 0)
      // Roll to next year if this year's anchor already passed on/before completion.
      if (anchor.getTime() <= base.getTime()) anchor = new Date(year + 1, month, 15, 12, 0, 0)
      return localDateString(anchor)
    }

    default:
      return addDays(completedOn, opts?.intervalDays ?? 365)
  }
}

const SEASON_MONTH: Record<Season, number> = {
  winter: 0, // Jan
  spring: 3, // Apr
  summer: 6, // Jul
  fall: 9, // Oct
}
