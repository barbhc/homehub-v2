import { CheckCircle2 } from "lucide-react"
import { SectionCard } from "@/components/layout"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/layout"
import { TaskRow } from "./TaskRow"
import type { DashboardTask } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

type UrgentTasksCardProps = {
  tasks: DashboardTask[]
  nextDueDate: string | null
  onMarkComplete?: (taskId: string) => void
  completingId?: string | null
  className?: string
}

function formatNextDue(dateStr: string | null): string {
  if (!dateStr) return ""
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  } catch {
    return dateStr
  }
}

export function UrgentTasksCard({
  tasks,
  nextDueDate,
  onMarkComplete,
  completingId,
  className,
}: UrgentTasksCardProps) {
  const isEmpty = tasks.length === 0
  const hasOverdue = tasks.some((t) => t.isOverdue)

  return (
    <SectionCard
      className={cn(
        "flex flex-col border-l-2 border-l-amber-300 bg-amber-50/40 dark:bg-amber-950/10",
        className
      )}
    >
      <CardHeader className="pb-2 px-6 pt-6">
        <div className="flex items-center gap-2 flex-wrap">
          <CardTitle className="text-lg font-medium">Needs attention</CardTitle>
          {!isEmpty && (
            <Badge variant="secondary" className="font-normal text-xs">
              {tasks.length}
            </Badge>
          )}
          {hasOverdue && (
            <Badge variant="outline" className="text-xs px-1.5 py-0 border-amber-400/50 text-amber-700 dark:text-amber-400">
              Overdue
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 pt-0 px-6 pb-6">
        {isEmpty ? (
          <EmptyState
            icon={<CheckCircle2 />}
            title="All caught up"
            description={nextDueDate ? `Next: ${formatNextDue(nextDueDate)}` : undefined}
          />
        ) : (
          <div className="divide-y-0 -mx-6 px-6">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showOverdueBadge
                onMarkComplete={onMarkComplete}
                completingId={completingId}
              />
            ))}
          </div>
        )}
      </CardContent>
    </SectionCard>
  )
}
