import { collection, doc, getDocs, query, serverTimestamp, where, type WriteBatch } from "firebase/firestore"
import { db } from "@/integrations/firebase"

/**
 * Propagate a task template's display fields onto its OPEN instances.
 *
 * taskInstances carry a denormalized copy of careType/priorityTier/title
 * (firestore-model.md §5) so the agenda can render without a template join — and
 * every read model uses that copy: `dashboard.ts` says so outright ("denormalized
 * careType/priorityTier on each instance replace the template join"), and the
 * Home agenda filter keys on `instance.careType`.
 *
 * The copy was written once at creation and then never updated by anything.
 * Editing a template — via the cleanup sweep or the Edit-task popover — changed
 * the template and left every open instance stale, so the change was invisible
 * exactly where the user looks. Measured on the owner's home after a full sweep:
 * 7 careType and 2 priorityTier mismatches across 63 open instances, including a
 * task the sweep had demoted to cleaning/recommended still rendering as the
 * ESSENTIAL hero on Home. It drifts both ways — a real maintenance task whose
 * instance said "cleaning" was being wrongly hidden from the agenda.
 *
 * Any writer that touches these template fields MUST call this in the same batch.
 * Only open (scheduled/snoozed, undeleted) instances are touched: done instances
 * are history and keep the classification they were completed under.
 */
export interface TemplateDenormFields {
  careType?: string
  priorityTier?: string
  title?: string
  /** The agenda groups/labels rows by the instance's own scheduleType copy, so a
   *  review that moves a task between cadences must update it like the rest. */
  scheduleType?: string
}

export async function syncTemplateDenormToInstances(
  batch: WriteBatch,
  homeId: string,
  taskTemplateId: string,
  fields: TemplateDenormFields,
): Promise<number> {
  const patch: Record<string, unknown> = {}
  if (fields.careType !== undefined) patch.careType = fields.careType
  if (fields.priorityTier !== undefined) patch.priorityTier = fields.priorityTier
  if (fields.title !== undefined) patch.title = fields.title
  if (fields.scheduleType !== undefined) patch.scheduleType = fields.scheduleType
  if (Object.keys(patch).length === 0) return 0
  patch.updatedAt = serverTimestamp()

  const snap = await getDocs(
    query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId)),
  )
  let touched = 0
  for (const d of snap.docs) {
    const status = d.get("status")
    if ((status !== "scheduled" && status !== "snoozed") || d.get("deletedAt") != null) continue
    batch.set(doc(db, `homes/${homeId}/taskInstances/${d.id}`), patch, { merge: true })
    touched++
  }
  return touched
}
