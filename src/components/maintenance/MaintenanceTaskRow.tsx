import { useState } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2Icon, ChevronDown, ChevronRight, MoonIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TierBadge } from "@/components/tasks/TierBadge"
import { EffortLabel } from "@/components/tasks/EffortLabel"
import type { MaintenanceTaskFull } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

/** Format a completed_at date as a concise "X ago" string */
function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const days = Math.round((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
  if (days < 1) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days}d ago`
  if (days < 60) return `${Math.round(days / 7)}w ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

const SNOOZE_OPTIONS = [
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", days: 30 },
]

type MaintenanceTaskRowProps = {
  task: MaintenanceTaskFull
  onMarkComplete?: (taskId: string) => void
  onSnooze?: (taskId: string, days: number) => void
  completingId?: string | null
  snoozingId?: string | null
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  onClick?: () => void
  onEdit?: () => void
  simpleBadges?: boolean
  itemFirst?: boolean
  className?: string
}

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return "No due date"
  try {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  } catch {
    return dateStr
  }
}

function formatFrequency(value: number | null, unit: string | null): string | null {
  if (value == null || !unit) return null
  if (value === 1) {
    const singular = unit.replace(/s$/, "")
    return `Every ${singular}`
  }
  return `Every ${value} ${unit}`
}

export function MaintenanceTaskRow({
  task,
  onMarkComplete,
  onSnooze,
  completingId,
  snoozingId,
  isSelected,
  onToggleSelect,
  onClick,
  onEdit: _onEdit,
  simpleBadges = false,
  itemFirst = false,
  className,
}: MaintenanceTaskRowProps) {
  const [expanded, setExpanded] = useState(false)
  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const isCompleting = completingId === task.id
  const isSnoozing = snoozingId === task.id
  const frequency = formatFrequency(task.frequency_value, task.frequency_unit)
  const selectable = onToggleSelect != null

  const itemLink =
    task.itemName && task.item_id ? (
      <Link
        to={`/items/${task.item_id}`}
        className="text-xs font-semibold text-primary hover:underline shrink-0"
      >
        {task.itemName}
      </Link>
    ) : null

  const titleNode = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="font-medium text-foreground text-sm text-left hover:underline focus:outline-none"
    >
      {task.title}
    </button>
  ) : (
    <span className="font-medium text-foreground text-sm">{task.title}</span>
  )

  return (
    <div className={cn("py-3 border-b border-border last:border-0 group", className)}>
      <div className="flex items-start gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={isSelected ?? false}
            onChange={() => onToggleSelect(task.id)}
            aria-label={`Select task: ${task.title}`}
            className="mt-1 h-4 w-4 shrink-0 rounded border-border accent-primary cursor-pointer"
          />
        )}
        {!selectable && task.description && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {itemFirst ? (
              <>
                {!simpleBadges && <TierBadge tier={task.priority} />}
                {itemLink}
                {titleNode}
                <EffortLabel effort={task.effort} />
              </>
            ) : (
              <>
                {titleNode}
                {!simpleBadges && <TierBadge tier={task.priority} />}
                <EffortLabel effort={task.effort} />
                {task.itemName && task.item_id && (
                  <>
                    <span className="text-muted-foreground text-xs" aria-hidden>
                      ·
                    </span>
                    <Link to={`/items/${task.item_id}`} className="text-xs text-primary hover:underline">
                      {task.itemName}
                    </Link>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-muted-foreground">{formatDueDate(task.next_due_date)}</span>
            {task.locationName && (
              <span className="text-xs text-muted-foreground">· {task.locationName}</span>
            )}
            {/* Only Essential tasks carry a hard "Overdue" deadline.
                Recommended / Optional past-due tasks just show the date
                in muted style — no badge — so the visual language stays
                consistent with the stats tiles (which only count essential overdue). */}
            {task.isOverdue && task.priority === "critical" && (
              <Badge
                variant="outline"
                className="text-xs py-0 px-1.5 border-red-400/60 bg-red-50/50 text-red-700 dark:text-red-400 dark:bg-red-950/20"
              >
                Overdue
              </Badge>
            )}
            {!simpleBadges && task.isDueSoon && !task.isOverdue && (
              <Badge
                variant="outline"
                className="text-xs py-0 px-1.5 border-blue-400/50 text-blue-700 dark:text-blue-400"
              >
                Due soon
              </Badge>
            )}
            {frequency && (
              <Badge variant="secondary" className="text-xs py-0 px-1.5 font-normal">
                {frequency}
              </Badge>
            )}
            {task.lastCompletedAt && (
              <span className="flex items-center gap-0.5 text-xs text-emerald-700 dark:text-emerald-500">
                <CheckCircle2Icon className="size-3 shrink-0" aria-hidden />
                {formatTimeAgo(task.lastCompletedAt)}
              </span>
            )}
          </div>
        </div>
        {(onSnooze || onMarkComplete) && task.next_due_date && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Snooze */}
            {onSnooze && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSnoozeOpen(!snoozeOpen) }}
                  disabled={isSnoozing}
                  className="h-11 md:h-7 px-3 md:px-2 rounded-md border border-border bg-card text-muted-foreground hover:border-amber-400 hover:text-amber-700 transition-colors text-xs flex items-center gap-1"
                  title="Snooze"
                >
                  <MoonIcon className="size-3" />
                  <span className="hidden sm:inline text-[11px]">Snooze</span>
                </button>
                {snoozeOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setSnoozeOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-20 min-w-[120px] py-1">
                      {SNOOZE_OPTIONS.map((opt) => (
                        <button
                          key={opt.days}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSnoozeOpen(false)
                            onSnooze(task.id, opt.days)
                          }}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors min-h-11 md:min-h-0 flex items-center"
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Done */}
            {onMarkComplete && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMarkComplete(task.id) }}
                disabled={isCompleting}
                className="h-11 md:h-7 px-3 md:px-2 rounded-md border border-border bg-card text-muted-foreground hover:border-emerald-400 hover:text-emerald-700 transition-colors text-xs flex items-center gap-1"
                aria-label={`Mark ${task.title} complete`}
              >
                <CheckCircle2Icon className="size-3" />
                <span className="hidden sm:inline text-[11px]">Done</span>
              </button>
            )}
          </div>
        )}
      </div>
      {expanded && task.description && (
        <p className="mt-2 ml-6 text-sm text-muted-foreground">{task.description}</p>
      )}
    </div>
  )
}
