import { useState } from "react"
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Circle, RotateCcw, WrenchIcon,
} from "lucide-react"
import { SectionCard } from "@/components/layout"
import { Badge } from "@/components/ui/badge"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import { SYMPTOM_TAGS, type ReCheckTrigger } from "@/lib/symptomTaxonomy"
import type { Json } from "@/integrations/types"
import { cn } from "@/lib/utils"
import { useSetupCompletion } from "./useSetupCompletion"

interface SetupChecklistSectionProps {
  tasks: TaskTemplateWithSchedule[]
  homeId: string
  itemId: string
  /**
   * When true (item_unit.setup_revealed_at is set — the user indicated they just
   * installed this), the checklist renders expanded. Otherwise it stays collapsed
   * but accessible: install steps shouldn't clutter day-to-day upkeep, but the
   * homeowner can open them anytime (e.g. after moving or service).
   */
  revealed?: boolean
}

function parseReCheckTriggers(raw: Json): ReCheckTrigger[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).filter(
    (item): item is ReCheckTrigger =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).trigger === "string" &&
      typeof (item as Record<string, unknown>).description === "string",
  )
}

export function SetupChecklistSection({
  tasks,
  homeId,
  itemId,
  revealed = false,
}: SetupChecklistSectionProps) {
  const [open, setOpen] = useState(revealed)
  const { isDone, loadingIds, doneCount, toggleDone } = useSetupCompletion(tasks, homeId, itemId)

  if (tasks.length === 0) return null

  const allDone = doneCount === tasks.length

  return (
    <SectionCard>
      <div className="p-4">
        {/* Header doubles as the collapse toggle — hidden by default, accessible. */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <div className="flex items-center gap-2 min-w-0">
            <WrenchIcon className="size-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Setup checklist
                <span className="text-muted-foreground font-normal"> · {tasks.length}</span>
              </h2>
              {!open && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  One-time install steps — tap to view.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doneCount > 0 && (
              <Badge variant={allDone ? "default" : "secondary"} className="text-xs">
                {doneCount}/{tasks.length} done
              </Badge>
            )}
            {open ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {open && (
          <>
            <p className="text-xs text-muted-foreground mt-2 mb-1">
              Complete once at install. Re-check after moving or service.
            </p>
            <div className="space-y-0">
              {tasks.map((task) => {
                const done = isDone(task.task_template_id)
                const loading = loadingIds.has(task.task_template_id)
                const triggers = parseReCheckTriggers(task.re_check_triggers ?? [])

                return (
                  <div
                    key={task.task_template_id}
                    className="flex gap-3 py-3 border-b border-border last:border-0"
                  >
                    <button
                      type="button"
                      onClick={() => toggleDone(task)}
                      disabled={loading}
                      aria-label={done ? "Mark as not done" : "Mark as done"}
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {done ? (
                        <CheckCircle2 className="size-5 text-primary" />
                      ) : (
                        <Circle className="size-5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <p
                        className={cn(
                          "text-sm font-medium leading-snug",
                          done && "line-through text-muted-foreground",
                        )}
                      >
                        {task.title}
                      </p>
                      {task.justification && !done && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                          {task.justification}
                        </p>
                      )}
                      {triggers.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className="text-xs text-muted-foreground">Re-do if:</span>
                          {triggers.map((t) => (
                            <Badge
                              key={t.trigger}
                              variant="outline"
                              className={cn(
                                "text-xs gap-1 py-0",
                                t.severity === "safety"
                                  ? "border-red-500/50 text-red-700 bg-red-50 dark:bg-red-950/30"
                                  : "border-amber-500/50 text-amber-700 bg-amber-50 dark:bg-amber-950/30",
                              )}
                            >
                              {t.severity === "safety" && (
                                <AlertTriangle className="size-3 shrink-0" />
                              )}
                              {SYMPTOM_TAGS[t.trigger as keyof typeof SYMPTOM_TAGS]?.label ??
                                t.trigger}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    {done && (
                      <button
                        type="button"
                        onClick={() => toggleDone(task)}
                        disabled={loading}
                        title="Mark as needing redo"
                        aria-label="Mark as needing redo"
                        className="shrink-0 mt-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  )
}
