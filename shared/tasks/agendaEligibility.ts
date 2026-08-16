/**
 * Agenda eligibility — the ONE definition of "does this task belong on the Home
 * agenda / in proactive alerts?".
 *
 * The user's rule (2026-07-29 dogfooding): the Home agenda is for MAINTENANCE.
 * Item-scoped cleaning ("Wipe Dishwasher Exterior", "Clean Interior Surfaces")
 * lives on the Cleaning page and in the item's own Cleaning group — surfacing it
 * on Home is what made the app feel noisy and untrustworthy. Home-scoped cleaning
 * ("Wipe down kitchen surfaces") is a genuine household chore and stays.
 *
 * This existed inline in weekAgenda but NOT in getUpcomingTasks, which is why
 * cleaning still reached Home's Due Today / Upcoming. Both call this now.
 *
 * Note this is a DISPLAY filter keyed on careType, so it only works when tasks
 * are labeled correctly — shared/tasks/taxonomy.ts is what guarantees that at
 * parse time, and the backfill sweep fixes already-committed mislabels.
 */

/** The denormalized fields an eligibility decision needs (task_instance §5). */
export interface AgendaEligible {
  careType?: string | null
  scopeType?: string | null
}

/** True when a task should appear on the Home agenda and in proactive alerts. */
export function isAgendaEligible(t: AgendaEligible): boolean {
  return !(t.careType === "cleaning" && t.scopeType === "item_unit")
}
