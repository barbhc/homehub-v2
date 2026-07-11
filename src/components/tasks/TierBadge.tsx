import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type TaskTier = "essential" | "recommended" | "optional"

const TIER_CONFIG: Record<TaskTier, { label: string; className: string }> = {
  essential: {
    label: "Essential",
    className:
      "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/70 dark:text-red-300 dark:border-red-800",
  },
  recommended: {
    label: "Recommended",
    className:
      "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-800",
  },
  optional: {
    label: "Optional",
    className:
      "bg-[#EAF6F4] text-[#1B6B5A] border-[#9FD4C8] dark:bg-[#1a3530] dark:text-[#2D9B82] dark:border-[#2D4A44]",
  },
}

// Legacy mapping for any old "critical/high/medium/low" values still in the DB
const LEGACY_MAP: Record<string, TaskTier> = {
  critical: "essential",
  high: "recommended",
  medium: "optional",
  low: "optional",
}

type TierBadgeProps = {
  tier: TaskTier | string
  className?: string
}

export function TierBadge({ tier, className }: TierBadgeProps) {
  const normalized = (["essential", "recommended", "optional"] as const).includes(tier as TaskTier)
    ? (tier as TaskTier)
    : (LEGACY_MAP[tier] ?? "recommended")
  const config = TIER_CONFIG[normalized]
  return (
    <Badge
      variant="outline"
      className={cn("text-xs py-0 px-1.5 font-medium shrink-0", config.className, className)}
    >
      {config.label}
    </Badge>
  )
}
