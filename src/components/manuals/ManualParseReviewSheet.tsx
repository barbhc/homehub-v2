import { useState, useEffect } from "react"
import { ChevronDownIcon, ChevronRightIcon, Loader2Icon, XIcon } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { PreviewChunk, PreviewResult, PreviewTask, ScheduleType } from "@/modules/knowledge/types/previewTypes"

const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  after_each_use: "After each use",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Yearly",
  seasonal: "Seasonal",
  every_n_days: "Every N days",
  as_needed: "As needed",
  setup: "Setup (one-time)",
}

// "Sort it right": the three surfaces a task can land on, derived from its
// schedule_type. Changing a task's Schedule select re-files it live.
type Surface = "setup" | "habit" | "scheduled"
function surfaceOf(st: ScheduleType): Surface {
  if (st === "setup") return "setup"
  if (st === "after_each_use" || st === "as_needed") return "habit"
  return "scheduled"
}
const SURFACES: { id: Surface; label: string; hint: string }[] = [
  { id: "scheduled", label: "On a schedule", hint: "Recurring, due-dated upkeep" },
  { id: "habit", label: "Habits", hint: "Every use / as needed — no due date" },
  { id: "setup", label: "One-time setup", hint: "Done once at install" },
]
/** Below this, the parser wasn't sure — surface a "Check this" flag for review. */
const LOW_CONFIDENCE = 0.6

interface EditableTask extends PreviewTask {
  _key: string
}

interface ManualParseReviewSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  manualTitle: string
  previewData: PreviewResult
  onSave: (tasks: PreviewTask[], chunks: PreviewChunk[]) => Promise<string | null>
  saving: boolean
}

