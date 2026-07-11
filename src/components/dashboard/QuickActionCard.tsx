import { Link } from "react-router-dom"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type QuickActionCardProps = {
  icon: LucideIcon
  label: string
  to: string
  className?: string
}

export function QuickActionCard({ icon: Icon, label, to, className }: QuickActionCardProps) {
  return (
    <Link
      to={to}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-4",
        "hover:border-foreground/20 hover:bg-accent/50 transition-colors",
        "text-center",
        className
      )}
    >
      <Icon className="h-5 w-5 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  )
}
