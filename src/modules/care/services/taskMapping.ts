import type { ScheduleType, MaintenanceFreqUnit } from "@/integrations/types"

/**
 * Pure mappings shared by the v1.1 task services (Phase 2).
 *
 * These translate between the redesign's user-facing task shape (the add-item
 * "Plan" step's editable tasks; the unified week agenda) and the v1.1
 * task_template / schedule_rule model — replacing the retired, dropped-table
 * `maintenanceService`. Kept pure and unit-tested, mirroring Phase 1's
 * `computeNextDueDate`.
 */

/** Source bucket for the unified "This week" agenda, driving the row's chip. */
export type TaskSource = "appliance" | "home" | "cleaning"

/**
 * Classifies a task for the week agenda: cleaning wins (any scope), then
 * home-level recurring upkeep, else an appliance/item task.
 */
export function taskSource(
  scopeType: "home" | "item_unit",
  careType: string | null | undefined
): TaskSource {
  if (careType === "cleaning") return "cleaning"
  return scopeType === "home" ? "home" : "appliance"
}

/** Effort tier → estimated minutes (mirrors the legacy add-item mapping). */
export function effortToMinutes(
  effort: "short" | "medium" | "long" | null | undefined
): number | null {
  switch (effort) {
    case "short":
      return 15
    case "long":
      return 60
    case "medium":
      return 30
    default:
      return null
  }
}

export type ScheduleMapping = { schedule_type: ScheduleType; interval_days: number | null }

/**
 * Maps an editable task's recurrence (after-each-use, or a value+unit cadence)
 * onto a v1.1 schedule rule. Canonical cadences (weekly, monthly, quarterly,
 * semiannual, annual) get their named schedule_type; everything else becomes
 * `every_n_days` with a computed interval. No recurrence → `as_needed`.
 */
export function frequencyToSchedule(opts: {
  afterEachUse?: boolean
  frequencyValue: number | null
  frequencyUnit: MaintenanceFreqUnit | null
}): ScheduleMapping {
  if (opts.afterEachUse) return { schedule_type: "after_each_use", interval_days: null }

  const v = opts.frequencyValue
  const u = opts.frequencyUnit
  if (v == null || u == null || v <= 0) return { schedule_type: "as_needed", interval_days: null }

  if (u === "weeks" && v === 1) return { schedule_type: "weekly", interval_days: null }
  if (u === "months" && v === 1) return { schedule_type: "monthly", interval_days: null }
  if (u === "months" && v === 3) return { schedule_type: "quarterly", interval_days: null }
  if (u === "months" && v === 6) return { schedule_type: "semiannual", interval_days: null }
  if (u === "years" && v === 1) return { schedule_type: "annual", interval_days: null }

  const days =
    u === "days" ? v : u === "weeks" ? v * 7 : u === "months" ? v * 30 : v * 365
  return { schedule_type: "every_n_days", interval_days: days }
}
