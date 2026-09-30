/**
 * Pure half of scripts/ops/repair-completed-on.ts: which completed task
 * instances carry a completion day shifted by the old UTC check-off date, and
 * whether the next instance's due date was derived from that day. No Firestore
 * here — the CLI reads the docs and hands in plain values — so this is
 * unit-tested on its own (completedOnRepair.test.ts).
 *
 * WHY THIS IS NOT "compare completedAt with completedOn": completeTask never
 * stores `completedOn`. It writes
 *
 *   completedAt = <completedOn>T12:00:00Z   (noon UTC of the claimed day)
 *   updatedAt   = the moment of the check-off
 *
 * so the local date of completedAt is always the claimed day and can never
 * disagree with it. What the rows DO keep is the check-off instant, in
 * updatedAt, for as long as nothing has written the row since. Hence:
 *
 *   recorded day  = the UTC date of completedAt, for rows at exactly
 *                   12:00:00.000Z (completeTask's stamp; any other time was
 *                   written by another path and is left alone);
 *   check-off day = the HOME's calendar date of updatedAt.
 *
 * A row is SHIFTED when its recorded day is the UTC date of the check-off
 * instant but not the home's date of it — exactly what the pre-fix client
 * sent. A back-dated row ("A few days ago"), or one written again later, does
 * not match that pattern and is reported, never repaired.
 */
import { calendarDateIn } from "../../firebase/functions/src/tasks/completedOn.js"
import { addCadence, seasonalNextDue, type ScheduleType } from "../../firebase/functions/src/schedule/cadence.js"

/** What the classifier needs from one taskInstances doc. */
export interface CompletedRowFacts {
  status: unknown
  deleted: boolean
  completedAt: Date | null
  updatedAt: Date | null
}

export type RowVerdict =
  | { kind: "not-completed" }
  | { kind: "deleted"; recorded: string }
  /** completedAt is not noon UTC — not written by completeTask (e.g. the item
   *  page's log-a-past-completion, a direct status update, the seed). */
  | { kind: "other-writer"; recorded: string }
  | { kind: "consistent"; recorded: string }
  | { kind: "shifted"; recorded: string; corrected: string; checkedOffAt: Date }
  /** The last write is not on the recorded day in UTC or at the home:
   *  back-dated on purpose, or the row was written again after the check-off
   *  (or has no updatedAt). Nothing here says which. */
  | { kind: "unverifiable"; recorded: string; lastWriteDay: string | null }

const utcDay = (d: Date) => d.toISOString().slice(0, 10)

/** completeTask writes completedAt as exactly noon UTC of the completion day. */
export function isCompleteTaskStamp(completedAt: Date): boolean {
  return (
    completedAt.getUTCHours() === 12 &&
    completedAt.getUTCMinutes() === 0 &&
    completedAt.getUTCSeconds() === 0 &&
    completedAt.getUTCMilliseconds() === 0
  )
}

export function classifyCompletedRow(row: CompletedRowFacts, timeZone: string): RowVerdict {
  if (row.status !== "done" || !row.completedAt) return { kind: "not-completed" }
  const recorded = utcDay(row.completedAt)
  if (row.deleted) return { kind: "deleted", recorded }
  if (!isCompleteTaskStamp(row.completedAt)) return { kind: "other-writer", recorded }
  if (!row.updatedAt) return { kind: "unverifiable", recorded, lastWriteDay: null }
  const homeDay = calendarDateIn(timeZone, row.updatedAt)
  if (recorded === homeDay) return { kind: "consistent", recorded }
  if (recorded === utcDay(row.updatedAt)) {
    return { kind: "shifted", recorded, corrected: homeDay, checkedOffAt: row.updatedAt }
  }
  return { kind: "unverifiable", recorded, lastWriteDay: homeDay }
}

/** The template's inlined schedule, as far as completeTask reads it. */
export interface ScheduleFacts {
  scheduleType?: unknown
  intervalDays?: unknown
  season?: unknown
}

/**
 * The next due date completeTask derives from a completion day (when no
 * override was sent): seasonal anchor, else the cadence. Null for
 * non-recurring schedules. Mirrors runCompleteTask.
 */
export function nextDueFrom(day: string, schedule: ScheduleFacts | null | undefined): string | null {
  const st = schedule?.scheduleType
  if (typeof st !== "string" || !st) return null
  if (st === "seasonal") {
    const seasonal = seasonalNextDue(typeof schedule?.season === "string" ? schedule.season : "", day)
    if (seasonal) return seasonal
  }
  const interval = typeof schedule?.intervalDays === "number" ? schedule.intervalDays : null
  return addCadence(day, st as ScheduleType, interval)
}

/** A sibling instance, as far as matching it to a check-off needs. */
export interface SiblingFacts {
  id: string
  taskTemplateId: unknown
  createdAt: Date | null
  dueDate: unknown
  status: unknown
  deleted: boolean
}

/** completeTask mints the next instance in the SAME transaction as the
 *  check-off, so its createdAt and the done row's updatedAt are milliseconds
 *  apart. Five seconds is generous and still cannot reach another check-off. */
export const SAME_TRANSACTION_MS = 5_000

/** The instance minted alongside a check-off, if there was one. */
export function findNextInstance(
  siblings: SiblingFacts[],
  templateId: unknown,
  completedId: string,
  checkedOffAt: Date,
): SiblingFacts | null {
  let best: SiblingFacts | null = null
  let bestGap = Infinity
  for (const s of siblings) {
    if (s.id === completedId || s.taskTemplateId !== templateId || !s.createdAt) continue
    const gap = Math.abs(s.createdAt.getTime() - checkedOffAt.getTime())
    if (gap <= SAME_TRANSACTION_MS && gap < bestGap) {
      best = s
      bestGap = gap
    }
  }
  return best
}

export type NextDueNote =
  | { kind: "none" }
  /** The next due date is exactly what the recorded (shifted) day produces. */
  | { kind: "derived"; nextId: string; dueDate: string; correctedDueDate: string | null; status: string; deleted: boolean }
  /** It isn't — an explicit override (the ±week adjust), a roll-forward, an
   *  edit, or a schedule changed since. Nothing to say about the shift. */
  | { kind: "not-derived"; nextId: string; dueDate: string; fromRecorded: string | null; status: string; deleted: boolean }

export function describeNextDue(
  next: SiblingFacts | null,
  recorded: string,
  corrected: string,
  schedule: ScheduleFacts | null | undefined,
): NextDueNote {
  if (!next) return { kind: "none" }
  const dueDate = typeof next.dueDate === "string" ? next.dueDate : String(next.dueDate)
  const status = typeof next.status === "string" ? next.status : String(next.status)
  const fromRecorded = nextDueFrom(recorded, schedule)
  if (fromRecorded !== null && fromRecorded === dueDate) {
    return { kind: "derived", nextId: next.id, dueDate, correctedDueDate: nextDueFrom(corrected, schedule), status, deleted: next.deleted }
  }
  return { kind: "not-derived", nextId: next.id, dueDate, fromRecorded, status, deleted: next.deleted }
}
