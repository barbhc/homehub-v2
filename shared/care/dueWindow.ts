/**
 * Due windows — what "due" means while a task is pending.
 *
 * Lives in shared/ so the client and the push function cannot drift: the
 * notification that says "3 things worth doing this month" must agree with the
 * screen it opens, and two implementations of "is this in its window" would
 * eventually disagree. Same rule as the parse matcher (non-negotiable #1).
 *
 * Design: `design/due-windows.md`. Almost no maintenance has to happen BY a
 * date; it wants doing within a stretch of time. A single `dueDate` rendered as
 * a deadline manufactures urgency, and false urgency spends the credibility we
 * need for the rare real deadline (a warranty closing, a recall).
 *
 * Phase 1 is presentation only. Nothing here is stored: windows are derived at
 * read time from the cadence the instance already carries. That is deliberate —
 * `windowStart`/`windowEnd` DO exist on instances as v1 leftovers and are
 * thoroughly stale (April windows on tasks due in August), which is the
 * denormalized-drift lesson in one field. Derive, don't trust.
 */

/** How far either side of the target the window reaches, by cadence.
 *
 *  Wider cadences get proportionally wider tolerance: a week either side of a
 *  monthly filter is meaningful slack, the same week on a weekly wipe-down is
 *  the whole cadence. Values are the design doc's defaults. */
const TOLERANCE_DAYS: Record<string, number> = {
  weekly: 2,
  monthly: 7,
  quarterly: 21,
  semiannual: 30,
  annual: 42,
  seasonal: 30,
}
/** `every_n_days` has no fixed bucket — scale with the interval, capped so a
 *  5-year task doesn't get a 9-month window. */
const PROPORTIONAL_TOLERANCE = 0.25
const MAX_TOLERANCE_DAYS = 45

/** Structural: `ScheduleType` from the client's types, or any string. */
export type ScheduleTypeLike = string | null

export type DueKind = "window" | "deadline" | "seasonal" | "usage"

/** Where today sits relative to the window. */
export type WindowState =
  /** Window hasn't opened — genuinely not yet. */
  | "upcoming"
  /** Inside the window: the calm, correct time to act. */
  | "open"
  /** Past the window's close. Never "overdue" for window-kind — "been a while". */
  | "lapsed"

export interface DueWindow {
  start: string
  end: string
  state: WindowState
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Half-width of the window for a cadence, in days. */
export function toleranceDays(scheduleType: ScheduleTypeLike, intervalDays?: number | null): number {
  if (scheduleType === "every_n_days" && intervalDays && intervalDays > 0) {
    return Math.min(MAX_TOLERANCE_DAYS, Math.max(2, Math.round(intervalDays * PROPORTIONAL_TOLERANCE)))
  }
  return (scheduleType ? TOLERANCE_DAYS[scheduleType] : undefined) ?? 7
}

/**
 * The window around a target date. `dueDate` keeps its meaning as the target —
 * unchanged in the database, unchanged by this function.
 */
export function dueWindow(
  dueDate: string,
  scheduleType: ScheduleTypeLike,
  opts?: { today?: string; intervalDays?: number | null },
): DueWindow {
  const today = opts?.today ?? todayStr()
  const tol = toleranceDays(scheduleType, opts?.intervalDays)
  const start = addDays(dueDate, -tol)
  const end = addDays(dueDate, tol)
  const state: WindowState = today < start ? "upcoming" : today > end ? "lapsed" : "open"
  return { start, end, state }
}

/**
 * Which kind of "due" this is.
 *
 * Phase 1 infers from data already present; Phase 2 has the parser state it
 * outright. The inference is deliberately CONSERVATIVE about `deadline`,
 * because deadline is the only kind that still earns red: an allowlist of
 * genuinely date-bound work, not a guess. Everything recurring is a window.
 */
const DEADLINE_PATTERN = /\b(warranty|register|registration|recall|rebate|permit|renew|expires?|expiring)\b/i

export function dueKindOf(task: {
  title?: string | null
  scheduleType?: ScheduleTypeLike
  careType?: string | null
}): DueKind {
  if (task.scheduleType === "seasonal") return "seasonal"
  // A one-off with deadline language is the real thing: it has a date because
  // someone else set one.
  const oneOff = !task.scheduleType || task.scheduleType === "as_needed" || task.scheduleType === "setup"
  if (oneOff && DEADLINE_PATTERN.test(task.title ?? "")) return "deadline"
  return "window"
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function monthish(dateStr: string): string {
  const m = Number(dateStr.slice(5, 7))
  return `${MONTHS[m - 1] ?? "soon"}-ish`
}

/** "Aug 25" — a real date, for the kinds that have one. */
export function shortDate(dateStr: string): string {
  const m = Number(dateStr.slice(5, 7))
  const d = Number(dateStr.slice(8, 10))
  return `${MONTHS[m - 1] ?? ""} ${d}`.trim()
}

/**
 * How to say when this wants doing.
 *
 * Short forms on purpose (owner review, 2026-08-20): "Oct-ish" beats "anytime
 * this fall". The phrase never implies precision the schedule doesn't have.
 */
export function windowPhrase(
  dueDate: string,
  scheduleType: ScheduleTypeLike,
  opts?: { today?: string; kind?: DueKind; intervalDays?: number | null },
): string {
  const today = opts?.today ?? todayStr()
  const kind = opts?.kind ?? "window"
  if (kind === "deadline") return `By ${shortDate(dueDate)}`

  const w = dueWindow(dueDate, scheduleType, { today, intervalDays: opts?.intervalDays })
  if (w.state === "lapsed") return "Been a while"
  if (w.state === "open") {
    // Inside the window and the target is close: "this week" reads truer than a
    // month name when the whole window is days wide.
    const tol = toleranceDays(scheduleType, opts?.intervalDays)
    return tol <= 3 ? "This week" : "Good to do now"
  }
  return monthish(dueDate)
}

/**
 * Does this still deserve red?
 *
 * Only deadlines, and only once actually past. Safety-critical work gets
 * firmness without a date — see `safetyPhrase` — but not red, per the calm-tier
 * non-negotiable.
 */
export function isTrulyOverdue(
  dueDate: string,
  kind: DueKind,
  opts?: { today?: string },
): boolean {
  const today = opts?.today ?? todayStr()
  return kind === "deadline" && dueDate < today
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * Firm, dateless pressure for safety work (owner-approved, 2026-08-20):
 * "Monthly check · skipped July" is honest about a missed cycle without
 * pretending a smoke-detector test had a deadline. Returns null when nothing
 * has been skipped.
 */
export function safetyPhrase(
  dueDate: string,
  scheduleType: ScheduleTypeLike,
  opts?: { today?: string },
): string | null {
  const today = opts?.today ?? todayStr()
  const w = dueWindow(dueDate, scheduleType, { today })
  if (w.state !== "lapsed") return null
  const month = Number(dueDate.slice(5, 7))
  const label = scheduleType === "monthly" ? "Monthly check" : "Check"
  return `${label} · skipped ${MONTHS_LONG[month - 1] ?? "a cycle"}`
}
