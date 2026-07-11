import { Link } from "react-router-dom"
import { CheckIcon, MoreHorizontalIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { DashboardTask } from "@/lib/dashboard"

type DashboardTaskRowProps = {
  task: DashboardTask
  onMarkComplete: (id: string) => void
  onSnooze: (id: string, days: number) => void
  completingId: string | null
  snoozingId: string | null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—"
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

export function DashboardTaskRow({
  task,
  onMarkComplete,
  onSnooze,
  completingId,
  snoozingId,
}: DashboardTaskRowProps) {
  const isCompleting = completingId === task.id
  const isSnoozing = snoozingId === task.id
  const itemHref = task.itemId ? `/items/${task.itemId}` : "/inventory"

  return (
    <div className="flex items-center gap-3 py-2.5 px-1 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-snug truncate">{task.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {task.itemName && (
            <span className="text-xs text-muted-foreground truncate">{task.itemName}</span>
          )}
          {task.isOverdue && task.daysOverdue != null && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400 shrink-0">
              {task.daysOverdue}d overdue
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {!task.isOverdue && task.dueDate && (
          <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-11 md:h-7 px-3 md:px-2 text-sm md:text-xs"
          disabled={isCompleting}
          onClick={() => onMarkComplete(task.id)}
          aria-label={isCompleting ? `Marking ${task.name} complete` : `Mark ${task.name} complete`}
          aria-busy={isCompleting}
        >
          <CheckIcon className="size-4 md:size-3" />
          <span className="sr-only">Done</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0" disabled={isSnoozing} aria-label="More options">
              <MoreHorizontalIcon className="size-4 md:size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onSnooze(task.id, 3)}>Snooze 3 days</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(task.id, 7)}>Snooze 1 week</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSnooze(task.id, 30)}>Snooze 1 month</DropdownMenuItem>
            {task.itemId && (
              <DropdownMenuItem asChild>
                <Link to={itemHref}>View item →</Link>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
