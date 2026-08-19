import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  ArrowRight,
  CheckIcon,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  SparklesIcon,
  SprayCanIcon,
  X,
} from "lucide-react"
import { useCurrentHome, getRooms } from "@/modules/home"
import { markTaskInstanceDone } from "@/modules/care"
import {
  getCleaningTasks,
  getDeepCleanGuides,
  saveRoutineTask,
  type CleanTask,
  type CleanSessionMode,
  type DeepCleanGuide,
} from "@/lib/cleanSession"
import { PageContainer, PageHeader, SectionCard } from "@/components/layout"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { splitCautions } from "@/lib/cautions"
import { CautionCallout } from "@/components/tasks/CautionCallout"

type Step = "setup" | "checklist" | "summary"
type View = "hub" | "session"

const INK = "var(--hh-ink)",
  SUB = "var(--hh-sub)",
  TEAL = "var(--hh-teal)",
  CLAY = "var(--hh-clay)"

/**
 * Time budgets per spec: each option carries a short note. "No limit" maps to a
 * null minute cap (no time ceiling) in the budget-packing logic.
 */
const TIME_OPTIONS = [
  { label: "15 min", note: "Quick tidy", minutes: 15 },
  { label: "30 min", note: "Reset", minutes: 30 },
  { label: "1 hour", note: "Thorough", minutes: 60 },
  { label: "No limit", note: "Deep clean", minutes: null },
] as const

const MOTIVATING_MESSAGES = [
  "Well done!",
  "Your home thanks you.",
  "Fresh start.",
  "Nice work!",
  "You've got this.",
]

function formatStaleDays(days: number): string {
  if (days >= 9999) return "Never done"
  if (days === 0) return "Done today"
  if (days === 1) return "1 day ago"
  if (days < 7) return `${days} days ago`
  if (days < 14) return "1 week ago"
  if (days < 21) return "2 weeks ago"
  if (days < 28) return "3 weeks ago"
  if (days < 60) return "1 month ago"
  if (days < 90) return "2 months ago"
  return "3+ months ago"
}

