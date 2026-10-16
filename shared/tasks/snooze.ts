/**
 * Snooze — the ONE definition of "is this open task on the list today, and
 * for when?". Home, the Tasks agenda (and its calendar), Your week, the item
 * page and the push sweep all answer it here, so the screen and the phone
 * cannot disagree about a snoozed task.
 *
 * Snooze writes `status: "snoozed"` + `snoozedUntil` and leaves `dueDate`
 * alone (taskService.snoozeTaskInstance), so Undo can put the occurrence back
 * exactly where it was. Nothing ever flips the status back. Before this file,
 * Home read only `scheduled` — a task snoozed there never came back — and the
 * Tasks agenda read `snoozed` without looking at the date, so a task snoozed
 * there came back on the next refresh (backlog: "Snooze doesn't stick").
 *
 * The rule, applied on READ (no job, no write to flip it back):
 *  · scheduled            → on the list, due its dueDate.
 *  · snoozed, until > today → off the list everywhere, reminders included.
 *  · snoozed, until ≤ today → back, due the LATER of dueDate and snoozedUntil:
 *    a task snoozed while overdue returns as due the day the snooze ends, not
 *    as "24 days overdue". A snooze with no usable date is treated as
 *    scheduled — a malformed row must never vanish for good.
 *  · anything else (done, skipped) → not open.
 *
 * Calendar dates are "YYYY-MM-DD" strings, which compare correctly as text.
 */

/** The stored fields the decision reads. Values are member-written, so unknown. */
export interface SnoozeAware {
  status?: unknown
  dueDate?: unknown
  snoozedUntil?: unknown
  /** Any other stored field — a whole document can be passed as it was read. */
  [field: string]: unknown
}

/** How long Snooze puts a task away, on every screen. */
export const SNOOZE_DAYS = 14

const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)

/**
 * The date an open task counts as due on `today`, or null when it is not on
 * the list today (not open, or snoozed past today). A row with no usable
 * dueDate answers `today` — callers already treated a missing date that way.
 */
export function effectiveDueDate(t: SnoozeAware, today: string): string | null {
  const due = isYmd(t.dueDate) ? t.dueDate : today
  if (t.status === "scheduled") return due
  if (t.status !== "snoozed") return null
  if (!isYmd(t.snoozedUntil)) return due
  if (t.snoozedUntil > today) return null
  return t.snoozedUntil > due ? t.snoozedUntil : due
}

/**
 * The day an open task comes due, whatever today is: its dueDate, or for a
 * snoozed one the later of that and snoozedUntil. For a surface that lists a
 * task even while it is snoozed (the item page's schedule) and must say WHEN.
 * Null when the task is not open or has no date at all.
 */
export function comesDueOn(t: SnoozeAware): string | null {
  if (t.status !== "scheduled" && t.status !== "snoozed") return null
  const until = t.status === "snoozed" && isYmd(t.snoozedUntil) ? t.snoozedUntil : null
  if (!isYmd(t.dueDate)) return until
  return until && until > t.dueDate ? until : t.dueDate
}

/**
 * The row as a list should read it today: null when it is not on the list,
 * else the row itself — with `dueDate` replaced by the effective date for a
 * snoozed one whose snooze has ended. A scheduled row comes back untouched
 * (a missing dueDate stays missing, so each list keeps its own rule for that).
 */
export function asListedToday<T extends SnoozeAware>(t: T, today: string): T | null {
  const due = effectiveDueDate(t, today)
  if (due === null) return null
  return t.status === "snoozed" ? { ...t, dueDate: due } : t
}

/** True when the task is open and not snoozed past today. */
export function isOnListToday(t: SnoozeAware, today: string): boolean {
  return effectiveDueDate(t, today) !== null
}

/** True while a snooze is still holding the task off the list. */
export function isSnoozedAway(t: SnoozeAware, today: string): boolean {
  return t.status === "snoozed" && isYmd(t.snoozedUntil) && t.snoozedUntil > today
}
