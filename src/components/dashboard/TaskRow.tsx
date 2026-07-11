import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { TierBadge } from "@/components/tasks/TierBadge"
import { EffortLabel } from "@/components/tasks/EffortLabel"
import type { DashboardTask } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

type TaskRowProps = {
  task: DashboardTask
  showOverdueBadge?: boolean
  onMarkComplete?: (taskId: string) => void
  completingId?: string | null
  detailHref?: string
  className?: string
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

function getUrgencyClasses(urgency: DashboardTask["urgencyLevel"]): string {
  switch (urgency) {
    case "critical":
      return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 rounded-lg -mx-2 px-2 py-2 font-semibold"
    case "overdue":
      return "text-red-600 dark:text-red-400 border-l-2 border-l-red-400 pl-2"
    case "due_today":
      return "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900 rounded-lg -mx-2 px-2 py-1"
    case "due_soon":
      return "border-l-2 border-l-amber-400 pl-2"
    default:
      return ""
  }
}

export function TaskRow({
  task,
  showOverdueBadge = false,
  onMarkComplete,
  completingId,
  detailHref,
  className,
}: TaskRowProps) {
  const isCompleting = completingId === task.id
  const href = detailHref ?? (task.itemId ? `/inventory/${task.itemId}` : "/home")

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 py-3 border-b border-border last:border-0",
        getUrgencyClasses(task.urgencyLevel),
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-foreground">{task.name}</span>
          <TierBadge tier={task.priority} />
          {task.effort && <EffortLabel effort={task.effort} />}
          {task.itemName && (
            <>
              <span className="text-muted-foreground text-xs" aria-hidden>·</span>
              <span className="text-sm text-muted-foreground">{task.itemName}</span>
            </>
          )}
          {showOverdueBadge && task.isOverdue && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
              {task.daysOverdue != null ? `${task.daysOverdue} day${task.daysOverdue === 1 ? "" : "s"} overdue` : "Overdue"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
          <span>{formatDueDate(task.dueDate)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onMarkComplete && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onMarkComplete(task.id)}
            disabled={isCompleting}
            aria-label={isCompleting ? `Marking ${task.name} complete` : `Mark ${task.name} complete`}
            aria-busy={isCompleting}
          >
            {isCompleting ? "..." : "Mark complete"}
          </Button>
        )}
        <Link
          to={href}
          className="text-xs text-primary hover:underline"
        >
          View detail
        </Link>
      </div>
    </div>
  )
}
