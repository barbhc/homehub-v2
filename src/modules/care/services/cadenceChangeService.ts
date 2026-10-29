import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, Timestamp, type DocumentData, type Transaction, type WriteBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { computePriorityScore } from "./priorityScore"
import type { ServiceResult } from "./careNoteService"
import type { PriorityTier, RiskLevel, ScheduleType, Season } from "@/integrations/types"
import { localDateString, localToday, isCalendarDate } from "../../../../shared/dates/calendar"
import {
  isCadenceSeason, planCadenceChange,
  type CadenceChangePlan, type OpenOccurrence,
} from "../../../../shared/tasks/cadenceChange"

/**
 * The Firestore side of the cadence-change rule (shared/tasks/cadenceChange.ts):
 * read what the rule needs from a task's stored documents, and write the plan it
 * returns. Every editor that changes "how often" — setTaskCadence (Your
 * reminders, library backstops), updateTaskSchedule ("This isn't right"),
 * applySeason (the wrong-season chip) and saveItemTaskReview (Review tasks) —
 * goes through `planFor` and `writeCadencePlan`, and the screens preview the
 * same plan with `previewCadenceChange` before anything is saved.
 */

/** What the rule needs to know about one task, read from its documents. */
export interface CadenceFacts {
  /** The schedule as stored. */
  scheduleType: ScheduleType | null
  intervalDays: number | null
  season: Season | null
  /** Most recent completion's day, or null when it was never done. */
  lastDoneOn: string | null
  /** The day the task was added. */
  addedOn: string
  open: OpenOccurrence[]
}

/** What an editor wants the cadence to become. `season` is the one the editor
 *  asked for; absent, the task's stored season is used. */
export interface CadenceChoice {
  scheduleType: ScheduleType
  intervalDays?: number | null
  season?: Season | null
}

/**
 * The calendar day of a completion.
 *
 * Two writers stamp `completedAt` differently: completeTask (the server) stamps
 * NOON UTC of the completion day — so its UTC date is the day, in every zone —
 * while logTaskCompletion stamps the real instant, whose day is the device's.
 * Reading every stamp as UTC (as Home's "last done" does) files a 7 pm Pacific
 * log under tomorrow; reading every stamp as local files a completeTask stamp
 * under the wrong day east of UTC+11. The noon-UTC stamp is exact, so it is
 * recognisable.
 */
export function completionDay(v: unknown): string | null {
  const d = v instanceof Timestamp ? v.toDate() : typeof v === "string" ? new Date(v) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const noonUtc = d.getUTCHours() === 12 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0
  return noonUtc ? d.toISOString().slice(0, 10) : localDateString(d)
}

/** The day the task was added: its creation stamp, else the schedule's anchor
 *  (written at creation by every creator), else today. */
function addedOnOf(tpl: DocumentData, today: string): string {
  const created = tpl.createdAt
  if (created instanceof Timestamp) return localDateString(created.toDate())
  const anchor = (tpl.schedule as { anchorDate?: unknown } | null | undefined)?.anchorDate
  return isCalendarDate(anchor) ? anchor : today
}

const asDate = (v: unknown): string | null => (isCalendarDate(v) ? v : null)

/** Facts from a template and ITS instances (any status; deleted ones ignored). */
export function cadenceFactsFrom(
  tpl: DocumentData,
  instances: { id: string; data: DocumentData }[],
  today: string = localToday(),
): CadenceFacts {
  const sched = (tpl.schedule ?? null) as { scheduleType?: unknown; intervalDays?: unknown; season?: unknown } | null
  let lastDoneOn: string | null = null
  const open: OpenOccurrence[] = []
  for (const { id, data } of instances) {
    if (data.deletedAt != null) continue
    if (data.status === "done") {
      const day = completionDay(data.completedAt)
      if (day && (!lastDoneOn || day > lastDoneOn)) lastDoneOn = day
    } else if (data.status === "scheduled" || data.status === "snoozed") {
      open.push({ id, status: data.status, dueDate: asDate(data.dueDate), snoozedUntil: asDate(data.snoozedUntil) })
    }
  }
  return {
    scheduleType: typeof sched?.scheduleType === "string" ? (sched.scheduleType as ScheduleType) : null,
    intervalDays: typeof sched?.intervalDays === "number" ? sched.intervalDays : null,
    season: isCadenceSeason(sched?.season) ? sched.season : null,
    lastDoneOn,
    addedOn: addedOnOf(tpl, today),
    open,
  }
}

export function planFor(facts: CadenceFacts, choice: CadenceChoice, today: string = localToday()): CadenceChangePlan {
  return planCadenceChange({
    scheduleType: choice.scheduleType,
    intervalDays: choice.intervalDays ?? null,
    season: choice.season ?? facts.season,
    lastDoneOn: facts.lastDoneOn,
    addedOn: facts.addedOn,
    open: facts.open,
    today,
  })
}

