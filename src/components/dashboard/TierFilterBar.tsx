import { cn } from "@/lib/utils"
import type { TierFilter } from "@/lib/dashboard"

const tiers = [
  { key: "essential" as const, label: "Essential", activeClass: "bg-red-100 text-red-700 border-red-300" },
  { key: "recommended" as const, label: "Recommended", activeClass: "bg-amber-100 text-amber-700 border-amber-300" },
  { key: "optional" as const, label: "Optional", activeClass: "bg-teal-100 text-teal-700 border-teal-300" },
]

export function TierFilterBar({
  filter,
  onChange,
}: {
  filter: TierFilter
  onChange: (next: TierFilter) => void
}) {
  const activeCount = [filter.essential, filter.recommended, filter.optional].filter(Boolean).length

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide mr-0.5">
        Show
      </span>
      {tiers.map(({ key, label, activeClass }) => {
        const isActive = filter[key]
        // Don't allow disabling the last active tier
        const isLastActive = isActive && activeCount === 1

        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (isLastActive) return
              onChange({ ...filter, [key]: !isActive })
            }}
            className={cn(
              "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all",
              isActive
                ? activeClass
                : "bg-transparent text-muted-foreground/60 border-border hover:border-muted-foreground/40",
              isLastActive && "cursor-not-allowed"
            )}
            aria-pressed={isActive}
            aria-label={`${isActive ? "Hide" : "Show"} ${label} tasks`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
