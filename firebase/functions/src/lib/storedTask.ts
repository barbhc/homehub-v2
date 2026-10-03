/**
 * Stored task fields that server code reads and then writes from (H3a §3).
 *
 * Templates and instances are member-writable (firestore.rules), so whatever
 * is in them arrived from a client at some point. The readers here used to
 * cast (`schedule.intervalDays as number`) and then do arithmetic or build a
 * document path with the result: a string interval became string
 * concatenation inside a date, a slash in a template id became a different
 * document. Each field below is parsed instead; one of the wrong type reads as
 * ABSENT — exactly what a missing field already meant to every one of these
 * readers — so stored data that was fine keeps behaving the same.
 */
import { z } from "zod"
import type { ScheduleType } from "../schedule/cadence.js"
import { DocId } from "./validate.js"

export const SCHEDULE_TYPES = [
  "after_each_use",
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "seasonal",
  "every_n_days",
  "as_needed",
  "setup",
] as const satisfies readonly ScheduleType[]
// Both directions: a type added to cadence.ts must be added here too.
type MissingScheduleType = Exclude<ScheduleType, (typeof SCHEDULE_TYPES)[number]>
const scheduleTypesComplete: MissingScheduleType extends never ? true : never = true
void scheduleTypesComplete

export const ScheduleTypeSchema = z.enum(SCHEDULE_TYPES)

/** A finite number, or absent — never NaN, a string, or a map. */
const finite = z.number().refine(Number.isFinite)

/** The inlined `schedule` map on a template, as cadence math reads it. */
export const StoredSchedule = z.object({
  scheduleType: ScheduleTypeSchema.optional().catch(undefined),
  intervalDays: finite.nullable().catch(null),
  windowDaysBefore: finite.optional().catch(undefined),
  windowDaysAfter: finite.optional().catch(undefined),
  season: z.string().optional().catch(undefined),
})
export type StoredScheduleFields = z.output<typeof StoredSchedule>

/** A template's schedule: an unreadable or missing map reads as "no schedule". */
export function readSchedule(raw: unknown): StoredScheduleFields {
  return StoredSchedule.catch({ scheduleType: undefined, intervalDays: null, windowDaysBefore: undefined, windowDaysAfter: undefined, season: undefined }).parse(raw ?? {})
}

/** A member/template id stored on a doc that the server will put in a path. */
export function storedDocId(v: unknown): string | null {
  const r = DocId.safeParse(v)
  return r.success ? r.data : null
}