export function ManualParseReviewSheet({
  open,
  onOpenChange,
  manualTitle,
  previewData,
  onSave,
  saving,
}: ManualParseReviewSheetProps) {
  const [editableTasks, setEditableTasks] = useState<EditableTask[]>([])
  const [chunksOpen, setChunksOpen] = useState(true)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (open && previewData) {
      setEditableTasks(
        previewData.tasks.map((t) => ({ ...t, _key: crypto.randomUUID() }))
      )
    }
  }, [open, previewData])

  const updateTask = (key: string, updates: Partial<PreviewTask>) => {
    setEditableTasks((prev) =>
      prev.map((t) => (t._key === key ? { ...t, ...updates } : t))
    )
  }

  const deleteTask = (key: string) => {
    setEditableTasks((prev) => prev.filter((t) => t._key !== key))
  }

  const handleSave = async () => {
    setSaveError(null)
    const tasksToSave: PreviewTask[] = editableTasks.map((task) => {
      const { _key, ...rest } = task; void _key; return rest
    })
    const err = await onSave(tasksToSave, previewData.chunks)
    if (err) setSaveError(err)
  }

  // Calm tiers — never alarmist red (redesign non-negotiable).
  const priorityBorder = (tier: string) => {
    if (tier === "essential") return "border-l-[#C2410C]"
    if (tier === "recommended") return "border-l-[#1B6B5A]"
    return "border-l-[#5B748F]"
  }
  const lowConfidence = (t: PreviewTask) => t.confidence != null && t.confidence < LOW_CONFIDENCE

  const chunksByType = previewData.chunks.reduce<Record<string, PreviewChunk[]>>(
    (acc, c) => {
      (acc[c.chunk_type] ??= []).push(c)
      return acc
    },
    {}
  )

  const renderTask = (t: EditableTask) => (
    <div
      key={t._key}
      className={cn(
        "rounded-md border-l-4 border bg-card p-3",
        priorityBorder(t.priority_tier)
      )}
    >
      <div className="flex gap-2 items-center mb-2">
        <Input
          value={t.title}
          onChange={(e) => updateTask(t._key, { title: e.target.value })}
          className="flex-1"
          placeholder="Task title"
        />
        {lowConfidence(t) && (
          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200" title="The parser wasn't sure about this — double-check it">
            Check this
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => deleteTask(t._key)}
        >
          <XIcon className="size-4" />
        </Button>
      </div>
      <div className="flex gap-2 flex-wrap mb-2">
        <Select
          value={t.priority_tier}
          onValueChange={(v) => updateTask(t._key, { priority_tier: v as PreviewTask["priority_tier"] })}
        >
          <SelectTrigger className="w-[140px] h-11 md:h-8">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="essential">Essential</SelectItem>
            <SelectItem value="recommended">Recommended</SelectItem>
            <SelectItem value="optional">Optional</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={t.care_type}
          onValueChange={(v) => updateTask(t._key, { care_type: v as PreviewTask["care_type"] })}
        >
          <SelectTrigger className="w-[140px] h-11 md:h-8">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cleaning">Cleaning</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="mixed">Mixed</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={t.schedule_type}
          onValueChange={(v) => updateTask(t._key, { schedule_type: v as ScheduleType })}
        >
          <SelectTrigger className="w-[160px] h-11 md:h-8">
            <SelectValue placeholder="Schedule" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {t.schedule_type === "every_n_days" && (
        <div className="mb-2">
          <Label className="text-xs">Interval (days)</Label>
          <Input
            type="number"
            min={1}
            value={t.interval_days ?? ""}
            onChange={(e) =>
              updateTask(t._key, {
                interval_days: e.target.value ? parseInt(e.target.value, 10) : null,
              })
            }
            className="h-11 md:h-8 w-24 mt-0.5"
            placeholder="e.g. 7"
          />
        </div>
      )}
      <div>
        <Label className="text-xs">Instructions (optional)</Label>
        <textarea
          className="mt-0.5 w-full min-h-[60px] rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground resize-y"
          placeholder="Instructions…"
          value={t.instructions_text ?? ""}
          onChange={(e) =>
            updateTask(t._key, { instructions_text: e.target.value || null })
          }
        />
      </div>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col sm:max-w-2xl px-0"
      >
        <SheetHeader className="px-6">
          <SheetTitle>Review parsed manual</SheetTitle>
          <SheetDescription>
            {manualTitle} — {editableTasks.length} tasks · {previewData.chunks.length} chunks
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6">
          {/* Section 1 — TASKS, sorted by rhythm ("Sort it right") */}
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We sorted these by rhythm. Move anything in the wrong place, and check the
              <span className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200">Check this</span>
              flags where we weren&apos;t sure.
            </p>
            {SURFACES.map((surface) => {
              const group = editableTasks.filter((t) => surfaceOf(t.schedule_type) === surface.id)
              if (group.length === 0) return null
              return (
                <div key={surface.id} className="space-y-3">
                  <h3 className="flex items-baseline gap-2 pt-1 font-medium">
                    {surface.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{group.length}</span>
                    <span className="text-xs font-normal text-muted-foreground">{surface.hint}</span>
                  </h3>
                  {group.map(renderTask)}
                </div>
              )
            })}
          </div>

          {/* Section 2 — KNOWLEDGE CHUNKS (collapsible) */}
          <div className="mt-6">
            <button
              type="button"
              className="flex items-center gap-2 font-medium w-full text-left"
              onClick={() => setChunksOpen((o) => !o)}
            >
              {chunksOpen ? (
                <ChevronDownIcon className="size-4" />
              ) : (
                <ChevronRightIcon className="size-4" />
              )}
              Knowledge chunks ({previewData.chunks.length})
            </button>
            {chunksOpen && (
              <div className="mt-2 space-y-3">
                {Object.entries(chunksByType).map(([chunkType, list]) => (
                  <div key={chunkType}>
                    <h4 className="text-xs font-medium text-muted-foreground capitalize mb-1">
                      {chunkType.replace("_", " ")}
                    </h4>
                    <ul className="space-y-2">
                      {list.map((c, i) => (
                        <li
                          key={`${chunkType}-${i}`}
                          className="rounded border p-2 text-sm"
                        >
                          {c.title && (
                            <p className="font-medium mb-0.5">{c.title}</p>
                          )}
                          <p className="text-muted-foreground line-clamp-3">
                            {c.content}
                          </p>
                          {c.tags.length > 0 && (
                            <div className="mt-1 flex gap-1 flex-wrap">
                              {c.tags.slice(0, 5).map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-muted px-1.5 py-0.5 text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <SheetFooter className="px-6 flex-col gap-2 sm:flex-col">
          {saveError && (
            <p className="text-sm text-destructive text-center">{saveError}</p>
          )}
          <div className="flex justify-between w-full">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
              Save {editableTasks.length} tasks
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
