import { useEffect, useState, type ReactNode } from "react"
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LightbulbIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { updateTaskSchedule, archiveTaskTemplate, updateTaskCareType } from "@/modules/care"
import {
  archiveChunk,
  logParseCorrection,
  convertTaskToChunk,
  convertChunkToTask,
} from "@/modules/knowledge"
import type { KnowledgeChunk, ScheduleType } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"
import type { ParsedConfidence } from "@/modules/knowledge"
import { ParseBriefingCards } from "./ParseBriefingCards"

/* ─── Types ─────────────────────────────────────────────────────── */

type BucketKey = "maintenance" | "cleaning" | "how_to" | "troubleshooting"

interface ParseReviewStepProps {
  homeId: string
  itemUnitId?: string
  chunks: KnowledgeChunk[]
  tasks: TaskTemplateWithSchedule[]
  /**
   * Parse confidence scores from the edge function. Optional for backwards
   * compatibility with resumed wizard sessions that predate Arc 3.
   */
  confidence?: ParsedConfidence | null
  onChunksChange: (chunks: KnowledgeChunk[]) => void
  onTasksChange: (tasks: TaskTemplateWithSchedule[]) => void
  onFinish: () => void
}

/* ─── Constants ─────────────────────────────────────────────────── */

function taskBucket(t: TaskTemplateWithSchedule): "maintenance" | "cleaning" {
  return t.care_type === "cleaning" ? "cleaning" : "maintenance"
}

const SCHEDULE_OPTIONS: Array<{ value: ScheduleType; label: string }> = [
  { value: "after_each_use", label: "After each use" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "semiannual", label: "Every 6 months" },
  { value: "annual", label: "Yearly" },
  { value: "as_needed", label: "As needed" },
  { value: "setup", label: "Setup (one-time)" },
]

const BUCKET_META: Record<BucketKey, { label: string; shortLabel: string }> = {
  maintenance: { label: "Maintenance", shortLabel: "Maint." },
  cleaning: { label: "Cleaning", shortLabel: "Clean." },
  how_to: { label: "How-To", shortLabel: "How-To" },
  troubleshooting: { label: "Troubleshoot", shortLabel: "Troubl." },
}

/* ─── Move-to dropdown ──────────────────────────────────────────── */

function MoveToSelect({
  currentBucket,
  onMove,
}: {
  currentBucket: BucketKey
  onMove: (target: BucketKey) => void
}) {
  const targets = (Object.keys(BUCKET_META) as BucketKey[]).filter((k) => k !== currentBucket)

  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onMove(e.target.value as BucketKey)
      }}
      className="text-[10px] rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground cursor-pointer hover:border-primary/40 focus:outline-none transition-colors"
    >
      <option value="">Move to…</option>
      {targets.map((t) => (
        <option key={t} value={t}>
          → {BUCKET_META[t].label}
        </option>
      ))}
    </select>
  )
}

/* ─── Task review row ───────────────────────────────────────────── */

