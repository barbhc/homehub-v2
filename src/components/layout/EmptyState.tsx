import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  /**
   * What this screen will show once it has something — one sentence, present
   * tense, about the user's own home.
   *
   * A blank panel saying "No items yet" tells someone what is missing without
   * telling them what they would gain, which is the difference between an empty
   * state and a dead end. Only worth filling in on first-run surfaces; a filter
   * that matched nothing needs no lesson.
   */
  teach?: string
  /** The next step, when there is an obvious one. */
  action?: React.ReactNode
  className?: string
}

/**
 * Calm empty state: left-aligned, optional icon, title + helper text, and
 * optionally a line teaching what the screen is for plus the next step.
 */
export function EmptyState({
  icon,
  title,
  description,
  teach,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex items-start gap-3 text-left py-3", className)}>
      {icon && (
        <span className="shrink-0 text-muted-foreground [&>svg]:h-5 [&>svg]:w-5 [&>svg]:mt-0.5">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
        {teach && <p className="text-sm text-muted-foreground mt-1.5">{teach}</p>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  )
}
