import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore"
import { db, auth } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import type {
  PriorityTier,
  RiskLevel,
  ScheduleType,
} from "@/integrations/types"
import type { ServiceResult } from "./careNoteService"
import { addDays, addMonths, localToday } from "../../../../shared/dates/calendar"

export type ScheduleInput = {
  scheduleType: ScheduleType
  intervalDays?: number
}

/** The first due date for a new cadence, counted from the device's today. It
 *  was local noon read back as UTC — a day early at UTC+13. */
function computeDueDate(schedule: ScheduleInput): string {
  const today = localToday()
  switch (schedule.scheduleType) {
    case "weekly":
      return addDays(today, 7)
    case "monthly":
      return addMonths(today, 1)
    case "quarterly":
      return addMonths(today, 3)
    case "semiannual":
      return addMonths(today, 6)
    case "annual":
      return addMonths(today, 12)
    case "every_n_days":
      return addDays(today, schedule.intervalDays ?? 30)
    default:
      return addMonths(today, 120)
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
