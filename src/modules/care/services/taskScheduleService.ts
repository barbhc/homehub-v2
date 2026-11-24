import { collection, doc, serverTimestamp, writeBatch } from "firebase/firestore"
import { db, auth } from "@/integrations/firebase"
import { syncTemplateDenormToInstances } from "./denormSync"
import { cadenceFactsInTransaction, planFor, runCadenceTransaction, writeCadencePlan, SEASON_NEEDED } from "./cadenceChangeService"
import type { CadenceChangePlan } from "../../../../shared/tasks/cadenceChange"
import { stamp } from "./fieldProvenance"
import { cadenceValue, type ProvenanceValues } from "../../../../shared/tasks/fieldProvenance"
import type {
  PriorityTier,
  RiskLevel,
  ScheduleType,
  Season,
} from "@/integrations/types"
import type { ServiceResult } from "./careNoteService"

export type ScheduleInput = {
  scheduleType: ScheduleType
  intervalDays?: number
  /** The season, when the editor asked for one (seasonal only). */
  season?: Season | null
}

export async function updateTaskSchedule(
  homeId: string,
  taskTemplateId: string,
  updates: { priorityTier?: PriorityTier; schedule?: ScheduleInput; estimatedMinutes?: number | null; riskLevel?: RiskLevel },
  source: string = "manual"
): Promise<ServiceResult<true>> {
  try {
    const tplRef = doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`)
    // ONE transaction (Codex review D5): the template, and — when the cadence
    // moves — every open occurrence the plan will rewrite, are read through
    // it. It used to read them with plain reads and write a batch, so a Done
    // from another device mid-save was written back to "scheduled".
    const refusal = await runCadenceTransaction(async (tx): Promise<string | null> => {
      const snap = await tx.get(tplRef)
      if (!snap.exists()) return "Task template not found"
      const current = snap.data()

      // The cadence moved: the one rule every editor uses ("from when you last
      // did it", shared/tasks/cadenceChange.ts). This used to put every open
      // occurrence at TODAY + the new cadence — and anything without a fixed
      // interval (seasonal, as needed, setup) ten years out, quietly — while
      // a task with nothing open got nothing at all. Planned here, before the
      // first write: a transaction's reads all come first.
      let plan: CadenceChangePlan | null = null
      if (updates.schedule) {
        if (current.deletedAt != null) return "Task template not found"
        const facts = await cadenceFactsInTransaction(tx, homeId, taskTemplateId, current)
        const intervalDays = updates.schedule.scheduleType === "every_n_days" ? (updates.schedule.intervalDays ?? 30) : null
        plan = planFor(facts, { scheduleType: updates.schedule.scheduleType, intervalDays, season: updates.schedule.season })
        if (plan.kind === "needs-season") return SEASON_NEEDED
      }

      const fields: Record<string, unknown> = { updatedAt: serverTimestamp() }
      // Provenance (decision C): every caller is a member's own act — "This
      // isn't right" on the task, or a similar task she ticked in that sheet —
      // so the fields written here are stamped as hers, in the same write.
      const chosen: Partial<ProvenanceValues> = {}
      if (updates.priorityTier) {
        fields.priorityTier = updates.priorityTier
        chosen.priorityTier = updates.priorityTier
      }
      if (updates.estimatedMinutes !== undefined) fields.estimatedMinutes = updates.estimatedMinutes
      if (updates.riskLevel) fields.riskLevel = updates.riskLevel
      if (updates.schedule) {
        const existing = (current.schedule ?? {}) as Record<string, unknown>
        fields.schedule = {
          ...existing,
          scheduleType: updates.schedule.scheduleType,
          intervalDays:
            updates.schedule.scheduleType === "every_n_days" ? (updates.schedule.intervalDays ?? 30) : null,
          ...(updates.schedule.season ? { season: updates.schedule.season } : {}),
        }
        chosen.schedule = cadenceValue(fields.schedule as Record<string, unknown>)
      }
      Object.assign(fields, stamp("updateTaskSchedule", chosen))
      tx.set(tplRef, fields, { merge: true })

      // Log a tier change (homes/{homeId}/tierChangeLog) when it actually changes.
      if (updates.priorityTier && current.priorityTier !== updates.priorityTier) {
        const uid = auth.currentUser?.uid
        if (uid) {
          const logRef = doc(collection(db, `homes/${homeId}/tierChangeLog`))
          tx.set(logRef, {
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
        await syncTemplateDenormToInstances(tx, homeId, taskTemplateId, { priorityTier: updates.priorityTier })
      }

      if (updates.schedule && plan) {
        const after = { ...current, ...(updates.priorityTier ? { priorityTier: updates.priorityTier } : {}) }
        await writeCadencePlan(tx, homeId, taskTemplateId, after, updates.schedule.scheduleType, plan)
      }
      return null
    })
    if (refusal) return { data: null, error: { message: refusal } }
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
