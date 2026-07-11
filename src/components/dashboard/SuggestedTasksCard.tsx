import { SectionCard } from "@/components/layout"
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/layout"
import { TaskRow } from "./TaskRow"
import type { DashboardTask } from "@/lib/dashboard"

type SuggestedTasksCardProps = {
  tasks: DashboardTask[]
  onMarkComplete?: (taskId: string) => void
  completingId?: string | null
  isEmptyNeedsAttention?: boolean
  className?: string
}

export function SuggestedTasksCard({
  tasks,
  onMarkComplete,
  completingId,
  isEmptyNeedsAttention,
  className,
}: SuggestedTasksCardProps) {
  return (
    <SectionCard className={className}>
      <CardHeader className="pb-2 px-6 pt-6">
        <CardTitle className="text-lg font-medium">Suggested maintenance</CardTitle>
        {isEmptyNeedsAttention && tasks.length > 0 && (
          <p className="text-sm text-muted-foreground mt-0.5">While you&apos;re at it — these could use attention.</p>
        )}
      </CardHeader>
      <CardContent className="flex-1 pt-0 px-6 pb-6">
        {tasks.length === 0 ? (
          <EmptyState
            title="Nothing suggested"
            description={isEmptyNeedsAttention ? "Add items and run Smart Setup to get maintenance suggestions." : "You're all set for now."}
          />
        ) : (
          <div className="divide-y-0 -mx-6 px-6">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
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
