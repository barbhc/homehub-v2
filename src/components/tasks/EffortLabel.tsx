import { cn } from "@/lib/utils"

export type TaskEffort = "short" | "medium" | "long"

const EFFORT_CONFIG: Record<TaskEffort, { label: string }> = {
  short: { label: "Quick (<5 min)" },
  medium: { label: "Medium (5–20 min)" },
  long: { label: "Long (>20 min)" },
}

type EffortLabelProps = {
  effort: TaskEffort | string | null
  className?: string
}

export function EffortLabel({ effort, className }: EffortLabelProps) {
  const key = effort && ["short", "medium", "long"].includes(effort) ? (effort as TaskEffort) : "medium"
  const config = EFFORT_CONFIG[key]
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {config.label}
    </span>
  )
}
