import {
  BookOpenIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ClockIcon,
  Loader2Icon,
  MoveRightIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { CompleteTaskPopover } from "@/components/care/CompleteTaskPopover"
import { CautionCallout } from "@/components/tasks/CautionCallout"
import { ProTaskNotice } from "@/components/tasks/ProTaskNotice"
import { classifyTaskActor } from "@/lib/taskActor"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { cn } from "@/lib/utils"
import {
  glassCardStyles,
  tierAccentStyles,
  getScheduleLabel,
  getTaskGuidance,
} from "./utils"

export interface TierTaskCardProps {
  task: TaskTemplateWithSchedule
  tier: "essential" | "recommended" | "optional"
  isExpanded: boolean
  isDeleting: boolean
  manualPdfUrl: string | null
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onOpenManualPage: (pageNumber: number) => void
  onComplete?: (completedAt: string, notes: string | null) => Promise<void>
  onReclassify?: (targetType: "how_to" | "troubleshooting") => Promise<void>
  hasManual?: boolean
}

export function TierTaskCard({
  task: t,
  tier,
  isExpanded,
  isDeleting,
  manualPdfUrl,
  onToggleExpand,
  onEdit,
  onDelete,
  onOpenManualPage,
  onComplete,
  onReclassify,
  hasManual = false,
}: TierTaskCardProps) {
  const { steps, cautions } = getTaskGuidance(t)
  const actor = classifyTaskActor(t)
  // Hazardous tasks (gas/combustion/live electrical) must not show DIY steps.
  const showSteps = actor !== "hazardous" && steps.length > 0
  const meta = (t as unknown as Record<string, unknown>).metadata as {
    diagram_pages?: { page: number; caption: string }[]
  } | null
  const diagramPages = meta?.diagram_pages ?? []
  const schedLabel = getScheduleLabel(t)
  const hasRisk = t.risk_level === "safety" || t.risk_level === "prevent_damage"
  const firstPage = diagramPages.length > 0 ? diagramPages[0].page : null
  const stepCount = showSteps ? steps.length : 0

  const hasMeta = schedLabel || hasRisk || firstPage != null || stepCount > 0 || actor !== "diy"

  return (
    <li
      className={cn(
        glassCardStyles.base,
        glassCardStyles.hover,
        isExpanded && glassCardStyles.expanded,
        "group list-none overflow-hidden"
      )}
    >
      <div className="flex">
        {/* Left accent bar */}
        <div
          className={cn(
            "w-1 rounded-full self-stretch shrink-0 my-2 ml-2",
            tierAccentStyles[tier]
          )}
        />

        <div className="flex-1 min-w-0">
          {/* Row 1: title + chevron only — full width for the title */}
          <div className="flex items-start gap-2 px-3 pt-3 pb-1">
            <button
              type="button"
              className="text-[13px] sm:text-sm font-semibold flex-1 min-w-0 text-left leading-snug"
              onClick={onToggleExpand}
            >
              {t.title}
            </button>
            <button
              type="button"
              onClick={onToggleExpand}
              className="h-11 w-11 md:h-8 md:w-8 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0 -mt-2 md:mt-px -mr-2 md:mr-0"
              title={isExpanded ? "Collapse" : "Expand instructions"}
            >
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform",
                  isExpanded && "rotate-180"
                )}
              />
            </button>
          </div>

          {/* Row 2: meta chips — schedule, page ref, step count, risk */}
          {hasMeta && (
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap px-3 pb-2.5">
              {actor === "hazardous" && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  Pro only
                </span>
              )}
              {actor === "pro" && (
                <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  Pro
                </span>
              )}
              {schedLabel && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span title="Schedule"><ClockIcon className="size-3 shrink-0" /></span>
                  {schedLabel}
                </span>
              )}
              {firstPage != null && (
                <span
                  className="text-[11px] font-medium text-[#2D9B82] cursor-pointer hover:underline"
                  title={`View manual page ${firstPage}`}
                  onClick={() => onOpenManualPage(firstPage)}
                >
                  p. {firstPage}
                </span>
              )}
              {stepCount > 0 && (
                <span
                  className="text-[11px] text-muted-foreground"
                  title={`${stepCount} steps`}
                >
                  {stepCount} steps
                </span>
              )}
              {hasRisk && (
                <span
                  className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  title={
                    t.risk_level === "safety"
                      ? "Safety concern"
                      : "Prevents damage"
                  }
                >
                  <span
                    className={cn(
                      "size-1.5 rounded-full shrink-0",
                      t.risk_level === "safety"
                        ? "bg-red-500"
                        : "bg-amber-500"
                    )}
                  />
                  {t.risk_level === "safety" ? "Safety" : "Prevent damage"}
                </span>
              )}
            </div>
          )}

          {/* Expanded area */}
          {isExpanded && (
            <div className="border-t border-border/30 px-4 py-3 space-y-3">
              {/* Pro / hazardous notice — reframes away from a DIY checklist */}
              {actor !== "diy" && <ProTaskNotice actor={actor} />}

              {/* Steps — suppressed for hazardous tasks (no DIY gas/combustion steps) */}
              {showSteps && (
                <div className="space-y-2.5">
                  {steps.map((step, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-muted text-muted-foreground text-[10px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {step}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Cautions — warnings pulled out of the steps so they read as
                  what they are, not as a numbered instruction. */}
              <CautionCallout cautions={cautions} />

              {/* Manual page link */}
              {manualPdfUrl && firstPage != null && (
                <button
                  type="button"
                  onClick={() => onOpenManualPage(firstPage)}
                  className="flex items-center gap-2 w-full rounded-lg bg-[#2D9B82]/5 hover:bg-[#2D9B82]/10 px-3 py-2 transition-colors"
                  title={`Open manual page ${firstPage} in viewer`}
                >
                  <BookOpenIcon className="size-4 text-[#2D9B82]" />
                  <span className="text-sm font-medium text-[#2D9B82]">
                    View in manual — page {firstPage}
                  </span>
                </button>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-1 pt-1 flex-wrap">
                {onComplete && (
                  <CompleteTaskPopover onComplete={onComplete}>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-11 md:h-7 gap-1.5 text-sm md:text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                      title="Mark this task as done"
                    >
                      <CheckCircle2Icon className="size-3" />
                      Done
                    </Button>
                  </CompleteTaskPopover>
                )}
                {onReclassify && hasManual && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-11 md:h-7 gap-1.5 text-sm md:text-xs text-muted-foreground hover:text-foreground"
                        title="Reclassify as How To or Troubleshooting"
                      >
                        <MoveRightIcon className="size-3" />
                        Move to…
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => onReclassify("how_to")}>
                        How To
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onReclassify("troubleshooting")}>
                        Troubleshooting
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 md:h-7 gap-1.5 text-sm md:text-xs text-muted-foreground hover:text-foreground"
                  onClick={onEdit}
                  title="Edit task schedule and tier"
                >
                  <PencilIcon className="size-3" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-11 md:h-7 gap-1.5 text-sm md:text-xs text-muted-foreground hover:text-destructive"
                  disabled={isDeleting}
                  onClick={onDelete}
                  title="Delete this task"
                >
                  {isDeleting ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <Trash2Icon className="size-3" />
                  )}
                  Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