/** Signed whole-day delta from today; negative = past due. null dates sort late. */
function daysUntilDue(dateStr: string | null): number {
  if (!dateStr) return 9999
  const a = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00")
  const b = new Date(dateStr + "T00:00:00")
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/** Short due label for the hub "This week" list. Overdue in clay, never red. */
function dueLabel(t: CleanTask): { text: string; overdue: boolean } {
  if (t.isOverdue) return { text: "Overdue", overdue: true }
  const n = daysUntilDue(t.dueDate)
  if (n <= 0) return { text: "Today", overdue: false }
  if (n === 1) return { text: "Tomorrow", overdue: false }
  if (n <= 7) return { text: `${n} days`, overdue: false }
  return { text: "Later", overdue: false }
}

export default function DeepClean() {
  const navigate = useNavigate()
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  const [view, setView] = useState<View>("hub")
  const [step, setStep] = useState<Step>("setup")
  // Maintenance was an invented session-type toggle — clean sessions are always
  // "cleaning". Kept as a constant where getCleaningTasks needs the mode.
  const cleanMode: CleanSessionMode = "cleaning"
  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])
  const [wholeHome, setWholeHome] = useState(false)
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set())
  // Default budget so "Let's clean" can be active on entry (room is auto-picked).
  const [selectedTime, setSelectedTime] = useState<(typeof TIME_OPTIONS)[number]>(TIME_OPTIONS[1])
  // Hub data
  const [guides, setGuides] = useState<DeepCleanGuide[]>([])
  const [weekTasks, setWeekTasks] = useState<CleanTask[]>([])
  const [hubLoading, setHubLoading] = useState(true)
  const [tasks, setTasks] = useState<CleanTask[]>([])
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [customTasks, setCustomTasks] = useState<CleanTask[]>([])
  const [customInput, setCustomInput] = useState("")
  const [bonusOpen, setBonusOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [cleanError, setCleanError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [skippedItemKeys, setSkippedItemKeys] = useState<Set<string>>(new Set())
  const [expandedItemKeys, setExpandedItemKeys] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)
  const [summaryCompleted, setSummaryCompleted] = useState(0)
  const [summaryTotal, setSummaryTotal] = useState(0)
  const [summaryMinutes, setSummaryMinutes] = useState(0)
  const [summaryRooms, setSummaryRooms] = useState<string[]>([])
  const [savedCustomIds, setSavedCustomIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!homeId) return
    // Default a room selected on entry so the setup CTA is active immediately.
    getRooms(homeId).then((r) => {
      const list = r.data ?? []
      setRooms(list)
      setSelectedRoomIds((prev) => {
        if (prev.size > 0 || list.length === 0) return prev
        return new Set([list[0].room_id])
      })
    })
  }, [homeId])

  // Hub data: curated guides + this-week cleaning tasks (due/overdue, short list).
  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    setHubLoading(true)
    Promise.all([
      getDeepCleanGuides(homeId).catch(() => []),
      getCleaningTasks(homeId, "cleaning").catch(() => []),
    ]).then(([g, tasks]) => {
      if (cancelled) return
      setGuides(g)
      // "This week": due-soon or overdue cleaning tasks, capped to a short list.
      const due = tasks
        .filter((t) => t.isOverdue || daysUntilDue(t.dueDate) <= 7)
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 6)
      setWeekTasks(due)
      setHubLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [homeId])

  const handleWholeHome = useCallback(() => {
    setWholeHome((prev) => {
      if (!prev) setSelectedRoomIds(new Set())
      return !prev
    })
  }, [])

  const handleRoomToggle = useCallback((roomId: string) => {
    setWholeHome(false)
    setSelectedRoomIds((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }, [])

  const effectiveRoomIds = useMemo(
    () => wholeHome ? new Set(rooms.map((r) => r.room_id)) : selectedRoomIds,
    [wholeHome, rooms, selectedRoomIds]
  )

  const handleAddCustom = useCallback(() => {
    const title = customInput.trim()
    if (!title) return
    const task: CleanTask = {
      id: crypto.randomUUID(),
      source: "custom",
      title,
      description: null,
      instructions: null,
      itemUnitId: null,
      itemName: null,
      roomId: null,
      roomName: "Routine",
      dueDate: null,
      estimatedMinutes: 15,
      scheduleType: null,
      lastCompletedDate: null,
      staleDays: 9999,
      priorityScore: 0,
      isOverdue: false,
    }
    setCustomTasks((prev) => [...prev, task])
    setCustomInput("")
  }, [customInput])

  const toggleTask = useCallback((id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleExpandTask = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }, [])

  const fromSetupToChecklist = useCallback(async () => {
    if (!homeId || effectiveRoomIds.size === 0 || !selectedTime) return
    setLoading(true)
    setCleanError(null)
    try {
      const all = await getCleaningTasks(homeId, cleanMode)
      console.log("[DeepClean] all tasks:", all.map((t) => ({ id: t.id, roomId: t.roomId, roomName: t.roomName, title: t.title })))
      console.log("[DeepClean] effectiveRoomIds:", [...effectiveRoomIds])
      const filtered = wholeHome
        ? all
        : all.filter((t) => t.roomId == null || effectiveRoomIds.has(t.roomId))
      console.log("[DeepClean] total fetched:", all.length, "after filtering:", filtered.length, "sample:", filtered.slice(0, 3))
      const sorted = [...filtered].sort((a, b) => b.priorityScore - a.priorityScore)
      setTasks(sorted)
      setStep("checklist")
      setSkippedItemKeys(new Set())
      setExpandedItemKeys(new Set())
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load tasks"
      setCleanError(msg)
      console.error("[DeepClean] getCleaningTasks error:", e)
    } finally {
      setLoading(false)
    }
  }, [homeId, effectiveRoomIds, wholeHome, selectedTime, cleanMode])

  const timeLimitMin = selectedTime?.minutes ?? Infinity
  const allTasksForBudget = useMemo(() => {
    const combined = [...tasks, ...customTasks].sort((a, b) => b.priorityScore - a.priorityScore)
    let runningTotal = 0
    const primary: CleanTask[] = []
    const bonus: CleanTask[] = []
    for (const task of combined) {
      const taskMin = task.estimatedMinutes ?? 15
      if (runningTotal + taskMin <= timeLimitMin) {
        primary.push(task)
        runningTotal += taskMin
      } else {
        bonus.push(task)
      }
    }
    return { primary, bonus, runningTotal }
  }, [tasks, customTasks, timeLimitMin])

  const groupByRoom = useCallback((taskList: CleanTask[]) => {
    const byRoom = new Map<string | null, CleanTask[]>()
    for (const t of taskList) {
      const key = t.roomId ?? null
      const list = byRoom.get(key) ?? []
      list.push(t)
      byRoom.set(key, list)
    }
    const roomIds = [...byRoom.keys()].filter((k) => k != null) as string[]
    const roomMap = new Map(rooms.map((r) => [r.room_id, r.name]))
    const groups: { label: string; tasks: CleanTask[] }[] = []
    for (const rid of roomIds.sort((a, b) => (roomMap.get(a) ?? "").localeCompare(roomMap.get(b) ?? ""))) {
      groups.push({ label: roomMap.get(rid) ?? "Room", tasks: byRoom.get(rid) ?? [] })
    }
    const general = byRoom.get(null) ?? []
    if (general.length > 0) {
      groups.push({ label: "General", tasks: general })
    }
    return groups
  }, [rooms])

  const groupByItem = useCallback((taskList: CleanTask[]) => {
    const byRoom = new Map<string, { roomName: string; byItem: Map<string, CleanTask[]> }>()

    for (const t of taskList) {
      const roomKey = t.roomId ?? "__none__"
      const roomName = t.roomName ?? "General"
      if (!byRoom.has(roomKey)) {
        byRoom.set(roomKey, { roomName, byItem: new Map() })
      }
      const room = byRoom.get(roomKey)!
      const itemKey = t.itemName ?? "__routine__"
      if (!room.byItem.has(itemKey)) room.byItem.set(itemKey, [])
      room.byItem.get(itemKey)!.push(t)
    }

    const result: Array<{
      roomKey: string
      roomName: string
      items: Array<{ itemKey: string; itemName: string | null; tasks: CleanTask[] }>
    }> = []

    for (const [roomKey, { roomName, byItem }] of byRoom) {
      const items = Array.from(byItem.entries())
        .map(([itemKey, tasks]) => ({
          itemKey,
          itemName: tasks[0]?.itemName ?? null,
          tasks: [...tasks].sort((a, b) => b.priorityScore - a.priorityScore),
        }))
        .sort((a, b) => (b.tasks[0]?.priorityScore ?? 0) - (a.tasks[0]?.priorityScore ?? 0))

      if (items.length > 0) {
        result.push({ roomKey, roomName, items })
      }
    }

    return result.sort((a, b) => a.roomName.localeCompare(b.roomName))
  }, [])

  const { primary: primaryTasks, bonus: bonusTasks, runningTotal } = allTasksForBudget
  const completedCount = useMemo(
    () => [...primaryTasks, ...bonusTasks].filter((t) => completedIds.has(t.id)).length,
    [primaryTasks, bonusTasks, completedIds]
  )

  const fromChecklistToSummary = useCallback(async () => {
    if (!homeId) return
    setFinishing(true)
    setCleanError(null)
    const toMark = [...tasks, ...customTasks].filter(
      (t) => completedIds.has(t.id) && (t.source === "instance" || t.source === "routine")
    )
    const results = await Promise.all(toMark.map((t) => markTaskInstanceDone(homeId, t.id)))
    const failCount = results.filter((r) => !r.success).length
    if (failCount > 0) {
      setCleanError(
        `${failCount} task${failCount === 1 ? "" : "s"} couldn't be saved. ` +
          "Your session is recorded, but some completions may not appear in history."
      )
    }
    const completedTotal = [...tasks, ...customTasks].filter((t) => completedIds.has(t.id)).length
    const minutesTotal = [...tasks, ...customTasks]
      .filter((t) => completedIds.has(t.id))
      .reduce((sum, t) => sum + (t.estimatedMinutes ?? 15), 0)
    const roomNames = [
      ...new Set(
        [...tasks, ...customTasks]
          .filter((t) => completedIds.has(t.id) && t.roomName)
          .map((t) => t.roomName!)
      ),
    ].filter(Boolean)
    setSummaryCompleted(completedTotal)
    setSummaryTotal(tasks.length + customTasks.length)
    setSummaryMinutes(minutesTotal)
    setSummaryRooms(roomNames)
    setFinishing(false)
    setStep("summary")
  }, [homeId, tasks, customTasks, completedIds])

  const handleSaveCustomToRoutine = useCallback(
    async (task: CleanTask) => {
      if (!homeId || task.source !== "custom") return
      const result = await saveRoutineTask(homeId, task.title, "monthly", null)
      if (!("error" in result)) {
        setSavedCustomIds((prev) => new Set(prev).add(task.id))
      }
    },
    [homeId]
  )

  const uncompletedCustom = useMemo(
    () => customTasks.filter((t) => !completedIds.has(t.id)),
    [customTasks, completedIds]
  )

  // A session is "in progress" once we've moved past setup into the run/summary.
  const sessionInProgress = step === "checklist" || step === "summary"

  // Enter the session flow from the hub. Resume keeps the existing run state;
  // a fresh start drops back to setup.
  const enterSession = useCallback(() => {
    if (!sessionInProgress) setStep("setup")
    setView("session")
  }, [sessionInProgress])

  const backToHub = useCallback(() => setView("hub"), [])

  if (!homeId) {
    return (
      <PageContainer>
        <PageHeader title="Clean" subtitle="Select a home to continue." />
      </PageContainer>
    )
  }

  if (view === "hub") {
    return (
      <PageContainer className="pb-24">
        <CleanHub
          guides={guides}
          weekTasks={weekTasks}
          loading={hubLoading}
          resuming={sessionInProgress}
          onStart={enterSession}
          onToggleWeekTask={toggleTask}
          completedIds={completedIds}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="pb-24">
      <PageHeader
        title="Clean"
        subtitle={
          step === "setup"
            ? "Pick rooms and your time budget."
            : step === "checklist"
              ? "Check off cleaning tasks."
              : "All done!"
        }
      />

      {step === "setup" && (
        <SectionCard>
          <CardContent className="p-4 space-y-6">
            <div>
              <div className="text-sm font-medium mb-2">Rooms</div>
              <button
                type="button"
                onClick={handleWholeHome}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                  wholeHome
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-muted/30 hover:border-foreground/30"
                )}
              >
                Whole Home
              </button>
              <div className="flex items-center gap-2 my-3">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground">or choose rooms</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <div className="flex flex-wrap gap-2">
                {rooms.map((r) => (
                  <button
                    key={r.room_id}
                    type="button"
                    onClick={() => handleRoomToggle(r.room_id)}
                    className={cn(
                      "rounded-full px-4 py-2 text-sm font-medium border transition-colors",
                      selectedRoomIds.has(r.room_id) && !wholeHome
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-muted/30 hover:border-foreground/30"
                    )}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Time budget</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TIME_OPTIONS.map((opt) => {
                  const on = selectedTime.label === opt.label
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setSelectedTime(opt)}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        on
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30 hover:border-foreground/30"
                      )}
                    >
                      <div className="text-base font-bold tracking-tight">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.note}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {cleanError && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {cleanError}
              </div>
            )}
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={backToHub}>
                Cancel
              </Button>
              <Button
                disabled={effectiveRoomIds.size === 0 || loading}
                onClick={fromSetupToChecklist}
              >
                {loading ? "Loading…" : "Let's clean →"}
              </Button>
            </div>
          </CardContent>
        </SectionCard>
      )}

      {step === "checklist" && (
        <>
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              ~{runningTotal} min · {primaryTasks.length} tasks
            </div>

            {primaryTasks.length === 0 && bonusTasks.length === 0 ? (
              <SectionCard>
                <CardContent className="p-4 text-sm text-muted-foreground">
                  No cleaning tasks in the selected rooms.
                </CardContent>
              </SectionCard>
            ) : (
              <>
                {(() => {
                  const visibleTasks = primaryTasks.filter(
                    (t) => !skippedItemKeys.has(t.itemName ?? "__routine__")
                  )
                  const roomGroups = groupByItem(visibleTasks)
                  const showRoomHeader = roomGroups.length > 1

                  return (
                    <>
                      {roomGroups.map(({ roomKey, roomName, items }) => (
                        <div key={roomKey} className="mb-6">
                          {showRoomHeader && (
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-3 px-1">
                              {roomName}
                            </p>
                          )}
                          <div className="space-y-3">
                            {items.map(({ itemKey, itemName, tasks: itemTasks }) => {
                              const SHOW_DEFAULT = 3
                              const isItemExpanded = expandedItemKeys.has(itemKey)
                              const visibleItemTasks = isItemExpanded ? itemTasks : itemTasks.slice(0, SHOW_DEFAULT)
                              const hiddenCount = itemTasks.length - SHOW_DEFAULT
                              const doneCount = itemTasks.filter((t) => completedIds.has(t.id)).length

                              return (
                                <div
                                  key={itemKey}
                                  className="rounded-xl border border-border bg-card overflow-hidden"
                                >
                                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-muted/20">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-foreground">
                                        {itemName ?? "General tasks"}
                                      </span>
                                      {doneCount > 0 && (
                                        <span className="text-xs text-primary font-medium">
                                          {doneCount}/{itemTasks.length} done
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setSkippedItemKeys((prev) => {
                                          const next = new Set(prev)
                                          next.add(itemKey)
                                          return next
                                        })
                                      }
                                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded hover:bg-destructive/5 transition-colors"
                                      aria-label={`Skip ${itemName ?? "these tasks"} today`}
                                    >
                                      <X className="size-3" />
                                      Skip
                                    </button>
                                  </div>

                                  <div className="divide-y divide-border/40">
                                    {visibleItemTasks.map((task) => (
                                      <CleanTaskRow
                                        key={task.id}
                                        task={task}
                                        checked={completedIds.has(task.id)}
                                        onToggle={() => toggleTask(task.id)}
                                        isCustom={task.source === "custom"}
                                        expanded={expandedId === task.id}
                                        onExpand={() => handleExpandTask(task.id)}
                                        hideRoom
                                      />
                                    ))}
                                  </div>

                                  {!isItemExpanded && hiddenCount > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedItemKeys((prev) => new Set(prev).add(itemKey))
                                      }
                                      className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground border-t border-border/40 bg-muted/10 hover:bg-muted/20 transition-colors"
                                    >
                                      + {hiddenCount} more task{hiddenCount === 1 ? "" : "s"}
                                    </button>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}

                      {skippedItemKeys.size > 0 && (
                        <div className="mt-2 rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground mb-2">
                            Skipped today
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {[...skippedItemKeys].map((itemKey) => {
                              const label =
                                primaryTasks.find((t) => (t.itemName ?? "__routine__") === itemKey)
                                  ?.itemName ?? "General tasks"
                              return (
                                <button
                                  key={itemKey}
                                  type="button"
                                  onClick={() =>
                                    setSkippedItemKeys((prev) => {
                                      const next = new Set(prev)
                                      next.delete(itemKey)
                                      return next
                                    })
                                  }
                                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                                >
                                  <RotateCcw className="size-3" />
                                  {label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )
                })()}

                <div className="flex gap-2 mt-4">
                  <Input
                    placeholder="Add a task..."
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddCustom()}
                  />
                  <Button
                    variant="outline"
                    onClick={handleAddCustom}
                    disabled={!customInput.trim()}
                  >
                    Add
                  </Button>
                </div>

                {bonusTasks.length > 0 && selectedTime?.minutes != null && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setBonusOpen(!bonusOpen)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {bonusOpen ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                      If you have more time ({bonusTasks.length} more tasks)
                    </button>
                    {bonusOpen &&
                      groupByRoom(bonusTasks).map(({ label, tasks: groupTasks }) => (
                        <div key={label} className="mt-2">
                          <div className="text-sm font-medium text-muted-foreground mb-2">{label}</div>
                          <div className="space-y-2">
                            {groupTasks.map((task) => (
                              <CleanTaskRow
                                key={task.id}
                                task={task}
                                checked={completedIds.has(task.id)}
                                onToggle={() => toggleTask(task.id)}
                                isCustom={task.source === "custom"}
                                expanded={expandedId === task.id}
                                onExpand={() => handleExpandTask(task.id)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="fixed bottom-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-t border-border">
            <span className="text-sm text-muted-foreground">
              {completedCount} tasks selected
            </span>
            <Button onClick={fromChecklistToSummary} disabled={finishing}>
              {finishing ? "Finishing…" : "Finish session →"}
            </Button>
          </div>
        </>
      )}

      {step === "summary" && (
        <SectionCard>
          <CardContent className="p-6 text-center space-y-4">
            <div className="text-6xl text-green-500">✓</div>
            <p className="text-lg font-medium">
              {MOTIVATING_MESSAGES[Math.floor(Math.random() * MOTIVATING_MESSAGES.length)]}
            </p>
            <p className="text-muted-foreground">
              {summaryCompleted} of {summaryTotal} tasks completed
              <br />
              ~{summaryMinutes} min · {summaryRooms.join(", ") || "—"}
            </p>

            {uncompletedCustom.length > 0 && (
              <div className="border-t pt-4 text-left">
                <p className="text-sm font-medium mb-2">Save these to your routine?</p>
                <div className="space-y-2">
                  {uncompletedCustom.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="text-sm">{task.title}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={savedCustomIds.has(task.id)}
                        onClick={() => handleSaveCustomToRoutine(task)}
                      >
                        {savedCustomIds.has(task.id) ? "Saved ✓" : "Save"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button className="w-full" onClick={() => navigate("/home")}>
              Done
            </Button>
          </CardContent>
        </SectionCard>
      )}
    </PageContainer>
  )
}

// ── Clean hub ────────────────────────────────────────────────────────────────
// Landing surface for /clean. A green "Start cleaning" hero enters the session
// flow; a curated guides grid (getDeepCleanGuides — NOT the raw per-step feed);
// and a short "This week" list of due/overdue cleaning tasks.

function HubSectionLabel({
  children,
  right,
}: {
  children: React.ReactNode
  right?: React.ReactNode
}) {
  return (
    <div className="mb-2.5 flex items-baseline justify-between">
      <span className="text-[11px] font-bold uppercase tracking-[0.3px]" style={{ color: SUB }}>
        {children}
      </span>
      {right}
    </div>
  )
}

function HubGlyph({ size = 42 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl"
      style={{ width: size, height: size, background: "var(--hh-teal-wash)" }}
    >
      <SprayCanIcon style={{ color: TEAL, width: size * 0.5, height: size * 0.5 }} />
    </div>
  )
}

function CleanHub({
  guides,
  weekTasks,
  loading,
  resuming,
  onStart,
  onToggleWeekTask,
  completedIds,
}: {
  guides: DeepCleanGuide[]
  weekTasks: CleanTask[]
  loading: boolean
  resuming: boolean
  onStart: () => void
  onToggleWeekTask: (id: string) => void
  completedIds: Set<string>
}) {
  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.7px]" style={{ color: INK }}>
            Clean
          </h1>
          <div className="mt-1.5 text-[13.5px]" style={{ color: SUB }}>
            A calm way to keep things fresh — guided sessions and step-by-step guides.
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        <div className="flex flex-col gap-6">
          {/* Hero: start / resume session */}
          <button
            type="button"
            onClick={onStart}
            className="w-full rounded-2xl p-6 text-left text-white shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
            style={{ background: "linear-gradient(150deg,var(--hh-teal),var(--hh-teal-deep))" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex size-[54px] shrink-0 items-center justify-center rounded-[15px]" style={{ background: "rgba(255,255,255,0.16)" }}>
                {resuming ? <RotateCcw className="size-7" /> : <SprayCanIcon className="size-7" />}
              </div>
              <div className="min-w-0 flex-1">
                {resuming && (
                  <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.5px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                    In progress
                  </div>
                )}
                <div className="text-[19px] font-extrabold tracking-[-0.3px]">
                  {resuming ? "Resume session" : "Start cleaning"}
                </div>
                <div className="mt-0.5 text-[13.5px]" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {resuming
                    ? "Pick up where you left off."
                    : "Pick rooms and a time budget — we'll size a checklist to fit."}
                </div>
              </div>
              <ArrowRight className="size-[22px]" style={{ color: "rgba(255,255,255,0.9)" }} />
            </div>
          </button>

          {/* Cleaning guides grid — curated guide-level list, not per-step. */}
          <div>
            <HubSectionLabel right={<span className="text-[12.5px] font-semibold" style={{ color: SUB }}>{guides.length} guide{guides.length === 1 ? "" : "s"}</span>}>
              Cleaning guides
            </HubSectionLabel>
            {loading ? (
              <div className="rounded-2xl bg-[var(--hh-surface)] py-12 text-center text-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ color: SUB }}>
                Loading…
              </div>
            ) : guides.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl bg-[var(--hh-surface)] px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: "var(--hh-teal-wash)" }}>
                  <SparklesIcon className="size-[18px]" style={{ color: TEAL }} />
                </div>
                <div className="text-[13.5px]" style={{ color: SUB }}>
                  No cleaning guides yet — start a session to build a checklist.
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3.5">
                {guides.map((g) => {
                  const card = (
                    <>
                      <HubGlyph />
                      <div className="text-[14.5px] font-bold leading-tight tracking-[-0.2px]" style={{ color: INK }}>
                        {g.title}
                      </div>
                      {g.estimatedMinutes != null && (
                        <div className="mt-auto text-[12.5px]" style={{ color: SUB }}>
                          {g.estimatedMinutes} min guide
                        </div>
                      )}
                    </>
                  )
                  const cls = "flex flex-col gap-2.5 rounded-2xl bg-[var(--hh-surface)] p-4 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                  return g.itemUnitId ? (
                    <Link key={g.id} to={`/clean/${g.itemUnitId}`} className={`${cls} transition-shadow hover:shadow-[0_4px_16px_rgba(15,23,42,0.1)]`}>
                      {card}
                    </Link>
                  ) : (
                    <div key={g.id} className={cls}>{card}</div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* This week — due / overdue cleaning tasks, short list. */}
        <div>
          <HubSectionLabel>This week</HubSectionLabel>
          {loading ? (
            <div className="rounded-2xl bg-[var(--hh-surface)] py-12 text-center text-[14px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ color: SUB }}>
              Loading…
            </div>
          ) : weekTasks.length === 0 ? (
            <div className="rounded-2xl bg-[var(--hh-surface)] px-4 py-6 text-center text-[13.5px] shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ color: SUB }}>
              Nothing due this week — enjoy the calm.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">
              {weekTasks.map((t, i) => {
                const due = dueLabel(t)
                const done = completedIds.has(t.id)
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-3 px-4 py-3"
                    style={{ borderTop: i ? "0.5px solid var(--hh-line)" : "none" }}
                  >
                    <button
                      type="button"
                      onClick={() => onToggleWeekTask(t.id)}
                      aria-label={done ? "Mark not done" : "Mark done"}
                      className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                      style={{ borderColor: TEAL, background: done ? TEAL : "transparent" }}
                    >
                      {done && <CheckIcon className="size-3 text-white" strokeWidth={3} />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className={cn("truncate text-[13.5px] font-semibold", done && "line-through opacity-60")} style={{ color: INK }}>
                        {t.title}
                      </div>
                      <div className="mt-px text-[12px]" style={{ color: SUB }}>
                        {(t.itemName ?? t.roomName ?? "Home")} · {t.estimatedMinutes ?? 15} min
                      </div>
                    </div>
                    <span
                      className="shrink-0 whitespace-nowrap text-[12px] font-bold"
                      style={{ color: due.overdue ? CLAY : due.text === "Today" ? TEAL : SUB }}
                    >
                      {due.text}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function parseSteps(instructions: string): string[] {
  // 1. Try JSON format: { steps: string[] }
  try {
    const parsed = JSON.parse(instructions) as { steps?: string[] }
    if (Array.isArray(parsed?.steps) && parsed.steps.length > 0) return parsed.steps
  } catch {
    /* not JSON */
  }

  // 2. Try newline-separated numbered lines: "1. Do this\n2. Do that"
  const lines = instructions
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l))
  if (numbered.length >= 2) return numbered.map((l) => l.replace(/^\d+[.)]\s+/, ""))

  // 3. Try inline numbered segments: "1. Do this 2. Do that"
  const segments = instructions.split(/\s+(?=\d+[.)]\s)/)
  const inlineSteps = segments.map((s) => s.replace(/^\d+[.)]\s+/, "").trim()).filter(Boolean)
  if (inlineSteps.length >= 2) return inlineSteps

  // 4. Fall back: split prose by sentence boundaries (". " or ".\n")
  const sentences = instructions
    .split(/\.(?:\s+|\n)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10) // skip very short fragments
  if (sentences.length >= 2) return sentences.map((s) => (s.endsWith(".") ? s : s + "."))

  // 5. Single block — return as-is
  return [instructions.trim()]
}

function CleanTaskRow({
  task,
  checked,
  onToggle,
  isCustom,
  expanded,
  onExpand,
  hideRoom,
}: {
  task: CleanTask
  checked: boolean
  onToggle: () => void
  isCustom?: boolean
  expanded?: boolean
  onExpand?: () => void
  hideRoom?: boolean
}) {
  const hasDetails = !!(task.instructions ?? task.description)
  return (
    <div
      className={cn(
        "flex flex-col gap-0 p-0 rounded-lg border transition-colors",
        checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
      )}
    >
      <label
        className={cn(
          "flex items-start gap-3 p-3 cursor-pointer",
          checked && "line-through opacity-70"
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1 rounded border-border"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium">{task.title}</span>
            {isCustom && (
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                custom
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-muted-foreground">
            {task.itemName && <span>{task.itemName}</span>}
            {!hideRoom && task.roomName && <span>· {task.roomName}</span>}
            <span>
              Last done: {formatStaleDays(task.staleDays)}
              {task.scheduleType && ` · ${task.scheduleType}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onExpand?.()
              }}
              className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse instructions" : "Expand instructions"}
            >
              {expanded ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          )}
          <span className="text-xs text-muted-foreground">
            ~{task.estimatedMinutes ?? 15} min
          </span>
        </div>
      </label>
      {expanded && hasDetails && (
        <div className="border-t border-border/40 px-4 py-3 space-y-3">
          {task.description && (
            <p className="text-xs text-muted-foreground italic leading-relaxed">{task.description}</p>
          )}
          {task.instructions &&
            (() => {
              const { steps, cautions } = splitCautions(parseSteps(task.instructions))
              return (
                <>
                  {steps.length === 1 ? (
                    <p className="text-sm text-foreground leading-relaxed">{steps[0]}</p>
                  ) : steps.length > 1 ? (
                    <div className="space-y-2.5">
                      {steps.map((step, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {i + 1}
                          </span>
                          <p className="text-sm text-foreground leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <CautionCallout cautions={cautions} />
                </>
              )
            })()}
        </div>
      )}
    </div>
  )
}
