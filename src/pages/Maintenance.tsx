import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarClock, CheckCircle2, PlusIcon, X } from "lucide-react"
import { PageContainer, PageHeader, SectionCard, StatCard, StatRow } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/layout"
import { MaintenanceTaskRow } from "@/components/maintenance/MaintenanceTaskRow"
import { AddTaskSheet } from "@/components/maintenance/AddTaskSheet"
import { TaskDetailSheet } from "@/components/maintenance/TaskDetailSheet"
import { getAllMaintenanceTasks, getDashboardStats, priorityToTier, type MaintenanceTaskFull, type DashboardStats, type TaskPriority } from "@/lib/dashboard"
import { saveStandaloneTask } from "@/lib/cleanSession"
import { generateTaskInstances, markTaskInstanceDone, snoozeTaskInstance, updateTaskSchedule } from "@/modules/care"
import { useCurrentPropertyCompat as useCurrentProperty, useCurrentHome, getRooms } from "@/modules/home"
import { RefinedWeek } from "@/components/home/RefinedWeek"
import { DesktopTasks } from "@/components/home/DesktopTasks"
import { useUserLevel } from "@/hooks/useUserLevel"
import { cn } from "@/lib/utils"

// ── Date helpers ────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Filter types ──────────────────────────────────────────────────────────────

type StatusFilter = "all" | "overdue" | "due_soon" | "upcoming" | "no_date"
type TierFilter = "all" | "critical" | "high" | "medium" | "low"
type GroupBy = "none" | "room" | "tier"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "due_soon", label: "Due Soon" },
  { value: "upcoming", label: "Upcoming" },
  { value: "no_date", label: "No Date" },
]

// Product tier model is 3-tier (Essential/Recommended/Optional). Legacy `low`
// and `medium` priorities both map to Optional (see TierBadge LEGACY_MAP), so
// there's no separate "Low" filter — `low` folds into Optional everywhere.
const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Essential" },
  { value: "high", label: "Recommended" },
  { value: "medium", label: "Optional" },
]

const TIER_ORDER: TaskPriority[] = ["critical", "high", "medium"]
const TIER_LABELS: Record<TaskPriority, string> = {
  critical: "Essential",
  high: "Recommended",
  medium: "Optional",
  low: "Optional",
}

/** Fold legacy `low` priority into `medium` (Optional) for the 3-tier model. */
function normalizeTier(priority: TaskPriority): TaskPriority {
  return priority === "low" ? "medium" : priority
}

const SNOOZE_OPTIONS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyFilters(
  tasks: MaintenanceTaskFull[],
  status: StatusFilter,
  tier: TierFilter,
  room: string | null
): MaintenanceTaskFull[] {
  return tasks.filter((t) => {
    if (status === "overdue" && !t.isOverdue) return false
    if (status === "due_soon" && !(t.isDueSoon && !t.isOverdue)) return false
    if (status === "upcoming" && !(!t.isOverdue && !t.isDueSoon && t.next_due_date !== null)) return false
    if (status === "no_date" && t.next_due_date !== null) return false
    if (tier !== "all" && normalizeTier(t.priority) !== tier) return false
    if (room !== null && t.locationId !== room) return false
    return true
  })
}

type TaskGroup = { key: string; label: string; tasks: MaintenanceTaskFull[] }