/** A template and its facts, read fresh. Null when the task is gone. */
export async function readCadenceFacts(
  homeId: string,
  taskTemplateId: string,
): Promise<{ tpl: DocumentData; facts: CadenceFacts } | null> {
  const snap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
  if (!snap.exists() || snap.data().deletedAt != null) return null
  const inst = await getDocs(
    query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId)),
  )
  const tpl = snap.data()
  return { tpl, facts: cadenceFactsFrom(tpl, inst.docs.map((d) => ({ id: d.id, data: d.data() }))) }
}

/** What saving `choice` would do to this task — the date every editor shows
 *  before its Save. Reads only. */
export async function previewCadenceChange(
  homeId: string,
  taskTemplateId: string,
  choice: CadenceChoice,
): Promise<ServiceResult<CadenceChangePlan>> {
  try {
    const read = await readCadenceFacts(homeId, taskTemplateId)
    if (!read) return { data: null, error: { message: "Task not found" } }
    return { data: planFor(read.facts, choice), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't work out the next date" } }
  }
}

/** The message a writer refuses with if an editor skipped asking. */
export const SEASON_NEEDED = "Pick a season first."

/**
 * Write a plan's occurrence changes into the caller's batch or transaction
 * (nothing lands until the caller commits). The template's own schedule write
 * is the caller's, because each editor writes other fields beside it.
 *
 * `tpl` is the template as it will be AFTER the caller's write — a new
 * occurrence copies its display fields (firestore-model.md §5).
 */
export async function writeCadencePlan(
  writer: WriteBatch | Transaction,
  homeId: string,
  taskTemplateId: string,
  tpl: DocumentData,
  scheduleType: ScheduleType,
  plan: CadenceChangePlan,
): Promise<void> {
  const set = (ref: ReturnType<typeof doc>, data: DocumentData) => {
    // Narrowed per type: the two `set` overload sets don't unify on a union.
    if ("commit" in writer) writer.set(ref, data, { merge: true })
    else writer.set(ref, data, { merge: true })
  }
  const inst = (id: string) => doc(db, `homes/${homeId}/taskInstances/${id}`)
  const now = serverTimestamp()
  switch (plan.kind) {
    case "needs-season":
      throw new Error(SEASON_NEEDED)
    case "unscheduled":
      // Soft delete: completions are separate documents and are never touched.
      for (const id of plan.remove) set(inst(id), { deletedAt: now, updatedAt: now })
      return
    case "scheduled":
      for (const m of plan.moves) {
        set(inst(m.id), { dueDate: m.dueDate, status: m.status, snoozedUntil: m.snoozedUntil, scheduleType, updatedAt: now })
      }
      if (plan.create) {
        set(doc(collection(db, `homes/${homeId}/taskInstances`)), await firstOccurrence(homeId, taskTemplateId, tpl, scheduleType, plan.nextDue))
      }
      return
  }
}

/** The first scheduled occurrence of a template that has none open — the
 *  shape commitDraft writes, denormalized display set included
 *  (firestore-model.md §5), because that copy is what every surface reads. */
export async function firstOccurrence(
  homeId: string,
  taskTemplateId: string,
  tpl: DocumentData,
  scheduleType: ScheduleType,
  dueDate: string,
): Promise<DocumentData> {
  const itemUnitId: string | null = tpl.itemUnitId ?? null
  let itemName: string | null = null
  let roomName: string | null = null
  if (itemUnitId) {
    const item = await getDoc(doc(db, `homes/${homeId}/items/${itemUnitId}`))
    if (item.exists()) {
      itemName = item.data().displayName ?? null
      const roomId = item.data().roomId
      if (roomId) {
        const room = await getDoc(doc(db, `homes/${homeId}/rooms/${roomId}`))
        roomName = room.exists() ? (room.data().name ?? null) : null
      }
    }
  }
  const tier = (tpl.priorityTier ?? "recommended") as PriorityTier
  const { priorityScore, isSafetyCritical } = computePriorityScore(
    tier,
    (tpl.riskLevel ?? "comfort") as RiskLevel,
    dueDate,
    null,
    null,
    tpl.estimatedMinutes ?? null,
  )
  const now = serverTimestamp()
  return {
    homeId,
    taskTemplateId,
    itemUnitId,
    status: "scheduled",
    dueDate,
    windowStart: null,
    windowEnd: null,
    snoozedUntil: null,
    priorityScore,
    isSafetyCritical,
    completedAt: null,
    completionNotes: null,
    completionPhotos: [],
    assignedTo: null,
    // denorm (§5)
    title: tpl.title ?? "",
    priorityTier: tier,
    careType: tpl.careType ?? null,
    scopeType: tpl.scopeType ?? (itemUnitId ? "item_unit" : "home"),
    estimatedMinutes: tpl.estimatedMinutes ?? null,
    scheduleType,
    itemName,
    roomName,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
}
