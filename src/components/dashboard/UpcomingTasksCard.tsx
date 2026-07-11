import { Link } from "react-router-dom"
import { SectionCard, EmptyState } from "@/components/layout"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TaskRow } from "./TaskRow"
import type { DashboardTask } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

type UpcomingTasksCardProps = {
  tasks: DashboardTask[]
  onMarkComplete?: (taskId: string) => void
  completingId?: string | null
  className?: string
}

export function UpcomingTasksCard({
  tasks,
  onMarkComplete,
  completingId,
  className,
}: UpcomingTasksCardProps) {
  return (
    <SectionCard className={cn("flex flex-col", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Coming up</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        {tasks.length === 0 ? (
          <EmptyState title="No upcoming tasks." />
        ) : (
          <>
            <div className="divide-y-0">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onMarkComplete={onMarkComplete}
                  completingId={completingId}
                />
              ))}
            </div>
            <Link
              to="/home"
              className="mt-3 block text-sm text-muted-foreground hover:text-foreground"
            >
              View full schedule →
            </Link>
          </>
        )}
      </CardContent>
    </SectionCard>
  )
}
