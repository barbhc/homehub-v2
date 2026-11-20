import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch,
} from "firebase/firestore"
import { db } from "@/integrations/firebase"
import {
  planLevelChange, taskLevelOf, type LevelTemplate, type TaskLevel,
} from "../../../../shared/tasks/taskLevel"

/**
 * The home's task level, applied (D4 — shared/tasks/taskLevel.ts has the rule).
 *
 * WHY THE HIDDEN MARK IS WRITTEN, NOT COMPUTED ON READ. "Hide what is below the
 * level" needs one exception — a task someone brought back by hand — and the
 * only moment that exception is unambiguous is the level change itself: a
 * manual's task showing below the OLD level can only be one a person kept. So
 * the change is where the marks are settled, on the task TEMPLATES, and Home
 * and Tasks read one small query (`hiddenByLevel == true`) instead of joining
 * every template on every load.
 *
 * Nothing here touches task instances, schedules or history, and nothing is
 * deleted or deactivated: raising the level clears the mark and the tasks are
 * exactly where they were.
 */

export type ServiceResult<T> = { data: T; error: null } | { data: null; error: { message: string } }
const fail = (e: unknown, fallback: string): { data: null; error: { message: string } } =>
  ({ data: null, error: { message: e instanceof Error ? e.message : fallback } })

/** A Firestore batch holds 500 writes; the home doc takes one of them. */
const BATCH_LIMIT = 450

/**
 * Template ids the level is hiding from Home and Tasks.
 *
 * REJECTS on a failed read. Callers decide what a failure means, and for both
 * of them it means "hide nothing": a task is never taken off a list because a
 * query did not answer (the rule every other Home filter follows — HH-166).
 */
export async function readHiddenTemplateIds(homeId: string): Promise<Set<string>> {
  const snap = await getDocs(query(collection(db, `homes/${homeId}/taskTemplates`), where("hiddenByLevel", "==", true)))
  return new Set(snap.docs.filter((d) => d.get("deletedAt") == null).map((d) => d.id))
}

/**
 * Change the home's task level.
 *
 * One atomic batch whenever the change fits in one (every home we have): the
 * hidden marks and the home's level land together or not at all, so a failed
 * save leaves the old level and the old lists. A home with more changes than a
 * batch holds writes the marks first and the level LAST — a failure part-way
 * leaves the old level selected, and choosing the level again finishes the job
 * (planLevelChange is idempotent).
 */
export async function setTaskLevel(
  homeId: string,
  to: TaskLevel,
): Promise<ServiceResult<{ hidden: number; shown: number }>> {
  try {
    const homeRef = doc(db, `homes/${homeId}`)
    const [homeSnap, tplSnap] = await Promise.all([
      getDoc(homeRef),
      getDocs(collection(db, `homes/${homeId}/taskTemplates`)),
    ])
    // Offline, an unsynced cache answers "no tasks" — and a level saved over
    // that would hide nothing now and never revisit it (firestore fromCache
    // trap). Refuse rather than guess.
    if (tplSnap.metadata.fromCache && tplSnap.empty) {
      throw new Error("Couldn't save your choice. Check your connection and try again.")
    }
    const from = taskLevelOf(homeSnap.get("taskLevel"))
    const templates: LevelTemplate[] = tplSnap.docs
      .filter((d) => d.get("deletedAt") == null && d.get("isActive") !== false)
      .map((d) => ({
        id: d.id,
        priorityTier: typeof d.get("priorityTier") === "string" ? d.get("priorityTier") : null,
        source: typeof d.get("source") === "string" ? d.get("source") : "manual",
        externalKey: typeof d.get("externalKey") === "string" ? d.get("externalKey") : null,
        remindEnabled: typeof d.get("remindEnabled") === "boolean" ? d.get("remindEnabled") : null,
        hiddenByLevel: d.get("hiddenByLevel") === true,
        levelKept: d.get("levelKept") === true,
      }))
    const plan = planLevelChange(templates, from, to)

    const unhidden = new Set(plan.unhide)
    const hiddenAfter = templates.filter((t) => t.hiddenByLevel && !unhidden.has(t.id)).length + plan.hide.length

    const writes: { id: string; fields: Record<string, unknown> }[] = [
      ...plan.keep.map((id) => ({ id, fields: { levelKept: true } })),
      ...plan.hide.map((id) => ({ id, fields: { hiddenByLevel: true } })),
      ...plan.unhide.map((id) => ({ id, fields: { hiddenByLevel: false } })),
    ]
    for (let i = 0; i < writes.length || i === 0; i += BATCH_LIMIT) {
      const chunk = writes.slice(i, i + BATCH_LIMIT)
      const last = i + BATCH_LIMIT >= writes.length
      const batch = writeBatch(db)
      for (const w of chunk) {
        batch.update(doc(db, `homes/${homeId}/taskTemplates/${w.id}`), { ...w.fields, updatedAt: serverTimestamp() })
      }
      // The level itself goes in the final batch — with every mark when the
      // change fits in one — along with how many tasks it now hides. Readers
      // ask for the marks only when that count is above zero, so marks from a
      // change that never finished are ignored until it does.
      if (last) batch.set(homeRef, { taskLevel: to, taskLevelHidden: hiddenAfter, updatedAt: serverTimestamp() }, { merge: true })
      await batch.commit()
      if (last) break
    }
    return { data: { hidden: plan.hide.length, shown: plan.unhide.length }, error: null }
  } catch (e) {
    console.warn(`[taskLevel] could not set level "${to}" for home ${homeId}:`, e instanceof Error ? e.message : e)
    return fail(e, "Couldn't save your choice. Check your connection and try again.")
  }
}
