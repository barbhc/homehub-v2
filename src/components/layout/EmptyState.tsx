import { cn } from "@/lib/utils"

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description?: string
  className?: string
}

/**
 * Calm empty state: left-aligned, optional icon, title + helper text.
 */
export function EmptyState({
  icon,
  title,
  description,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("flex items-start gap-3 text-left py-3", className)}>
      {icon && (
        <span className="shrink-0 text-muted-foreground [&>svg]:h-5 [&>svg]:w-5 [&>svg]:mt-0.5">
          {icon}
        </span>
      )}
      <div>
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
  )
}
