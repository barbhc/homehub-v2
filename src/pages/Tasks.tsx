import { useCallback, useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"
import { PageContainer, PageHeader, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/layout"
import { MaintenanceTaskRow } from "@/components/maintenance/MaintenanceTaskRow"
import { getAllMaintenanceTasks, type MaintenanceTaskFull } from "@/lib/dashboard"
import { markTaskInstanceDone, snoozeTaskInstance } from "@/modules/care"
import { useCurrentHome, getRooms } from "@/modules/home"
import { cn } from "@/lib/utils"

type PriorityFilter = "all" | "critical" | "high" | "medium"
type TypeFilter = "all" | "maintenance" | "cleaning" | "manual"

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Essential" },
  { value: "high", label: "Recommended" },
  { value: "medium", label: "Optional" },
]

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: "maintenance", label: "Maintenance" },
  { value: "all", label: "All types" },
  { value: "cleaning", label: "Cleaning only" },
]

const SNOOZE_OPTIONS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
]

function applyFilters(
  tasks: MaintenanceTaskFull[],
  roomId: string | null,
  priority: PriorityFilter,
  type: TypeFilter
): MaintenanceTaskFull[] {
  return tasks.filter((t) => {
    if (roomId && t.locationId !== roomId) return false
    if (priority !== "all" && t.priority !== priority) return false
    if (type === "maintenance" && t.careType === "cleaning") return false
    if (type === "cleaning" && t.careType !== "cleaning") return false
    return true
  })
}

function groupByRoom(
  tasks: MaintenanceTaskFull[],
  locationMap: Map<string, string>
): { key: string; label: string; tasks: MaintenanceTaskFull[] }[] {
  const byRoom = new Map<string, MaintenanceTaskFull[]>()
  const unassigned: MaintenanceTaskFull[] = []
  for (const t of tasks) {
    const roomId = t.locationId
    if (roomId) {
      const list = byRoom.get(roomId) ?? []
      list.push(t)
      byRoom.set(roomId, list)
    } else {
      unassigned.push(t)
    }
  }
  const groups: { key: string; label: string; tasks: MaintenanceTaskFull[] }[] = []
  for (const [roomId, roomTasks] of byRoom) {
    groups.push({ key: roomId, label: locationMap.get(roomId) ?? "Room", tasks: roomTasks })
  }
  groups.sort((a, b) => a.label.localeCompare(b.label))
  if (unassigned.length > 0) {
    groups.push({ key: "__unassigned__", label: "Unassigned", tasks: unassigned })
  }
  return groups
}

