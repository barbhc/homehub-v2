/**
 * What happens when a task's "how often" changes — the ONE rule, for every
 * editor that changes it (owner decision, 2026-10-28, decision doc §B):
 *
 *   "From when you last did it."
 *
 * - Next due = the last completion + the new cadence. Never done → the date
 *   the task was added + the new cadence. History is never rewritten: done
 *   occurrences are not read for anything but their date, and never written.
 * - The current open occurrence moves to that date. A snooze survives only if
 *   it ends AFTER the new date; otherwise it is dropped (the occurrence is
 *   simply scheduled on the new date).
 * - Seasonal lands on the season's next window after that base date. When the
 *   season is unknown the answer is `needs-season`: the editor asks, it never
 *   errors and never guesses (the old ten-years-out parking is gone).
 * - As needed / setup / after each use have no date: their open occurrence is
 *   removed (soft-deleted by the caller; completions stay). A recurring task
 *   with no open occurrence gets one on the computed date.
 * - A date already in the past is returned as it is — honestly overdue. That is
 *   the stated trade-off of the rule; the editors show the date before saving.
 *
 * Before this, three editors gave three answers (Reminders kept the old date,
 * "This isn't right" counted from today and parked seasonal ten years out, the
 * item review left the date alone and seeded new ones due today). This file is
 * pure — no Firestore — so every editor, and its tests, decide through it.
 *
 * Calendar dates are "YYYY-MM-DD" strings (shared/dates/calendar.ts), which
 * compare correctly as text.
 */
import { addDays, addMonths } from "../dates/calendar.js"

export type CadenceScheduleType =
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

export type CadenceSeason = "spring" | "summer" | "fall" | "winter"

/** Cadences that never come due: changing to one removes the open occurrence. */
const NO_DATE: ReadonlySet<string> = new Set(["after_each_use", "as_needed", "setup"])

/** Same default the server's `addCadence` uses for an every_n_days task with no
 *  usable interval (firebase/functions/src/schedule/cadence.ts). */
const DEFAULT_INTERVAL_DAYS = 30

/** Month-day each season's task is acted in — the server's `SEASON_ANCHOR`
 *  (cadence.ts), so a seasonal date here is the date completeTask would pick. */
const SEASON_ANCHOR: Record<CadenceSeason, string> = { spring: "04-15", summer: "07-15", fall: "10-15", winter: "01-15" }

export const isCadenceSeason = (v: unknown): v is CadenceSeason =>
  v === "spring" || v === "summer" || v === "fall" || v === "winter"

/** An open (scheduled or snoozed, not deleted) occurrence of the task. */
export interface OpenOccurrence {
  id: string
  status: "scheduled" | "snoozed"
  dueDate: string | null
  snoozedUntil: string | null
}

export interface CadenceChangeInput {
  scheduleType: CadenceScheduleType
  /** Read only for every_n_days. */
  intervalDays?: number | null
  /** The task's season: the one stored on it, or the one the editor just asked
   *  for. Read only for seasonal. */
  season?: string | null
  /** The day of the most recent completion, or null if it was never done. */
  lastDoneOn: string | null
  /** The day the task was added. */
  addedOn: string
  open: OpenOccurrence[]
  today: string
}

/** Where one open occurrence ends up. */
export interface OccurrenceMove {
  id: string
  dueDate: string
  status: "scheduled" | "snoozed"
  snoozedUntil: string | null
}

export type CadenceChangePlan =
  /** Seasonal, and nobody knows which season: ask, then plan again. */
  | { kind: "needs-season" }
  /** No date any more: soft-delete these open occurrences. */
  | { kind: "unscheduled"; remove: string[] }
  | {
      kind: "scheduled"
      nextDue: string
      /** What the date counts from — the editors can say so. */
      basis: "last-done" | "added"
      /** The new date is before today: due now, by the rule's own arithmetic. */
      overdue: boolean
      moves: OccurrenceMove[]
      /** No open occurrence exists: create one on `nextDue`. */
      create: boolean
    }

/** The season's next window strictly after `from` (a task done on the anchor
 *  day itself is due the next year). */
export function seasonalAfter(season: CadenceSeason, from: string): string {
  const md = SEASON_ANCHOR[season]
  const year = Number(from.slice(0, 4))
  const candidate = `${year}-${md}`
  return candidate > from ? candidate : `${year + 1}-${md}`
}

/** One cadence after `from`, or null when the cadence never comes due or the
 *  season is unknown. */
export function cadenceAfter(
  scheduleType: CadenceScheduleType,
  from: string,
  opts: { intervalDays?: number | null; season?: string | null } = {},
): string | null {
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
    case "every_n_days": {
      const n = opts.intervalDays
      return addDays(from, typeof n === "number" && Number.isInteger(n) && n > 0 ? n : DEFAULT_INTERVAL_DAYS)
    }
    case "seasonal":
      return isCadenceSeason(opts.season) ? seasonalAfter(opts.season, from) : null
    case "after_each_use":
    case "as_needed":
    case "setup":
      return null
  }
}

export function planCadenceChange(input: CadenceChangeInput): CadenceChangePlan {
  const { scheduleType, open } = input
  if (NO_DATE.has(scheduleType)) return { kind: "unscheduled", remove: open.map((o) => o.id) }
  if (scheduleType === "seasonal" && !isCadenceSeason(input.season)) return { kind: "needs-season" }

  const basis = input.lastDoneOn ? "last-done" : "added"
  const from = input.lastDoneOn ?? input.addedOn
  const nextDue = cadenceAfter(scheduleType, from, { intervalDays: input.intervalDays, season: input.season })
  if (!nextDue) throw new Error(`Unknown schedule type: ${String(scheduleType)}`)

  const moves: OccurrenceMove[] = open.map((o) => {
    const keepSnooze = o.status === "snoozed" && !!o.snoozedUntil && o.snoozedUntil > nextDue
    return keepSnooze
      ? { id: o.id, dueDate: nextDue, status: "snoozed", snoozedUntil: o.snoozedUntil }
      : { id: o.id, dueDate: nextDue, status: "scheduled", snoozedUntil: null }
  })
  return { kind: "scheduled", nextDue, basis, overdue: nextDue < input.today, moves, create: open.length === 0 }
}

/** True when the editor's new cadence differs from the stored one. Rows a
 *  review merely re-saves are not changes, and must not move a date. */
export function cadenceChanged(
  before: { scheduleType?: string | null; intervalDays?: number | null; season?: string | null },
  after: { scheduleType: string; intervalDays?: number | null; season?: string | null },
): boolean {
  if ((before.scheduleType ?? null) !== after.scheduleType) return true
  if (after.scheduleType === "every_n_days" && (before.intervalDays ?? null) !== (after.intervalDays ?? null)) return true
  if (after.scheduleType === "seasonal" && after.season != null && (before.season ?? null) !== after.season) return true
  return false
}
