import { useState, useMemo, useCallback } from "react"
import type { TaskTemplateWithSchedule } from "@/modules/care"

export function useSessionMode(tasks: TaskTemplateWithSchedule[]) {
  const [sessionMode, setSessionMode] = useState(false)
  const [sessionPickMode, setSessionPickMode] = useState(false)
  const [activeSessionType, setActiveSessionType] = useState<"cleaning" | "maintenance">("cleaning")
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [expandedSessionTaskId, setExpandedSessionTaskId] = useState<string | null>(null)
  const [sessionTasks, setSessionTasks] = useState<TaskTemplateWithSchedule[]>([])
  const [checkedTaskIds, setCheckedTaskIds] = useState<Set<string>>(new Set())

  const recurringTasksByTier = useMemo(() => ({
    essential: tasks.filter((t) => t.priority_tier === "essential"),
    recommended: tasks.filter((t) => t.priority_tier === "recommended"),
    optional: tasks.filter((t) => t.priority_tier === "optional"),
  }), [tasks])

  const startSession = useCallback((type: "cleaning" | "maintenance") => {
    const careTypes: Array<"cleaning" | "maintenance" | "mixed"> =
      type === "cleaning" ? ["cleaning", "mixed"] : ["maintenance", "mixed"]
    const allRecurring = [
      ...recurringTasksByTier.essential,
      ...recurringTasksByTier.recommended,
      ...recurringTasksByTier.optional,
    ].filter((t) => careTypes.includes(t.care_type ?? "maintenance"))
    setActiveSessionType(type)
    setSelectedTaskIds(new Set(allRecurring.map((t) => t.task_template_id)))
    setSessionPickMode(true)
    setSessionMode(false)
  }, [recurringTasksByTier])

  const confirmSession = useCallback(() => {
    const careTypes: Array<"cleaning" | "maintenance" | "mixed"> =
      activeSessionType === "cleaning" ? ["cleaning", "mixed"] : ["maintenance", "mixed"]
    const allRecurring = [
      ...recurringTasksByTier.essential,
      ...recurringTasksByTier.recommended,
      ...recurringTasksByTier.optional,
    ].filter((t) => careTypes.includes(t.care_type ?? "maintenance"))
    const picked = allRecurring.filter((t) => selectedTaskIds.has(t.task_template_id))
    setSessionTasks(picked)
    setCheckedTaskIds(new Set())
    setExpandedSessionTaskId(null)
    setSessionPickMode(false)
    setSessionMode(true)
  }, [activeSessionType, recurringTasksByTier, selectedTaskIds])

  const endSession = useCallback(() => {
    setSessionMode(false)
    setSessionPickMode(false)
    setSessionTasks([])
    setCheckedTaskIds(new Set())
    setExpandedSessionTaskId(null)
    setSelectedTaskIds(new Set())
    setActiveSessionType("cleaning")
  }, [])

  const toggleTaskSelection = useCallback((taskTemplateId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(taskTemplateId)) next.delete(taskTemplateId)
      else next.add(taskTemplateId)
      return next
    })
  }, [])

  const toggleSessionCheck = useCallback((id: string) => {
    setCheckedTaskIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const moveSessionTask = useCallback((index: number, direction: -1 | 1) => {
    const target = index + direction
    setSessionTasks((prev) => {
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target]!, next[index]!]
      return next
    })
  }, [])

  return {
    // State
    sessionMode,
    setSessionMode,
    sessionPickMode,
    setSessionPickMode,
    activeSessionType,
    setActiveSessionType,
    selectedTaskIds,
    setSelectedTaskIds,
    expandedSessionTaskId,
    setExpandedSessionTaskId,
    sessionTasks,
    setSessionTasks,
    checkedTaskIds,
    setCheckedTaskIds,

    // Derived
    recurringTasksByTier,

    // Handlers
    startSession,
    confirmSession,
    endSession,
    toggleTaskSelection,
    toggleSessionCheck,
    moveSessionTask,
  }
}
