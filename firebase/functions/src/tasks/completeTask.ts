/**
 * completeTask — the Firestore equivalent of v1's `complete_task_instance` RPC
 * (docs/firestore-model.md §9). It's a CALLABLE (not a client transaction)
 * because dup-suppression needs a query INSIDE the transaction, which only the
 * Admin SDK supports.
 *
 * Transactionally: mark the instance done → (bail if the template has no
 * recurring schedule) → compute the next due date → suppress if an open instance
 * already exists → insert the next instance carrying the denormalized display
 * fields + an inherited (member-validated) assignee.
 *
 * `runCompleteTask` is the plain, emulator-testable core; `handleCompleteTask`
 * is the callable's body (auth → membership → completion date → core) with an
 * injectable clock.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { addCadence, seasonalNextDue, type ScheduleType } from "../schedule/cadence.js"
import { calendarDateIn, checkCompletedOn, homeTimeZone, isCalendarDate } from "./completedOn.js"

const REGION = "us-central1"
const NO_NEXT: ReadonlySet<string> = new Set(["after_each_use", "as_needed", "setup"])

/** The wire shape the client sends. */
export interface CompleteTaskInput {
  homeId: string
  taskInstanceId: string
  /** YYYY-MM-DD on the CALLER's calendar, checked against the home's (±1 day).
   *  Absent → today in the home's timezone. See completedOn.ts. */
  completedOn?: string
  /** The person chose an earlier day ("A few days ago" on the task page), so
   *  `completedOn` may be up to BACKDATE_MAX_DAYS in the past. */
  backdated?: boolean
  nextDueOverride?: string | null
  completionNotes?: string | null
}

/** What the core needs: the completion date already resolved against the
 *  home's calendar. There is no default here on purpose — the old one was a
 *  UTC date, which is the bug this replaced. */
export type RunCompleteTaskInput = Omit<CompleteTaskInput, "completedOn" | "backdated"> & { completedOn: string }

export interface CompleteTaskResult {
  completedInstanceId: string
  nextInstanceId: string | null
}

