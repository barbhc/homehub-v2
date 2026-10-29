import type { CadenceChangePlan } from "../../../shared/tasks/cadenceChange"
import { localToday } from "../../../shared/dates/calendar"

/* The words of the "Next due" line (NextDue.tsx), apart so the component file
 * exports only components (react-refresh) and the words are testable alone. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** "Nov 3", or "Jan 15, 2027" outside the current year. */
export function dueDateLabel(date: string, today: string = localToday()): string {
  const m = MONTHS[Number(date.slice(5, 7)) - 1] ?? ""
  const d = Number(date.slice(8, 10))
  return date.slice(0, 4) === today.slice(0, 4) ? `${m} ${d}` : `${m} ${d}, ${date.slice(0, 4)}`
}

/** The line's words, or null when the editor must ask for a season instead. */
export function nextDueText(plan: CadenceChangePlan, today: string = localToday()): string | null {
  switch (plan.kind) {
    case "needs-season":
      return null
    case "unscheduled":
      return "No due date"
    case "scheduled":
      return `Next due: ${dueDateLabel(plan.nextDue, today)}${plan.overdue ? " — due now" : ""}`
  }
}

