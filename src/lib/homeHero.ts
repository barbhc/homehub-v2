/**
 * The hero's own selection — shared by Home's "This week" list and the
 * Tasks page. (The Coming-up drawer, the stat band and the quick-win face
 * that used to live here left with the Home rebuild, design/home-focus.md.)
 */

// ── the hero's own selection, shared ──────────────────────────────────────────
/** Structural input for urgentTasks — the DashboardTask fields it reads. */
export interface UrgentInput {
  id: string
  isOverdue: boolean
  daysUntilDue?: number | null
  daysOverdue?: number | null
}

/**
 * "Busy" = something is genuinely on you today: overdue, or due today.
 * Due-in-three-days lives in the drawer — that's planning, not interruption.
 * The hero shows the FIRST of these; extracted so the "This week at home"
 * list can exclude exactly the task the hero visibly names, and nothing more.
 */
export function urgentTasks<T extends UrgentInput>(tasks: T[]): T[] {
  return tasks
    .filter((t) => t.isOverdue || (t.daysUntilDue != null && t.daysUntilDue <= 0))
    .sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0))
}

/** The one task the hero card shows, or null when it shows "All quiet". */
export function heroLeadId(tasks: UrgentInput[]): string | null {
  return urgentTasks(tasks)[0]?.id ?? null
}
