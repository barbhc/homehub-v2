import { cn } from "@/lib/utils"

type PageHeaderProps = {
  title: string
  subtitle?: string
  action?: React.ReactNode
  /** Center title and subtitle (for flows like onboarding) */
  centered?: boolean
  className?: string
}

/**
 * Page header with serif display font for H1.
 * Subtitle uses muted styling; optional right-side action slot.
 */
export function PageHeader({
  title,
  subtitle,
  action,
  centered = false,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        centered
          ? "text-center"
          : "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4",
        className
      )}
    >
      <div className={cn("min-w-0", centered && "mb-6")}>
        <h1 className="text-3xl font-display font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className={cn("mt-1 text-sm text-muted-foreground", centered && "text-center")}>
            {subtitle}
          </p>
        )}
      </div>
      {action && !centered && (
        <div className="shrink-0 pt-1 sm:pt-0">{action}</div>
      )}
    </header>
  )
}
