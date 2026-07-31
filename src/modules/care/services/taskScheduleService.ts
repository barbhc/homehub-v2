import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { db, auth } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import type {
  PriorityTier,
  RiskLevel,
  ScheduleType,
} from "@/integrations/types"
import type { ServiceResult } from "./careNoteService"

export type ScheduleInput = {
  scheduleType: ScheduleType
  intervalDays?: number
}

export type CreateTaskFromNoteInput = {
  homeId: string
  roomId?: string | null
  itemUnitId?: string | null
  title: string
  description?: string | null
  priorityTier: PriorityTier
  careType?: "cleaning" | "maintenance" | "mixed"
  schedule: ScheduleInput
}

function computeDueDate(schedule: ScheduleInput): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  switch (schedule.scheduleType) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "monthly":
      d.setMonth(d.getMonth() + 1)
      break
    case "quarterly":
      d.setMonth(d.getMonth() + 3)
      break
    case "semiannual":
      d.setMonth(d.getMonth() + 6)
      break
    case "annual":
      d.setFullYear(d.getFullYear() + 1)
      break
    case "every_n_days":
      d.setDate(d.getDate() + (schedule.intervalDays ?? 30))
      break
    default:
      d.setFullYear(d.getFullYear() + 10)
  }
  return d.toISOString().slice(0, 10)
}

export async function createTaskFromNote(
  input: CreateTaskFromNoteInput
): Promise<ServiceResult<{ taskTemplateId: string }>> {
  try {
    const scopeType = input.itemUnitId ? "item_unit" : "home"
    const careType = input.careType ?? "cleaning"
    const intervalDays =
      input.schedule.scheduleType === "every_n_days" ? (input.schedule.intervalDays ?? 30) : null

    // Denormalize item/room onto the instance (firestore-model.md §5).
    let itemName: string | null = null
    let roomName: string | null = null
    if (input.itemUnitId) {
      const itemSnap = await getDoc(doc(db, `homes/${input.homeId}/items/${input.itemUnitId}`))
      if (itemSnap.exists()) {
        itemName = itemSnap.data().displayName ?? null
        const roomId = itemSnap.data().roomId
        if (roomId) {
          const roomSnap = await getDoc(doc(db, `homes/${input.homeId}/rooms/${roomId}`))
          roomName = roomSnap.exists() ? (roomSnap.data().name ?? null) : null
        }
      }
    }

    const now = serverTimestamp()
    const tplRef = doc(collection(db, `homes/${input.homeId}/taskTemplates`))
    const instRef = doc(collection(db, `homes/${input.homeId}/taskInstances`))
    const dueDate = computeDueDate(input.schedule)
    const priorityScore =
      input.priorityTier === "essential" ? 100 : input.priorityTier === "recommended" ? 60 : 30

    const batch = writeBatch(db)
    batch.set(tplRef, {
      scopeType,
      itemUnitId: input.itemUnitId ?? null,
      roomId: input.roomId ?? null,
      title: input.title,
      description: input.description ?? null,
      careType,
      careTypeOverriddenAt: null,
      justification: null,
      symptomTags: [],
      reCheckTriggers: [],
      priorityTier: input.priorityTier,
      riskLevel: "comfort",
      estimatedMinutes: null,
      defaultAssignee: null,
      instructionsChunkId: null,
      instructionsOverride: null,
      steps: null,
      sourcePage: null,
      suppliesMode: "none",
      supplies: [],
      source: "user",
      isUserEditable: true,
      userModifiedAt: null,
      isActive: true,
      metadata: {},
      manualId: null,
      externalKey: null,
      schedule: {
        scheduleType: input.schedule.scheduleType,
        intervalDays,
        anchorDate: new Date().toISOString().slice(0, 10),
        season: null,
        windowDaysBefore: 7,
        windowDaysAfter: 14,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    batch.set(instRef, {
      taskTemplateId: tplRef.id,
      itemUnitId: input.itemUnitId ?? null,
      status: "scheduled",
      dueDate,
      windowStart: null,
      windowEnd: null,
      snoozedUntil: null,
      priorityScore,
      isSafetyCritical: false,
      completedAt: null,
      completionNotes: null,
      completionPhotos: [],
      assignedTo: null,
      title: input.title,
      priorityTier: input.priorityTier,
      careType,
      scopeType,
      estimatedMinutes: null,
      scheduleType: input.schedule.scheduleType,
      itemName,
      roomName,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
    await batch.commit()
    return { data: { taskTemplateId: tplRef.id }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to create task" } }
  }
}

export async function updateTaskSchedule(
  homeId: string,
  taskTemplateId: string,
  updates: { priorityTier?: PriorityTier; schedule?: ScheduleInput; estimatedMinutes?: number | null; riskLevel?: RiskLevel },
  source: string = "manual"
): Promise<ServiceResult<true>> {
  try {
    const tplRef = doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`)
    const snap = await getDoc(tplRef)
    if (!snap.exists()) return { data: null, error: { message: "Task template not found" } }
    const current = snap.data()

    const batch = writeBatch(db)
    const fields: Record<string, unknown> = { updatedAt: serverTimestamp() }
    if (updates.priorityTier) fields.priorityTier = updates.priorityTier
    if (updates.estimatedMinutes !== undefined) fields.estimatedMinutes = updates.estimatedMinutes
    if (updates.riskLevel) fields.riskLevel = updates.riskLevel
    if (updates.schedule) {
      const existing = (current.schedule ?? {}) as Record<string, unknown>
      fields.schedule = {
        ...existing,
        scheduleType: updates.schedule.scheduleType,
        intervalDays:
          updates.schedule.scheduleType === "every_n_days" ? (updates.schedule.intervalDays ?? 30) : null,
      }
    }
    batch.set(tplRef, fields, { merge: true })

    // Log a tier change (homes/{homeId}/tierChangeLog) when it actually changes.
    if (updates.priorityTier && current.priorityTier !== updates.priorityTier) {
      const uid = auth.currentUser?.uid
      if (uid) {
        const logRef = doc(collection(db, `homes/${homeId}/tierChangeLog`))
        batch.set(logRef, {
          taskTemplateId,
          changedBy: uid,
          oldTier: current.priorityTier,
          newTier: updates.priorityTier,
          source,
          createdAt: serverTimestamp(),
        })
      }
    }

    // Tier is denormalized onto every open instance and the agenda reads THAT,
    // not the template — without this the user changes a task's tier and Home
    // keeps rendering the old one.
    if (updates.priorityTier) {
      await syncTemplateDenormToInstances(batch, homeId, taskTemplateId, { priorityTier: updates.priorityTier })
    }

    // Re-anchor open instances' due date when the cadence changed.
    if (updates.schedule) {
      const newDue = computeDueDate(updates.schedule)
      const openSnap = await getDocs(
        query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId))
      )
      for (const d of openSnap.docs) {
        const st = d.data().status
        if ((st === "scheduled" || st === "snoozed") && d.data().deletedAt == null) {
          batch.set(d.ref, { dueDate: newDue, scheduleType: updates.schedule.scheduleType, updatedAt: serverTimestamp() }, { merge: true })
        }
      }
    }

    await batch.commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update schedule" } }
  }
}

export async function updateTaskNotes(
  homeId: string,
  taskTemplateId: string,
  notes: string | null
): Promise<ServiceResult<void>> {
  // task_template has no free-form `notes` column; the redesign's editable
  // "Notes" maps to the existing instructions_override field.
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`), { instructionsOverride: notes, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: undefined as unknown as void, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update notes" } }
  }
}