export default function Tasks() {
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null

  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])
  const [allTasks, setAllTasks] = useState<MaintenanceTaskFull[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  const [roomFilter, setRoomFilter] = useState<string | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all")
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("maintenance")

  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  const locationMap = useMemo(
    () => new Map(rooms.map((r) => [r.room_id, r.name])),
    [rooms]
  )

  useEffect(() => {
    if (!homeId) return
    getRooms(homeId).then((r) => setRooms(r.data ?? []))
  }, [homeId])

  const load = useCallback(async () => {
    if (!homeId) return
    setLoading(true)
    setError(null)
    try {
      const all = await getAllMaintenanceTasks(homeId)
      setAllTasks(all)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }, [homeId])

  useEffect(() => {
    load()
  }, [load])

  const filteredTasks = useMemo(
    () => applyFilters(allTasks, roomFilter, priorityFilter, typeFilter),
    [allTasks, roomFilter, priorityFilter, typeFilter]
  )

  const taskGroups = useMemo(
    () => groupByRoom(filteredTasks, locationMap),
    [filteredTasks, locationMap]
  )

  const handleMarkComplete = useCallback(
    async (taskId: string) => {
      if (!homeId) return
      setCompletingId(taskId)
      const result = await markTaskInstanceDone(homeId, taskId)
      setCompletingId(null)
      if (result.success) await load()
      else setError(result.error)
    },
    [homeId, load]
  )

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredTasks.map((t) => t.id)))
  }, [filteredTasks])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [])

  const runBulk = useCallback(
    async (fn: () => Promise<{ success: boolean; error?: string }>) => {
      setBulkLoading(true)
      setBulkError(null)
      let result: { success: boolean; error?: string }
      try {
        result = await fn()
      } catch (e) {
        // A throw inside the bulk action used to leave bulkLoading true forever:
        // the buttons stayed disabled and the bar could not even be dismissed.
        result = { success: false, error: e instanceof Error ? e.message : "Action failed" }
      } finally {
        setBulkLoading(false)
      }
      if (result.success) {
        setSelectedIds(new Set())
        setSelectionMode(false)
        await load()
      } else {
        setBulkError(result.error ?? "Action failed")
      }
    },
    [load]
  )

  const handleBulkComplete = useCallback(() => {
    if (!homeId || selectedIds.size === 0) return
    const ids = [...selectedIds]
    runBulk(async () => {
      let lastErr: string | undefined
      await Promise.all(
        ids.map(async (id) => {
          const r = await markTaskInstanceDone(homeId, id)
          if (!r.success) lastErr = r.error
        })
      )
      return lastErr ? { success: false, error: lastErr } : { success: true }
    })
  }, [homeId, selectedIds, runBulk])

  const handleBulkSnooze = useCallback(
    (days: number) => {
      if (!homeId || selectedIds.size === 0) return
      const until = new Date()
      until.setDate(until.getDate() + days)
      const untilStr = until.toISOString().slice(0, 10)
      const ids = [...selectedIds]
      runBulk(async () => {
        let lastErr: string | undefined
        for (const id of ids) {
          const r = await snoozeTaskInstance(homeId, id, untilStr)
          if (!r.success) lastErr = r.error
        }
        return lastErr ? { success: false, error: lastErr } : { success: true }
      })
    },
    [homeId, selectedIds, runBulk]
  )

  const hasSelection = selectedIds.size > 0

  if (loading) {
    return (
      <PageContainer>
        <header>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </header>
        <Skeleton className="h-8 w-64 mt-4" />
        <Skeleton className="h-64 rounded-xl mt-4" />
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

  return (
    <PageContainer className="pb-28">
      <PageHeader
        title="Tasks"
        subtitle={
          allTasks.length === 0
            ? "No tasks yet."
            : filteredTasks.length !== allTasks.length
              ? `${filteredTasks.length} of ${allTasks.length} tasks`
              : `${allTasks.length} task${allTasks.length === 1 ? "" : "s"}`
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-4">
        {/* Room — keep as select; option count is variable */}
        {rooms.length > 0 && (
          <select
            aria-label="Filter by room"
            value={roomFilter ?? ""}
            onChange={(e) => setRoomFilter(e.target.value || null)}
            className="text-xs border border-border rounded-md px-2 py-1.5 bg-background text-foreground shrink-0 h-7"
          >
            <option value="">All rooms</option>
            {rooms.map((r) => (
              <option key={r.room_id} value={r.room_id}>
                {r.name}
              </option>
            ))}
          </select>
        )}

        {/* Type pill buttons */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by type">
          {TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTypeFilter(o.value)}
              className={cn(
                "text-xs px-3 py-1 rounded-full border transition-colors shrink-0",
                typeFilter === o.value
                  ? "bg-foreground text-background border-transparent font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        {/* Priority pill buttons */}
        <div className="flex items-center gap-1" role="group" aria-label="Filter by priority">
          {PRIORITY_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setPriorityFilter(o.value)}
              className={cn(
                "text-xs px-3 py-1 rounded-full border transition-colors shrink-0",
                priorityFilter === o.value
                  ? "bg-foreground text-background border-transparent font-medium"
                  : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-xs shrink-0 h-7"
          onClick={() => {
            setRoomFilter(null)
            setPriorityFilter("all")
            setTypeFilter("maintenance")
          }}
        >
          <X className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>

      {/* All Tasks list */}
      <section className="mt-6">
        <SectionCard>
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">All Tasks</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{filteredTasks.length}</span>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() =>
                  selectionMode || selectedIds.size > 0 ? clearSelection() : setSelectionMode(true)
                }
              >
                {selectionMode || selectedIds.size > 0 ? "Cancel" : "Select"}
              </Button>
            </div>
          </div>
          <CardContent className="p-4 pt-0">
            {filteredTasks.length === 0 ? (
              <EmptyState title="No tasks match" description="Try adjusting your filters." />
            ) : (
              taskGroups.map((group) => (
                <div key={group.key} className={cn(group.label && "mb-4")}>
                  {group.label && (
                    <div className="text-sm font-medium text-muted-foreground mb-2">
                      {group.label}
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {group.tasks.map((task) => (
                      <MaintenanceTaskRow
                        key={task.id}
                        task={task}
                        onMarkComplete={selectionMode ? undefined : handleMarkComplete}
                        completingId={completingId}
                        isSelected={selectedIds.has(task.id)}
                        onToggleSelect={selectionMode ? toggleSelect : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </SectionCard>
      </section>

      {/* Bulk action bar */}
      {hasSelection && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 flex items-center gap-2 px-4 py-3 bg-background border-t border-border shadow-lg"
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
            Select all ({filteredTasks.length})
          </button>

          <div className="flex items-center gap-2 ml-auto flex-wrap">
            {bulkError && <span className="text-xs text-destructive">{bulkError}</span>}

            <Button
              size="sm"
              variant="outline"
              onClick={handleBulkComplete}
              disabled={bulkLoading}
              className="text-xs h-8"
            >
              {bulkLoading ? "..." : "Mark complete"}
            </Button>

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
              <option value="" disabled>
                Snooze…
              </option>
              {SNOOZE_OPTIONS.map((o) => (
                <option key={o.days} value={o.days}>
                  {o.label}
                </option>
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
    </PageContainer>
  )
}
