import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { Check, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { PageContainer, PageHeader, SectionCard, EmptyState } from "@/components/layout"
import { useCurrentHome } from "@/modules/home"
import {
  getTaskInstances,
  markTaskInstanceDone,
  snoozeTaskInstance,
  type TaskInstanceWithDetails,
} from "@/modules/care"

function formatDue(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    d.setHours(0, 0, 0, 0)
    if (d < today) return "Overdue"
    const diff = Math.ceil((d.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
    if (diff === 0) return "Due today"
    if (diff === 1) return "Tomorrow"
    if (diff <= 7) return `In ${diff} days`
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

function TaskRow({
  task,
  onMarkDone,
  onSnooze,
  completingId,
}: {
  task: TaskInstanceWithDetails
  onMarkDone: (id: string) => void
  onSnooze: (id: string, until: string) => void
  completingId: string | null
}) {
  const title = task.task_template?.title ?? "Task"
  const careType = task.task_template?.care_type
  const tier = task.task_template?.priority_tier
  const itemName = (task.item_unit as { display_name?: string } | undefined)?.display_name
  const roomName = (task.item_unit as { room?: { name: string } } | undefined)?.room?.name
  const isCompleting = completingId === task.task_instance_id

  const handleSnooze = () => {
    const d = new Date()
    d.setDate(d.getDate() + 7)
    onSnooze(task.task_instance_id, d.toISOString().slice(0, 10))
  }

  return (
    <div className="py-3 border-b border-border last:border-0 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{title}</span>
          {tier && (
            <Badge variant="secondary" className="text-xs py-0 px-1.5 font-normal capitalize">
              {tier}
            </Badge>
          )}
          {task.is_safety_critical && (
            <Badge variant="outline" className="text-xs py-0 px-1.5 border-amber-400/50 text-amber-700">
              Safety
            </Badge>
          )}
          {careType && (
            <span className="text-xs text-muted-foreground capitalize">{careType}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted-foreground">
          <span>{formatDue(task.due_date)}</span>
          {itemName && (
            <>
              <span aria-hidden>·</span>
              <Link
                to={task.item_unit_id ? `/items/${task.item_unit_id}` : "#"}
                className="text-primary hover:underline"
              >
                {itemName}
              </Link>
            </>
          )}
          {roomName && (
            <>
              <span aria-hidden>·</span>
              <span>{roomName}</span>
            </>
          )}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={() => onMarkDone(task.task_instance_id)}
          disabled={isCompleting}
          aria-label={`Mark ${title} complete`}
        >
          {isCompleting ? "..." : <Check className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          onClick={handleSnooze}
          aria-label={`Snooze ${title} 1 week`}
        >
          <Clock className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function CarePage() {
  const { home } = useCurrentHome()
  const [tasks, setTasks] = useState<TaskInstanceWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [viewAll, setViewAll] = useState(false)
  const [filters] = useState<{
    status?: string[]
    care_type?: string
    priority_tier?: string
    room_id?: string
    item_unit_id?: string
  }>({})

  useEffect(() => {
    if (!home) return
    let cancelled = false
    setLoading(true)
    getTaskInstances(home.home_id, {
      status: filters.status?.length ? (filters.status as ("scheduled" | "snoozed")[]) : ["scheduled", "snoozed"],
      care_type: filters.care_type,
      priority_tier: filters.priority_tier as "essential" | "recommended" | "optional" | undefined,
      room_id: filters.room_id,
      item_unit_id: filters.item_unit_id,
    }).then((result) => {
      if (cancelled) return
      setLoading(false)
      if (result.error) setError(result.error.message)
      else setTasks(result.data ?? [])
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- home?.home_id is sufficient
  }, [home?.home_id, filters])

  const handleMarkDone = async (id: string) => {
    if (!home) return
    setCompletingId(id)
    const result = await markTaskInstanceDone(home.home_id, id)
    setCompletingId(null)
    if (result.success) {
      setTasks((prev) => prev.filter((t) => t.task_instance_id !== id))
    }
  }

  const handleSnooze = async (id: string, until: string) => {
    if (!home) return
    const result = await snoozeTaskInstance(home.home_id, id, until)
    if (result.success) {
      setTasks((prev) => prev.map((t) => (t.task_instance_id === id ? result.data : t)))
    }
  }

  const safetyCritical = tasks.filter((t) => t.is_safety_critical && t.status === "scheduled")
  const topByScore = tasks.filter((t) => !t.is_safety_critical && t.status === "scheduled").slice(0, 4)
  const rest = tasks.filter(
    (t) =>
      t.status === "scheduled" &&
      !t.is_safety_critical &&
      !topByScore.some((u) => u.task_instance_id === t.task_instance_id)
  )
  const displayTasks = viewAll ? tasks : [...safetyCritical, ...topByScore]
  const hasMore = !viewAll && rest.length > 0

  return (
    <PageContainer>
      <PageHeader
        title="Care"
        subtitle="Tasks to keep your home and items in good shape."
      />
      {loading && <p className="text-muted-foreground">Loading...</p>}
      {error && <p className="text-destructive text-sm">{error}</p>}
      {!loading && !error && tasks.length === 0 && (
        <SectionCard className="p-6">
          <EmptyState
            title="No care tasks yet"
            description="Add items and link manuals to see suggested tasks, or create tasks manually."
          />
        </SectionCard>
      )}
      {!loading && !error && tasks.length > 0 && (
        <SectionCard className="p-4">
          <div className="space-y-0">
            {displayTasks.map((task) => (
              <TaskRow
                key={task.task_instance_id}
                task={task}
                onMarkDone={handleMarkDone}
                onSnooze={handleSnooze}
                completingId={completingId}
              />
            ))}
          </div>
          {hasMore && (
            <div className="pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setViewAll(true)}>
                View all ({tasks.length})
              </Button>
            </div>
          )}
          {viewAll && rest.length > 0 && (
            <div className="pt-4 border-t border-border">
              <Button variant="ghost" onClick={() => setViewAll(false)}>
                Show less
              </Button>
            </div>
          )}
        </SectionCard>
      )}
    </PageContainer>
  )
}