function groupTasks(
  tasks: MaintenanceTaskFull[],
  groupBy: GroupBy,
  locationMap: Map<string, string>
): TaskGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", tasks }]

  if (groupBy === "tier") {
    return TIER_ORDER
      .map((tier) => ({
        key: tier,
        label: TIER_LABELS[tier],
        tasks: tasks.filter((t) => normalizeTier(t.priority) === tier),
      }))
      .filter((g) => g.tasks.length > 0)
  }

  // groupBy === "room"
  // Group by locationName (from room table) since locationId may not match legacy locations
  const byRoomName = new Map<string, MaintenanceTaskFull[]>()
  const unassigned: MaintenanceTaskFull[] = []
  for (const t of tasks) {
    const roomLabel = t.locationName ?? (t.locationId ? locationMap.get(t.locationId) ?? null : null)
    if (roomLabel) {
      const list = byRoomName.get(roomLabel) ?? []
      list.push(t)
      byRoomName.set(roomLabel, list)
    } else {
      unassigned.push(t)
    }
  }
  const groups: TaskGroup[] = []
  for (const [name, roomTasks] of byRoomName) {
    groups.push({ key: name, label: name, tasks: roomTasks })
  }
  groups.sort((a, b) => a.label.localeCompare(b.label))
  if (unassigned.length > 0) {
    groups.push({ key: "__unassigned__", label: "Unassigned", tasks: unassigned })
  }
  return groups
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Maintenance() {
  const { property } = useCurrentProperty()
  const propertyId = property?.id ?? null
  const { home } = useCurrentHome()
  const { level } = useUserLevel()

  // Rooms for filtering + grouping
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  useEffect(() => {
    if (!home?.home_id) return
    getRooms(home.home_id).then((r) =>
      setLocations((r.data ?? []).map((rm) => ({ id: rm.room_id, name: rm.name })))
    )
  }, [home?.home_id])

  const [tasks, setTasks] = useState<MaintenanceTaskFull[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const [detailTask, setDetailTask] = useState<MaintenanceTaskFull | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailStartEdit, setDetailStartEdit] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [tierFilter, setTierFilter] = useState<TierFilter>("all")
  const [roomFilter, setRoomFilter] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>("none")

  // Add task
  const [addTaskOpen, setAddTaskOpen] = useState(false)

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const locationMap = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations]
  )

  const load = useCallback(async () => {
    if (!propertyId) return
    setLoading(true)
    setError(null)
    try {
      const [taskList, dashStats] = await Promise.all([
        getAllMaintenanceTasks(propertyId),
        getDashboardStats(propertyId),
      ])
      setTasks(taskList)
      setStats(dashStats)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => {
    load()
  }, [load])

  // ── Filtered + grouped ──────────────────────────────────────────────────────

  const filteredTasks = useMemo(
    () => applyFilters(tasks, statusFilter, tierFilter, roomFilter),
    [tasks, statusFilter, tierFilter, roomFilter]
  )

  const dayFilteredTasks = filteredTasks

  const groups = useMemo(
    () => groupTasks(dayFilteredTasks, groupBy, locationMap),
    [dayFilteredTasks, groupBy, locationMap]
  )

  // Filter counts for status tabs
  const statusCounts = useMemo(() => ({
    all: tasks.length,
    overdue: tasks.filter((t) => t.isOverdue).length,
    due_soon: tasks.filter((t) => t.isDueSoon && !t.isOverdue).length,
    upcoming: tasks.filter((t) => !t.isOverdue && !t.isDueSoon && t.next_due_date !== null).length,
    no_date: tasks.filter((t) => t.next_due_date === null).length,
  }), [tasks])

  // Essential-only overdue count. Per the Essential-only overdue principle,
  // only Essential (critical) tasks count as "overdue" in the headline stat —
  // matching the Home health card. Recommended/Optional past-date tasks are
  // still listed and filterable, but don't inflate the overdue number.
  const essentialOverdueCount = useMemo(
    () => tasks.filter((t) => t.isOverdue && t.priority === "critical").length,
    [tasks]
  )

  // Rooms that have tasks in the current filtered set (for room dropdown)
  const activeRooms = useMemo(() => {
    const ids = new Set(tasks.filter((t) => t.locationId).map((t) => t.locationId!))
    return locations.filter((l) => ids.has(l.id))
  }, [tasks, locations])

  // Snooze
  const [snoozingId, setSnoozingId] = useState<string | null>(null)

  // ── Single task complete ────────────────────────────────────────────────────

  const handleMarkComplete = useCallback(
    async (taskId: string) => {
      if (!propertyId) return
      setCompletingId(taskId)
      const result = await markTaskInstanceDone(propertyId, taskId)
      setCompletingId(null)
      if (result.success) {
        await load()
      } else {
        setError(result.error)
      }
    },
    [propertyId, load]
  )

  const handleSnooze = useCallback(
    async (taskId: string, days: number) => {
      if (!propertyId) return
      setSnoozingId(taskId)
      await snoozeTaskInstance(propertyId, taskId, addDays(todayStr(), days))
      setSnoozingId(null)
      await load()
    },
    [propertyId, load]
  )

  const openDetail = (t: MaintenanceTaskFull, startEdit = false) => {
    setDetailTask(t)
    setDetailOpen(true)
    setDetailStartEdit(startEdit)
  }

  // ── Selection ───────────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(dayFilteredTasks.map((t) => t.id)))
  }, [dayFilteredTasks])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // ── Bulk actions ────────────────────────────────────────────────────────────

  const runBulk = useCallback(
    async (fn: () => Promise<{ success: boolean; error?: string }>) => {
      setBulkLoading(true)
      setBulkError(null)
      const result = await fn()
      setBulkLoading(false)
      if (result.success) {
        clearSelection()
        await load()
      } else {
        setBulkError(result.error ?? "Action failed")
      }
    },
    [clearSelection, load]
  )

  const handleBulkComplete = useCallback(() => {
    if (!propertyId || selectedIds.size === 0) return
    const ids = [...selectedIds]
    runBulk(async () => {
      const errors: string[] = []
      await Promise.all(
        ids.map(async (id) => {
          const r = await markTaskInstanceDone(propertyId, id)
          if (!r.success) errors.push(r.error ?? "Unknown error")
        })
      )
      if (errors.length === 0) return { success: true }
      const msg =
        errors.length === 1
          ? errors[0]
          : `${errors.length} of ${ids.length} tasks failed to complete`
      return { success: false, error: msg }
    })
  }, [propertyId, selectedIds, runBulk])

  const handleBulkSnooze = useCallback(
    (days: number) => {
      if (!propertyId || selectedIds.size === 0) return
      const ids = [...selectedIds]
      const until = addDays(todayStr(), days)
      runBulk(async () => {
        const errors: string[] = []
        await Promise.all(
          ids.map(async (id) => {
            const r = await snoozeTaskInstance(propertyId, id, until)
            if (!r.success) errors.push(r.error)
          })
        )
        return errors.length === 0
          ? { success: true }
          : { success: false, error: `${errors.length} of ${ids.length} tasks failed to snooze` }
      })
    },
    [propertyId, selectedIds, runBulk]
  )

  const handleBulkChangeTier = useCallback(
    (tier: TaskPriority) => {
      if (!propertyId || selectedIds.size === 0) return
      // Tier lives on the task_template in v1.1; map each selected instance to
      // its template and convert the legacy priority to a v1.1 tier.
      const priorityTier = priorityToTier(tier)
      const templateIds = [...selectedIds]
        .map((id) => tasks.find((t) => t.id === id)?.task_template_id)
        .filter((id): id is string => !!id)
      runBulk(async () => {
        const errors: string[] = []
        await Promise.all(
          templateIds.map(async (templateId) => {
            const r = await updateTaskSchedule(templateId, { priorityTier })
            if (r.error) errors.push(r.error.message)
          })
        )
        return errors.length === 0
          ? { success: true }
          : { success: false, error: `${errors.length} of ${templateIds.length} tasks failed to update` }
      })
    },
    [propertyId, selectedIds, runBulk, tasks]
  )

  // ── Add standalone task ──────────────────────────────────────────────────────

  const handleAddTask = useCallback(
    async (data: {
      title: string
      scheduleType: string
      careType: "cleaning" | "maintenance" | "mixed"
      priorityTier: "essential" | "recommended" | "optional"
      estimatedMinutes: number | null
      roomId: string | null
    }) => {
      if (!propertyId) throw new Error("No property")
      const result = await saveStandaloneTask(propertyId, data)
      if ("error" in result) throw new Error(result.error)

      // Generate the first task instance so it shows up immediately
      await generateTaskInstances({
        home_id: propertyId,
        task_template_id: result.task_template_id,
        item_unit_id: null,
      })

      await load()
    },
    [propertyId, load]
  )

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer>
        <header>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-8 w-64 mt-4" />
        <Skeleton className="h-64 rounded-xl mt-2" />
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer className="max-w-2xl space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Something went wrong</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <span>{error}</span>
            <Button variant="outline" size="sm" className="w-fit" onClick={load}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </PageContainer>
    )
  }

  const hasSelection = selectedIds.size > 0

  return (
    <PageContainer className="pb-28">
      {/* Redesigned "This week": RefinedWeek (mobile) · DesktopTasks (lg+) */}
      <div className="lg:hidden -mx-6">
        <div className="mx-auto w-full max-w-[460px]">
          <RefinedWeek homeId={home?.home_id ?? null} />
        </div>
      </div>
      <div className="hidden lg:block">
        <DesktopTasks homeId={home?.home_id ?? null} />
      </div>
      {/* Old management hub kept hidden until the desktop redesign lands */}
      <div className="hidden">
      <PageHeader
        title="All Tasks"
        subtitle={
          tasks.length === 0
            ? "No maintenance tasks yet."
            : `${tasks.length} task${tasks.length === 1 ? "" : "s"} across your home.`
        }
        action={
          <Button size="sm" onClick={() => setAddTaskOpen(true)}>
            <PlusIcon className="size-4 mr-1.5" />
            Add Task
          </Button>
        }
      />

      {stats && (
        <StatRow className="mt-2 md:grid-cols-3">
          <StatCard
            icon={AlertTriangle}
            value={essentialOverdueCount}
            label="Overdue"
            variant={essentialOverdueCount > 0 ? "destructive" : "default"}
          />
          <StatCard icon={CalendarClock} value={stats.dueSoonCount} label="Due This Week" />
          <StatCard icon={CheckCircle2} value={stats.completedThisMonth} label="Completed" />
        </StatRow>
      )}

      {/* Progressive complexity: filters/group-by are hidden at the Essentials
          level — a minimal user just sees the plain task list. */}
      {level !== "essentials" && (<>
      {/* ── Status filter tabs ── */}
      <div className="flex gap-1 overflow-x-auto mt-4 pb-0.5 no-scrollbar" role="tablist" aria-label="Filter by status">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              statusFilter === opt.value
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
            {statusCounts[opt.value] > 0 && opt.value !== "all" && (
              <span className="ml-1.5 text-xs opacity-70">{statusCounts[opt.value]}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Secondary filters: tier + room + group-by ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3">
        {/* Tier chips */}
        <div className="flex items-center gap-1 flex-wrap" role="group" aria-label="Filter by tier">
          {TIER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTierFilter(opt.value)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors",
                tierFilter === opt.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Room filter */}
        {activeRooms.length > 0 && (
          <select
            aria-label="Filter by room"
            value={roomFilter ?? ""}
            onChange={(e) => setRoomFilter(e.target.value || null)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground"
          >
            <option value="">All rooms</option>
            {activeRooms.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        )}

        {/* Group by */}
        <div className="flex items-center gap-1 ml-auto" role="group" aria-label="Group by">
          <span className="text-xs text-muted-foreground mr-1">Group:</span>
          {(["none", "room", "tier"] as GroupBy[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupBy(g)}
              className={cn(
                "px-2.5 py-1 rounded text-xs font-medium border transition-colors capitalize",
                groupBy === g
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              )}
            >
              {g === "none" ? "None" : g === "room" ? "Room" : "Tier"}
            </button>
          ))}
        </div>
      </div>

      </>)}

      {/* ── Task list ── */}
      <div className="mt-4 space-y-4">
        {dayFilteredTasks.length === 0 ? (
          <SectionCard>
            <CardContent className="p-4">
              <EmptyState
                title="No tasks match"
                description="Try adjusting your filters."
              />
            </CardContent>
          </SectionCard>
        ) : (
          groups.map((group) => (
            <SectionCard key={group.key}>
              {group.label && (
                <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{group.label}</span>
                  <span className="text-xs text-muted-foreground">({group.tasks.length})</span>
                </div>
              )}
              <CardContent className={cn("p-4", group.label && "pt-0")}>
                <div>
                  {group.tasks.map((task) => (
                    <MaintenanceTaskRow
                      key={task.id}
                      task={task}
                      onMarkComplete={hasSelection ? undefined : handleMarkComplete}
                      onSnooze={hasSelection ? undefined : handleSnooze}
                      completingId={completingId}
                      snoozingId={snoozingId}
                      isSelected={selectedIds.has(task.id)}
                      onToggleSelect={level === "power" ? toggleSelect : undefined}
                      onClick={() => openDetail(task, false)}
                      onEdit={() => openDetail(task, true)}
                    />
                  ))}
                </div>
              </CardContent>
            </SectionCard>
          ))
        )}
      </div>

      {/* ── Bulk action bar ── */}
      {hasSelection && (
        <div
          className="fixed bottom-16 inset-x-0 z-40 flex items-center gap-2 px-4 py-3 bg-background border-t border-border shadow-lg"
          role="toolbar"
          aria-label="Bulk actions"
        >
          <span className="text-sm font-medium text-foreground shrink-0">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={selectAll}
            className="text-xs text-primary hover:underline shrink-0"
          >
            Select all ({dayFilteredTasks.length})
          </button>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {bulkError && (
              <span className="text-xs text-destructive">{bulkError}</span>
            )}

            {/* Mark complete */}
            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkComplete}
              disabled={bulkLoading}
              className="text-xs h-8"
            >
              {bulkLoading ? "..." : "Mark complete"}
            </Button>

            {/* Change tier */}
            <select
              aria-label="Change tier for selected tasks"
              disabled={bulkLoading}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkChangeTier(e.target.value as TaskPriority)
                  e.target.value = ""
                }
              }}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-background h-8"
            >
              <option value="" disabled>Change tier…</option>
              {TIER_ORDER.map((t) => (
                <option key={t} value={t}>{TIER_LABELS[t]}</option>
              ))}
            </select>

            {/* Snooze */}
            <select
              aria-label="Snooze selected tasks"
              disabled={bulkLoading}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkSnooze(parseInt(e.target.value, 10))
                  e.target.value = ""
                }
              }}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-background h-8"
            >
              <option value="" disabled>Snooze…</option>
              {SNOOZE_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>{o.label}</option>
              ))}
            </select>

            <Button
              size="icon-sm"
              variant="ghost"
              onClick={clearSelection}
              disabled={bulkLoading}
              aria-label="Cancel selection"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <TaskDetailSheet
        task={detailTask}
        open={detailOpen}
        startEdit={detailStartEdit}
        onOpenChange={(next) => {
          setDetailOpen(next)
          if (!next) setDetailStartEdit(false)
        }}
        onUpdated={load}
      />

      <AddTaskSheet
        open={addTaskOpen}
        onOpenChange={setAddTaskOpen}
        onSave={handleAddTask}
        rooms={locations}
      />
      </div>
    </PageContainer>
  )
}
