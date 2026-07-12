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
 * `runCompleteTask` is the plain, emulator-testable core.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { addCadence, type ScheduleType } from "../schedule/cadence.js"

const REGION = "us-central1"
const NO_NEXT: ReadonlySet<string> = new Set(["after_each_use", "as_needed", "setup"])

export interface CompleteTaskInput {
  homeId: string
  taskInstanceId: string
  completedOn?: string // YYYY-MM-DD; defaults to today (caller's tz)
  nextDueOverride?: string | null
  completionNotes?: string | null
}
export interface CompleteTaskResult {
  completedInstanceId: string
  nextInstanceId: string | null
}

function priorityScoreForTier(tier: string): number {
  return tier === "essential" ? 100 : tier === "recommended" ? 50 : 10
}

/** Seasonal anchor for `season`, on/after `from` (rolls to next year if passed). */
function seasonalNextDue(season: string, from: string): string | null {
  const anchors: Record<string, string> = { spring: "04-15", summer: "07-15", fall: "10-15", winter: "01-15" }
  const md = anchors[season]
  if (!md) return null
  const year = Number(from.slice(0, 4))
  let candidate = `${year}-${md}`
  if (candidate <= from) candidate = `${year + 1}-${md}`
  return candidate
}

function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function runCompleteTask(db: Firestore, input: CompleteTaskInput): Promise<CompleteTaskResult> {
  const { homeId, taskInstanceId } = input
  const completedOn = input.completedOn ?? new Date().toISOString().slice(0, 10)
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

export const completeTask = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, taskInstanceId, completedOn, nextDueOverride, completionNotes } = (request.data ?? {}) as CompleteTaskInput
  if (!homeId || !taskInstanceId) throw new HttpsError("invalid-argument", "homeId and taskInstanceId are required.")

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")

  try {
    return await runCompleteTask(db, { homeId, taskInstanceId, completedOn, nextDueOverride, completionNotes })
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "completeTask failed")
  }
})