function priorityScoreForTier(tier: string): number {
  return tier === "essential" ? 100 : tier === "recommended" ? 50 : 10
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function runCompleteTask(db: Firestore, input: RunCompleteTaskInput): Promise<CompleteTaskResult> {
  const { homeId, taskInstanceId, completedOn } = input
  const instRef = db.doc(`homes/${homeId}/taskInstances/${taskInstanceId}`)
  const instancesCol = db.collection(`homes/${homeId}/taskInstances`)

  return db.runTransaction(async (t) => {
    const instSnap = await t.get(instRef)
    if (!instSnap.exists) throw new Error("Task instance not found")
    const inst = instSnap.data() as Record<string, unknown>
    const templateId = inst.taskTemplateId as string

    const tplRef = db.doc(`homes/${homeId}/taskTemplates/${templateId}`)
    const tplSnap = await t.get(tplRef)
    const tpl = tplSnap.exists ? (tplSnap.data() as Record<string, unknown>) : null
    const schedule = (tpl?.schedule as Record<string, unknown> | undefined) ?? undefined
    const scheduleType = schedule?.scheduleType as ScheduleType | undefined

    // Decide whether a next instance is warranted, and read what we need BEFORE writes.
    const wantsNext =
      !!tpl &&
      tpl.isActive !== false &&
      tpl.deletedAt == null &&
      !!scheduleType &&
      !NO_NEXT.has(scheduleType)

    let openExists = false
    let inheritedAssignee: string | null = null
    if (wantsNext) {
      // Dup-suppression: any OTHER open instance for this template?
      const openSnap = await t.get(
        instancesCol.where("taskTemplateId", "==", templateId).where("status", "in", ["scheduled", "snoozed"])
      )
      openExists = openSnap.docs.some((d) => d.id !== taskInstanceId && d.get("deletedAt") == null)

      // Assignee inheritance: template default, else the completed instance's, if still a member.
      const candidate = (tpl?.defaultAssignee as string | null) ?? (inst.assignedTo as string | null) ?? null
      if (candidate) {
        const memberSnap = await t.get(db.doc(`homes/${homeId}/members/${candidate}`))
        if (memberSnap.exists) inheritedAssignee = candidate
      }
    }

    // ── writes ──
    const completedAt = Timestamp.fromDate(new Date(`${completedOn}T12:00:00Z`))
    t.set(
      instRef,
      {
        status: "done",
        completedAt,
        completionNotes: input.completionNotes ?? inst.completionNotes ?? null,
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    )

    if (!wantsNext || openExists) {
      return { completedInstanceId: taskInstanceId, nextInstanceId: null }
    }

    // Next due: override > seasonal anchor > cadence add.
    const intervalDays = (schedule?.intervalDays as number | null) ?? null
    let nextDue: string | null = input.nextDueOverride ?? null
    if (!nextDue && scheduleType === "seasonal") {
      nextDue = seasonalNextDue((schedule?.season as string) ?? "", completedOn)
    }
    if (!nextDue) nextDue = addCadence(completedOn, scheduleType!, intervalDays)
    if (!nextDue) return { completedInstanceId: taskInstanceId, nextInstanceId: null }

    const before = (schedule?.windowDaysBefore as number) ?? 7
    const after = (schedule?.windowDaysAfter as number) ?? 14
    const nextRef = instancesCol.doc()
    const now = Timestamp.now()
    t.set(nextRef, {
      taskTemplateId: templateId,
      itemUnitId: inst.itemUnitId ?? null,
      status: "scheduled",
      dueDate: nextDue,
      windowStart: addDaysYmd(nextDue, -before),
      windowEnd: addDaysYmd(nextDue, after),
      snoozedUntil: null,
      priorityScore: priorityScoreForTier((inst.priorityTier as string) ?? "optional"),
      isSafetyCritical: inst.isSafetyCritical ?? false,
      completedAt: null,
      completionNotes: null,
      completionPhotos: [],
      assignedTo: inheritedAssignee,
      // denorm (§5) — carried from the completed instance (same task identity)
      title: inst.title ?? "Task",
      priorityTier: inst.priorityTier ?? "optional",
      careType: inst.careType ?? "maintenance",
      scopeType: inst.scopeType ?? "item_unit",
      estimatedMinutes: inst.estimatedMinutes ?? null,
      scheduleType,
      itemName: inst.itemName ?? null,
      roomName: inst.roomName ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })

    return { completedInstanceId: taskInstanceId, nextInstanceId: nextRef.id }
  })
}

/** A Firestore document id: one path segment, so it can't address another doc. */
const DOC_ID = /^[^/]+$/

/**
 * The request body, checked field by field rather than cast — the callable's
 * type says nothing about what arrives. `completedOn` and `backdated` are
 * passed on as-is: checkCompletedOn owns their rules. Everything else must
 * already be what the core writes. (Shared schema contracts for every callable
 * are a follow-up: audit 2026-09-29, refactor #8.)
 */
function readInput(data: unknown): Omit<CompleteTaskInput, "completedOn" | "backdated"> & {
  completedOn: unknown
  backdated: unknown
} {
  const d: Record<string, unknown> = data !== null && typeof data === "object" ? { ...data } : {}
  const { homeId, taskInstanceId, nextDueOverride, completionNotes } = d
  if (typeof homeId !== "string" || !DOC_ID.test(homeId) || typeof taskInstanceId !== "string" || !DOC_ID.test(taskInstanceId)) {
    throw new HttpsError("invalid-argument", "homeId and taskInstanceId are required.")
  }
  if (nextDueOverride != null && !isCalendarDate(nextDueOverride)) {
    throw new HttpsError("invalid-argument", "nextDueOverride must be a date (YYYY-MM-DD) or null.")
  }
  if (completionNotes != null && typeof completionNotes !== "string") {
    throw new HttpsError("invalid-argument", "completionNotes must be text or null.")
  }
  return {
    homeId,
    taskInstanceId,
    completedOn: d.completedOn,
    backdated: d.backdated,
    nextDueOverride: nextDueOverride ?? null,
    completionNotes: completionNotes ?? null,
  }
}

/**
 * The callable's body without the transport, so tests can drive it on a fixed
 * clock. Every input check runs BEFORE the try below: that catch turns
 * everything it sees into "internal", and a bad request — a date the caller
 * got wrong included — is an invalid-argument, not our failure.
 */
export async function handleCompleteTask(
  db: Firestore,
  uid: string | undefined,
  data: unknown,
  now: Date = new Date(),
): Promise<CompleteTaskResult> {
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, taskInstanceId, completedOn, backdated, nextDueOverride, completionNotes } = readInput(data)

  // One round trip for both; nothing from the home doc is used unless the
  // caller turns out to be a member.
  const [member, home] = await db.getAll(db.doc(`homes/${homeId}/members/${uid}`), db.doc(`homes/${homeId}`))
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")

  const homeToday = calendarDateIn(homeTimeZone(home.get("timezone"), homeId), now)
  const date = checkCompletedOn({ completedOn, backdated }, homeToday)
  if (!date.ok) throw new HttpsError("invalid-argument", date.message)

  try {
    return await runCompleteTask(db, { homeId, taskInstanceId, completedOn: date.completedOn, nextDueOverride, completionNotes })
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "completeTask failed")
  }
}

export const completeTask = onCall({ region: REGION }, (request) =>
  handleCompleteTask(getFirestore(), request.auth?.uid, request.data),
)