function TaskReviewRow({
  task,
  onReclassifyWithinTasks,
  onMoveToChunk,
  onTierChange,
  onScheduleChange,
  onRemove,
}: {
  task: TaskTemplateWithSchedule
  onReclassifyWithinTasks: (bucket: string) => void
  onMoveToChunk: (target: "how_to" | "troubleshooting") => void
  onTierChange: (tier: "essential" | "recommended" | "optional") => void
  onScheduleChange: (scheduleType: ScheduleType) => void
  onRemove: () => void
}) {
  const currentBucket = taskBucket(task)
  const borderColor =
    currentBucket === "cleaning" ? "border-l-teal-400" : "border-l-blue-400"

  const handleMove = (target: BucketKey) => {
    if (target === "maintenance" || target === "cleaning") {
      onReclassifyWithinTasks(target)
    } else {
      onMoveToChunk(target as "how_to" | "troubleshooting")
    }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 border-l-[3px] bg-card px-4 py-3 space-y-2",
        borderColor
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium leading-snug">{task.title}</span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Remove task"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={task.priority_tier}
          onChange={(e) => onTierChange(e.target.value as "essential" | "recommended" | "optional")}
          className="text-[10px] rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground cursor-pointer hover:border-primary/40 focus:outline-none transition-colors"
        >
          <option value="essential">Essential</option>
          <option value="recommended">Recommended</option>
          <option value="optional">Optional</option>
        </select>

        <select
          value={currentBucket}
          onChange={(e) => onReclassifyWithinTasks(e.target.value)}
          className="text-[10px] rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground cursor-pointer hover:border-primary/40 focus:outline-none transition-colors"
        >
          <option value="maintenance">Maintenance</option>
          <option value="cleaning">Cleaning</option>
        </select>

        <select
          value={(task.schedule_rule?.[0]?.schedule_type ?? "as_needed") as string}
          onChange={(e) => onScheduleChange(e.target.value as ScheduleType)}
          className="text-[10px] rounded-md border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground cursor-pointer hover:border-primary/40 focus:outline-none transition-colors"
        >
          {SCHEDULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        <MoveToSelect currentBucket={currentBucket} onMove={handleMove} />
      </div>
    </div>
  )
}

/* ─── Chunk review row ──────────────────────────────────────────── */

function ChunkReviewRow({
  chunk,
  onMove,
  onRemove,
}: {
  chunk: KnowledgeChunk
  onMove: (target: BucketKey) => void
  onRemove: () => void
}) {
  const currentBucket = chunk.chunk_type as BucketKey
  const borderColor =
    currentBucket === "how_to" ? "border-l-amber-400" : "border-l-orange-400"

  let preview: string
  try {
    const parsed = JSON.parse(chunk.content) as { steps?: string[] }
    preview = parsed.steps?.slice(0, 2).join(" · ") ?? chunk.content.slice(0, 120)
  } catch {
    preview = chunk.content.slice(0, 120)
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 border-l-[3px] bg-card px-4 py-3 space-y-1.5",
        borderColor
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {chunk.title && <p className="text-sm font-medium leading-snug">{chunk.title}</p>}
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
            {preview}
            {preview.length >= 120 ? "…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          aria-label="Remove"
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <MoveToSelect currentBucket={currentBucket} onMove={onMove} />
      </div>
    </div>
  )
}

/* ─── Main component ────────────────────────────────────────────── */

export function ParseReviewStep({
  homeId,
  itemUnitId,
  chunks,
  tasks,
  confidence,
  onChunksChange,
  onTasksChange,
  onFinish,
}: ParseReviewStepProps) {
  const [appeared, setAppeared] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)
  // 4-bucket editor is collapsed by default so briefing cards get first focus.
  // Auto-expand for backward-compat sessions that predate Arc 3 (no confidence
  // data means no briefing cards — so the editor is all there is to show).
  const [bucketExpanded, setBucketExpanded] = useState(confidence === null)

  useEffect(() => {
    const timer = setTimeout(() => setAppeared(true), 100)
    return () => clearTimeout(timer)
  }, [])

  // Derive manualId from first chunk (all chunks share the same manual)
  const manualId = chunks[0]?.manual_id ?? null

  const maintenanceTasks = tasks.filter((t) => taskBucket(t) === "maintenance")
  const cleaningTasks = tasks.filter((t) => taskBucket(t) === "cleaning")
  const howToChunks = chunks.filter((c) => c.chunk_type === "how_to")
  const troubleChunks = chunks.filter((c) => c.chunk_type === "troubleshooting")

  /* ── Task mutations ── */

  const reclassifyTaskWithinTasks = async (taskId: string, newBucket: "maintenance" | "cleaning") => {
    const task = tasks.find((t) => t.task_template_id === taskId)
    if (!task) return
    const oldBucket = taskBucket(task)
    if (oldBucket === newBucket) return

    const careType = newBucket === "cleaning" ? "cleaning" : "maintenance"
    const prev = tasks
    onTasksChange(tasks.map((t) => (t.task_template_id === taskId ? { ...t, care_type: careType } : t)))
    const result = await updateTaskCareType(homeId, taskId, careType)
    if (result.error) {
      onTasksChange(prev)
      setMutationError("Couldn't update task type. Please try again.")
      return
    }

    // Log correction
    logParseCorrection(homeId, oldBucket, newBucket, task.title, task.description ?? null)
  }

  const moveTaskToChunk = async (taskId: string, target: "how_to" | "troubleshooting") => {
    if (!manualId) {
      setMutationError("No manual found — can't reclassify.")
      return
    }

    const task = tasks.find((t) => t.task_template_id === taskId)
    if (!task) return
    const oldBucket = taskBucket(task)

    // Optimistic: remove from tasks
    const prevTasks = tasks
    const prevChunks = chunks
    onTasksChange(tasks.filter((t) => t.task_template_id !== taskId))

    const result = await convertTaskToChunk(taskId, homeId, target, manualId)
    if (result.error) {
      onTasksChange(prevTasks)
      setMutationError("Couldn't move item. Please try again.")
      return
    }

    // Add the new chunk
    onChunksChange([...prevChunks, result.data!])

    // Log correction
    logParseCorrection(homeId, oldBucket, target, task.title, task.description ?? null)
  }

  const updateTaskTier = async (taskId: string, tier: "essential" | "recommended" | "optional") => {
    const prev = tasks
    onTasksChange(tasks.map((t) => (t.task_template_id === taskId ? { ...t, priority_tier: tier } : t)))
    const result = await updateTaskSchedule(taskId, { priorityTier: tier }, "import")
    if (result.error) {
      onTasksChange(prev)
      setMutationError("Couldn't update tier. Please try again.")
    }
  }

  const updateScheduleType = async (taskId: string, scheduleType: ScheduleType) => {
    const prev = tasks
    onTasksChange(
      tasks.map((t) =>
        t.task_template_id === taskId
          ? {
              ...t,
              schedule_rule: [
                { ...(t.schedule_rule?.[0] ?? ({} as never)), schedule_type: scheduleType },
              ],
            }
          : t
      )
    )
    const result = await updateTaskSchedule(taskId, { schedule: { scheduleType } })
    if (result.error) {
      onTasksChange(prev)
      setMutationError("Couldn't update schedule. Please try again.")
    }
  }

  const removeTask = async (taskId: string) => {
    const prev = tasks
    onTasksChange(tasks.filter((t) => t.task_template_id !== taskId))
    const result = await archiveTaskTemplate(homeId, taskId)
    if (!result.success) {
      onTasksChange(prev)
      setMutationError("Couldn't remove task. Please try again.")
    }
  }

  /* ── Chunk mutations ── */

  const moveChunk = async (chunkId: string, target: BucketKey) => {
    const chunk = chunks.find((c) => c.chunk_id === chunkId)
    if (!chunk) return
    const oldBucket = chunk.chunk_type as string

    // Chunk → task (maintenance or cleaning)
    if (target === "maintenance" || target === "cleaning") {
      if (!itemUnitId) {
        setMutationError("Missing item context — can't convert to task.")
        return
      }

      const prevChunks = chunks
      onChunksChange(chunks.filter((c) => c.chunk_id !== chunkId))

      const result = await convertChunkToTask(chunkId, homeId, itemUnitId, target)
      if (result.error) {
        onChunksChange(prevChunks)
        setMutationError("Couldn't move item. Please try again.")
        return
      }

      // Add the new task to the tasks list (minimal shape for display)
      const newTask: TaskTemplateWithSchedule = {
        task_template_id: result.data!.task_template_id,
        title: result.data!.title,
        home_id: homeId,
        scope_type: "item_unit",
        item_unit_id: itemUnitId,
        source: "manual",
        care_type: target,
        priority_tier: "recommended",
        risk_level: "comfort",
        supplies_mode: "none",
        is_user_editable: true,
        is_active: true,
        description: chunk.content?.slice(0, 1000) ?? null,
        instructions_override: chunk.content?.slice(0, 2000) ?? null,
        estimated_minutes: null,
        default_assignee: null,
        metadata: {},
        room_id: null,
        instructions_chunk_id: null,
        user_modified_at: null,
        // Justification + override flag default null on user-converted chunks; the
        // original parse-manual call would have populated justification when known.
        justification: null,
        care_type_overridden_at: null,
        // Setup-task fields default empty for chunks the user converted manually
        // — only the parser populates these from manual content.
        symptom_tags: [],
        re_check_triggers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        schedule_rule: [{ schedule_type: "as_needed" } as never],
      }
      onTasksChange([...tasks, newTask])

      logParseCorrection(homeId, oldBucket, target, chunk.title ?? "Untitled", chunk.content ?? null)
      return
    }

    // Chunk → different chunk type (how_to ↔ troubleshooting)
    if (target === "how_to" || target === "troubleshooting") {
      const prevChunks = chunks
      onChunksChange(
        chunks.map((c) =>
          c.chunk_id === chunkId ? { ...c, chunk_type: target } : c
        )
      )

      // Update in DB
      const { error } = await (await import("@/integrations/shim/client")).supabase
        .from("knowledge_chunk")
        .update({ chunk_type: target })
        .eq("chunk_id", chunkId)

      if (error) {
        onChunksChange(prevChunks)
        setMutationError("Couldn't update chunk type. Please try again.")
        return
      }

      logParseCorrection(homeId, oldBucket, target, chunk.title ?? "Untitled", chunk.content ?? null)
    }
  }

  const removeChunk = async (chunkId: string) => {
    const prev = chunks
    onChunksChange(chunks.filter((c) => c.chunk_id !== chunkId))
    const result = await archiveChunk(chunkId)
    if (result.error) {
      onChunksChange(prev)
      setMutationError("Couldn't remove item. Please try again.")
    }
  }

  const totalCount = tasks.length + howToChunks.length + troubleChunks.length

  return (
    <div className="space-y-3 pb-24">
      <p className="text-sm text-muted-foreground px-1">
        Here's what we found. Click "Looks good →" to save, or expand the details to review individual tasks.
      </p>

      <ParseBriefingCards
        itemUnitId={itemUnitId}
        chunks={chunks}
        tasks={tasks}
        confidence={confidence ?? null}
      />

      {/* ── See all / collapse toggle ──────────────────────────────── */}
      {totalCount > 0 && (
        <button
          type="button"
          onClick={() => setBucketExpanded((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-1 min-h-11 md:min-h-0"
          aria-expanded={bucketExpanded}
        >
          {bucketExpanded ? (
            <>
              <ChevronUpIcon className="size-3.5" aria-hidden />
              Hide task details
            </>
          ) : (
            <>
              <ChevronDownIcon className="size-3.5" aria-hidden />
              {`See all ${totalCount} ${totalCount === 1 ? "item" : "items"} →`}
            </>
          )}
        </button>
      )}

      {bucketExpanded && (
        <>
          {mutationError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircleIcon className="size-4 shrink-0" />
              <span>{mutationError}</span>
              <button
                type="button"
                onClick={() => setMutationError(null)}
                className="ml-auto shrink-0 p-0.5 rounded hover:bg-destructive/20"
                aria-label="Dismiss"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}

          {[
        {
          key: "maintenance" as BucketKey,
          label: "Maintenance Tasks",
          sublabel: "Inspections, replacements, servicing",
          icon: <WrenchIcon className="size-4" />,
          iconBg: "bg-blue-50 text-blue-600",
          headerColor: "text-blue-700",
          borderColor: "border-l-blue-400",
          emptyLabel: "No maintenance tasks found",
          items: maintenanceTasks,
          renderItem: (t: TaskTemplateWithSchedule) => (
            <TaskReviewRow
              key={t.task_template_id}
              task={t}
              onReclassifyWithinTasks={(bucket) => reclassifyTaskWithinTasks(t.task_template_id, bucket as "maintenance" | "cleaning")}
              onMoveToChunk={(target) => moveTaskToChunk(t.task_template_id, target)}
              onTierChange={(tier) => updateTaskTier(t.task_template_id, tier)}
              onScheduleChange={(sched) => updateScheduleType(t.task_template_id, sched)}
              onRemove={() => removeTask(t.task_template_id)}
            />
          ),
        },
        {
          key: "cleaning" as BucketKey,
          label: "Cleaning Tasks",
          sublabel: "Wiping, washing, dusting",
          icon: <SparklesIcon className="size-4" />,
          iconBg: "bg-teal-50 text-teal-600",
          headerColor: "text-teal-700",
          borderColor: "border-l-teal-400",
          emptyLabel: "No cleaning tasks found",
          items: cleaningTasks,
          renderItem: (t: TaskTemplateWithSchedule) => (
            <TaskReviewRow
              key={t.task_template_id}
              task={t}
              onReclassifyWithinTasks={(bucket) => reclassifyTaskWithinTasks(t.task_template_id, bucket as "maintenance" | "cleaning")}
              onMoveToChunk={(target) => moveTaskToChunk(t.task_template_id, target)}
              onTierChange={(tier) => updateTaskTier(t.task_template_id, tier)}
              onScheduleChange={(sched) => updateScheduleType(t.task_template_id, sched)}
              onRemove={() => removeTask(t.task_template_id)}
            />
          ),
        },
        {
          key: "how_to" as BucketKey,
          label: "How-To Guides",
          sublabel: "Step-by-step procedures",
          icon: <LightbulbIcon className="size-4" />,
          iconBg: "bg-amber-50 text-amber-600",
          headerColor: "text-amber-700",
          borderColor: "border-l-amber-400",
          emptyLabel: "No how-to guides found",
          items: howToChunks,
          renderItem: (c: KnowledgeChunk) => (
            <ChunkReviewRow
              key={c.chunk_id}
              chunk={c}
              onMove={(target) => moveChunk(c.chunk_id, target)}
              onRemove={() => removeChunk(c.chunk_id)}
            />
          ),
        },
        {
          key: "troubleshooting" as BucketKey,
          label: "Troubleshooting",
          sublabel: "Problems & fixes",
          icon: <AlertCircleIcon className="size-4" />,
          iconBg: "bg-orange-50 text-orange-600",
          headerColor: "text-orange-700",
          borderColor: "border-l-orange-400",
          emptyLabel: "No troubleshooting content found",
          items: troubleChunks,
          renderItem: (c: KnowledgeChunk) => (
            <ChunkReviewRow
              key={c.chunk_id}
              chunk={c}
              onMove={(target) => moveChunk(c.chunk_id, target)}
              onRemove={() => removeChunk(c.chunk_id)}
            />
          ),
        },
      ].map((bucket, bucketIdx) => (
        <section
          key={bucket.key}
          className="transition-all duration-500"
          style={{
            opacity: appeared ? 1 : 0,
            transform: appeared ? "translateY(0)" : "translateY(12px)",
            transitionDelay: `${bucketIdx * 80}ms`,
          }}
        >
          <div className="flex items-center gap-2.5 mb-2 px-1">
            <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center shrink-0", bucket.iconBg)}>
              {bucket.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-semibold", bucket.headerColor)}>{bucket.label}</span>
                <span className="text-xs text-muted-foreground/60">{bucket.items.length}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 leading-none mt-0.5">{bucket.sublabel}</p>
            </div>
          </div>

          {bucket.items.length > 0 ? (
            <div className="space-y-2">{bucket.items.map((item) => (bucket.renderItem as (x: typeof item) => ReactNode)(item))}</div>
          ) : (
            <div
              className={cn(
                "rounded-xl border border-dashed border-border/50 border-l-[3px] px-4 py-4 text-center",
                bucket.borderColor
              )}
            >
              <p className="text-xs text-muted-foreground/50">{bucket.emptyLabel}</p>
            </div>
          )}
        </section>
      ))}
        </>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur border-t border-border px-4 py-4 flex items-center justify-between gap-4 sm:relative sm:bottom-auto sm:bg-transparent sm:backdrop-blur-none sm:border-t-0 sm:px-0 sm:pt-4">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{tasks.length}</strong> tasks
          </span>
          {howToChunks.length > 0 && (
            <span>
              <strong className="text-foreground tabular-nums">{howToChunks.length}</strong> how-tos
            </span>
          )}
          {troubleChunks.length > 0 && (
            <span>
              <strong className="text-foreground tabular-nums">{troubleChunks.length}</strong> tips
            </span>
          )}
        </div>
        <Button onClick={onFinish} disabled={totalCount === 0}>
          Looks good →
        </Button>
      </div>
    </div>
  )
}
