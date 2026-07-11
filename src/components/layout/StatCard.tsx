import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StatCardProps = {
  icon: LucideIcon
  value: string | number
  label: string
  variant?: "default" | "destructive"
  className?: string
}

export function StatCard({ icon: Icon, value, label, variant = "default", className }: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card px-4 py-3",
        variant === "destructive" && "border-destructive/30 bg-destructive/5",
        className
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon
          className={cn(
            "h-4 w-4",
            variant === "destructive" ? "text-destructive" : "text-muted-foreground"
          )}
        />
        <span
          className={cn(
            "font-semibold leading-none truncate",
            typeof value === "number" || String(value).length <= 4
              ? "text-2xl"
              : "text-base",
            variant === "destructive" ? "text-destructive" : "text-foreground"
          )}
        >
          {value}
        </span>
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
