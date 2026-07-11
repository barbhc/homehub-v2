import { forwardRef } from "react"
import { cn } from "@/lib/utils"

type ActionTileProps = React.ComponentProps<"button"> & {
  icon: React.ReactNode
  title: string
  description?: string
  iconBgClass?: string
}

/**
 * Reusable card-tile for choice options:
 * icon container with tinted bg, title + description, hover/focus, fully clickable.
 */
export const ActionTile = forwardRef<HTMLButtonElement, ActionTileProps>(
  (
    {
      icon,
      title,
      description,
      iconBgClass = "bg-muted",
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "w-full text-left rounded-xl border border-border bg-card p-6",
          "transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "flex flex-row items-center gap-4",
          className
        )}
        {...props}
      >
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-white [&>svg]:h-6 [&>svg]:w-6",
            iconBgClass
          )}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{title}</p>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        {children}
      </button>
    )
  }
)
ActionTile.displayName = "ActionTile"
