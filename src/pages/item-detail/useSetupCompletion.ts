/**
 * useSetupCompletion — shared "done" state for setup-checklist tasks.
 *
 * Setup tasks are checked off by writing a `done` task_instance (and un-checked
 * by soft-deleting it). Both the mobile SetupChecklistSection and the desktop
 * setup block render their own UI but share this completion logic so the DB
 * behavior stays identical.
 */
import { useEffect, useState } from "react"
import { supabase } from "@/integrations/shim/client"
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
    if (tasks.length === 0) {
      setInstanceMap(new Map())
      return
    }
    const taskIds = tasks.map((t) => t.task_template_id)
    let cancelled = false
    supabase
      .from("task_instance")
      .select("task_instance_id, task_template_id")
      .in("task_template_id", taskIds)
      .eq("status", "done")
      .is("deleted_at", null)
      .order("completed_at", { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = new Map<string, string>()
        for (const row of data as Array<{ task_instance_id: string; task_template_id: string }>) {
          if (!map.has(row.task_template_id)) {
            map.set(row.task_template_id, row.task_instance_id)
          }
        }
        setInstanceMap(map)
      })
    return () => { cancelled = true }
    // taskKey captures the set of task ids without re-running on array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey])

  const toggleDone = async (task: TaskTemplateWithSchedule) => {
    const taskId = task.task_template_id
    const wasDone = instanceMap.has(taskId)
    setLoadingIds((prev) => new Set([...prev, taskId]))

    if (wasDone) {
      const instanceId = instanceMap.get(taskId)!
      const { error } = await supabase
        .from("task_instance")
        .update({ deleted_at: new Date().toISOString() })
        .eq("task_instance_id", instanceId)
      if (!error) {
        setInstanceMap((prev) => {
          const next = new Map(prev)
          next.delete(taskId)
          return next
        })
      }
    } else {
      const today = new Date().toISOString().split("T")[0]
      const { data, error } = await supabase
        .from("task_instance")
        .insert({
          home_id: homeId,
          task_template_id: taskId,
          item_unit_id: itemId,
          status: "done",
          due_date: today,
          completed_at: new Date().toISOString(),
          priority_score: 0,
          is_safety_critical: false,
          completion_notes: null,
          completion_photos: [],
        })
        .select("task_instance_id")
        .single()
      if (!error && data) {
        setInstanceMap((prev) =>
          new Map([...prev, [taskId, (data as { task_instance_id: string }).task_instance_id]]),
        )
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
