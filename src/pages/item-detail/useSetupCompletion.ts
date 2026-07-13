/**
 * useSetupCompletion — shared "done" state for setup-checklist tasks.
 *
 * Setup tasks are checked off by writing a `done` task_instance (and un-checked
 * by soft-deleting it). Both the mobile SetupChecklistSection and the desktop
 * setup block render their own UI but share this completion logic so the DB
 * behavior stays identical.
 */
import { useEffect, useState } from "react"
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, Timestamp } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import { logTaskCompletion } from "@/modules/care"
import type { TaskTemplateWithSchedule } from "@/modules/care"

export interface SetupCompletion {
  /** task_template_id → task_instance_id for tasks currently marked done. */
  instanceMap: Map<string, string>
  /** task_template_ids with an in-flight toggle. */
  loadingIds: Set<string>
  /** Number of tasks currently done. */
  doneCount: number
  isDone: (taskId: string) => boolean
  toggleDone: (task: TaskTemplateWithSchedule) => Promise<void>
}

export function useSetupCompletion(
  tasks: TaskTemplateWithSchedule[],
  homeId: string,
  itemId: string,
): SetupCompletion {
  const [instanceMap, setInstanceMap] = useState<Map<string, string>>(new Map())
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  const taskKey = tasks.map((t) => t.task_template_id).join(",")

  useEffect(() => {
    if (tasks.length === 0 || !homeId) {
      setInstanceMap(new Map())
      return
    }
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
      })
      .catch(() => { /* non-fatal — checklist renders unchecked */ })
    return () => { cancelled = true }
    // taskKey captures the set of task ids without re-running on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, homeId])

  const toggleDone = async (task: TaskTemplateWithSchedule) => {
    const taskId = task.task_template_id
    const wasDone = instanceMap.has(taskId)
    setLoadingIds((prev) => new Set([...prev, taskId]))

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
      } catch { /* leave checked; the next toggle retries */ }
    } else {
      // logTaskCompletion writes the done instance WITH the template's denorm
      // display set (title/tier/careType — firestore-model.md §5).
      const result = await logTaskCompletion(homeId, taskId, itemId, new Date().toISOString())
      if (!result.error && result.data) {
        setInstanceMap((prev) => new Map([...prev, [taskId, result.data!.task_instance_id]]))
      }
    }

    setLoadingIds((prev) => {
      const next = new Set(prev)
      next.delete(taskId)
      return next
    })
  }

  return {
    instanceMap,
    loadingIds,
    doneCount: tasks.filter((t) => instanceMap.has(t.task_template_id)).length,
    isDone: (taskId: string) => instanceMap.has(taskId),
    toggleDone,
  }
}
