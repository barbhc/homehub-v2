/**
 * useSetupCompletion — shared "done" state for setup-checklist tasks.
 *
 * Setup tasks are checked off by writing a `done` task_instance (and un-checked
 * by soft-deleting it). Its one caller is CareBlock's Setup rows, which both
 * item-page layouts render; the retired SetupChecklistSection (deleted
 * 2026-09-30) used to be the second.
 */
import { useEffect, useState } from "react"
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, Timestamp } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { logTaskCompletion } from "@/modules/care"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { useDepsChanged } from "@/hooks/useDepsChanged"

export interface SetupCompletion {
  /** task_template_id → task_instance_id for tasks currently marked done. */
  instanceMap: Map<string, string>
  /** task_template_ids with an in-flight toggle. */
  loadingIds: Set<string>
  /** Number of tasks currently done. */
  doneCount: number
  isDone: (taskId: string) => boolean
  /** Resolves false when the write failed (and `error` says so). */
  toggleDone: (task: TaskTemplateWithSchedule) => Promise<boolean>
  /** "It's already installed" — clears every remaining step in one go, for the
   *  common case of adding a manual to an appliance installed years ago. */
  markAllDone: () => Promise<void>
  /** A read or a tick that failed, in words for the checklist to show. Both
   *  used to be swallowed: a failed read rendered every step unchecked, and a
   *  failed tick just didn't take, with nothing said (audit H6). */
  error: string | null
  /** The read failed — the checklist offers `retryLoad`. */
  loadFailed: boolean
  /** Re-reads which steps are done, after a failed read. */
  retryLoad: () => void
}

export function useSetupCompletion(
  tasks: TaskTemplateWithSchedule[],
  homeId: string,
  itemId: string,
): SetupCompletion {
  const [instanceMap, setInstanceMap] = useState<Map<string, string>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)

  const taskKey = tasks.map((t) => t.task_template_id).join(",")

  // No steps (or no home): nothing is done — cleared in the render that learns
  // it, not by the effect a render later.
  if (useDepsChanged([taskKey, homeId, loadAttempt]) && (tasks.length === 0 || !homeId)) {
    setInstanceMap(new Map())
  }

  useEffect(() => {
    if (tasks.length === 0 || !homeId) return
    // Setup checklists are far below Firestore's 30-value `in` cap.
    const taskIds = tasks.map((t) => t.task_template_id)
    let cancelled = false
    getDocs(
      query(
        collection(db, `homes/${homeId}/taskInstances`),
        where("taskTemplateId", "in", taskIds),
        where("status", "==", "done")
      )
    )
      .then((snap) => {
        if (cancelled) return
        const rows = snap.docs
          .filter((d) => d.data().deletedAt == null)
          .map((d) => {
            const completedAt = d.data().completedAt
            return {
              id: d.id,
              tplId: d.data().taskTemplateId as string,
              completedAt: completedAt instanceof Timestamp ? completedAt.toDate().toISOString() : "",
            }
          })
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
        const map = new Map<string, string>()
        for (const row of rows) {
          if (!map.has(row.tplId)) map.set(row.tplId, row.id)
        }
        setInstanceMap(map)
        setLoadFailed(false)
      })
      .catch((e: unknown) => {
        // The steps render unchecked — so say we couldn't read them, rather
        // than letting "nothing done yet" stand as if it were known.
        if (cancelled) return
        console.warn(`[setup] could not read which steps are done for item ${itemId} (home ${homeId}):`, e instanceof Error ? e.message : e)
        setLoadFailed(true)
      })
    return () => { cancelled = true }
    // taskKey captures the set of task ids without re-running on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, homeId, loadAttempt])

  /**
   * Every outstanding step at once.
   *
   * Sequential, not parallel: each completion is a write plus a state update
   * keyed by task id, and firing them together made the map races visible as
   * checkboxes that flickered back. A handful of install steps is a short loop.
   * Stops at the first failure — one error line, not one per step.
   */
  const markAllDone = async () => {
    for (const task of tasks) {
      if (instanceMap.has(task.task_template_id)) continue
      if (!(await toggleDone(task))) return
    }
  }

  const toggleDone = async (task: TaskTemplateWithSchedule): Promise<boolean> => {
    const taskId = task.task_template_id
    const wasDone = instanceMap.has(taskId)
    setLoadingIds((prev) => new Set([...prev, taskId]))
    setToggleError(null)
    let ok = true

    if (wasDone) {
      const instanceId = instanceMap.get(taskId)!
      try {
        await updateDoc(doc(db, `homes/${homeId}/taskInstances/${instanceId}`), {
          deletedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setInstanceMap((prev) => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
      } catch (e) {
        // Left checked — it is still done on the server — and said.
        console.warn(`[setup] could not un-check step ${taskId} (home ${homeId}):`, e instanceof Error ? e.message : e)
        ok = false
      }
    } else {
      // logTaskCompletion writes the done instance WITH the template's denorm
      // display set (title/tier/careType — firestore-model.md §5).
      const result = await logTaskCompletion(homeId, taskId, itemId, new Date().toISOString())
      if (!result.error && result.data) {
        setInstanceMap((prev) => new Map([...prev, [taskId, result.data!.task_instance_id]]))
      } else {
        console.warn(`[setup] could not check off step ${taskId} (home ${homeId}):`, result.error?.message)
        ok = false
      }
    }

    if (!ok) setToggleError("Couldn't update that step. Check your connection and try again.")
    setLoadingIds((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
    return ok
  }

  return {
    instanceMap,
    loadingIds,
    doneCount: tasks.filter((t) => instanceMap.has(t.task_template_id)).length,
    isDone: (taskId: string) => instanceMap.has(taskId),
    toggleDone,
    markAllDone,
    error: toggleError ?? (loadFailed ? "Couldn't load which steps are done." : null),
    loadFailed,
    retryLoad: () => setLoadAttempt((n) => n + 1),
  }
}
