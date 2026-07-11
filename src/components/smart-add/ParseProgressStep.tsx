import { CheckIcon, Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { KnowledgeChunk } from "@/integrations/types"
import type { TaskTemplateWithSchedule } from "@/modules/care"

export type ParseProgressState =
  | "idle"
  | "uploading"
  | "reading"
  | "extracting"
  | "done"
  | "error"

interface ParseProgressStepProps {
  progress: ParseProgressState
  parsedChunks: KnowledgeChunk[]
  parsedTasks: TaskTemplateWithSchedule[]
}

const STAGES = [
  { id: "uploading", label: "Uploading manual", unlockAt: "uploading" },
  { id: "reading", label: "Reading document content", unlockAt: "reading" },
  { id: "extracting", label: "Extracting knowledge", unlockAt: "extracting" },
  { id: "done", label: "Ready to review", unlockAt: "done" },
] as const

const PROGRESS_ORDER: ParseProgressState[] = [
  "idle",
  "uploading",
  "reading",
  "extracting",
  "done",
]

function progressIndex(p: ParseProgressState) {
  return PROGRESS_ORDER.indexOf(p)
}

export function ParseProgressStep({ progress, parsedChunks, parsedTasks }: ParseProgressStepProps) {
  const maintenanceTasks = parsedTasks.filter((t) => t.care_type !== "cleaning")
  const cleaningTasks = parsedTasks.filter((t) => t.care_type === "cleaning")
  const howToChunks = parsedChunks.filter((c) => c.chunk_type === "how_to")
  const troubleshootingChunks = parsedChunks.filter((c) => c.chunk_type === "troubleshooting")

  const isDone = progress === "done"
  const currentIdx = progressIndex(progress)

  return (
    <div className="min-h-[420px] rounded-2xl bg-[#1a2e25] px-8 py-10 flex flex-col gap-8 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-white/40 mb-2">
          Manual Analysis
        </p>
        <h2 className="font-display text-2xl font-semibold text-white leading-snug">
          {isDone ? "Analysis complete" : "Reading your manual…"}
        </h2>
        <p className="text-sm text-white/50 mt-1">
          {isDone
            ? "Here's what we found. Review and adjust before saving."
            : "This usually takes 20–40 seconds."}
        </p>
      </div>

      <div className="relative flex flex-col gap-3">
        {STAGES.map((stage, i) => {
          const stageIdx = progressIndex(stage.unlockAt as ParseProgressState)
          const isActive = currentIdx === stageIdx
          const isComplete = currentIdx > stageIdx
          const isVisible = stageIdx <= currentIdx

          return (
            <div
              key={stage.id}
              className="flex items-center gap-3 transition-all duration-500"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateX(0)" : "translateX(-8px)",
                transitionDelay: `${i * 60}ms`,
              }}
            >
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300",
                  isComplete && "bg-emerald-400/20 ring-1 ring-emerald-400/40",
                  isActive && !isDone && "bg-white/10 ring-1 ring-white/20",
                  !isVisible && "bg-white/5 ring-1 ring-white/10"
                )}
              >
                {isComplete ? (
                  <CheckIcon className="size-3 text-emerald-400" />
                ) : isActive && !isDone ? (
                  <Loader2Icon className="size-3 text-white/60 animate-spin" />
                ) : (
                  <span className="size-1.5 rounded-full bg-white/20" />
                )}
              </div>

              <span
                className={cn(
                  "text-sm transition-colors duration-300",
                  isComplete && "text-white/70",
                  isActive && !isDone && "text-white font-medium",
                  !isActive && !isComplete && "text-white/30"
                )}
              >
                {stage.label}
              </span>
            </div>
          )
        })}
      </div>

      {isDone && (
        <div
          className="relative flex flex-wrap gap-2 transition-all duration-500"
          style={{ opacity: isDone ? 1 : 0, transform: isDone ? "translateY(0)" : "translateY(8px)" }}
        >
          {[
            {
              label: "maintenance tasks",
              count: maintenanceTasks.length,
              color: "bg-blue-500/20 text-blue-300 ring-blue-500/30",
            },
            {
              label: "cleaning tasks",
              count: cleaningTasks.length,
              color: "bg-teal-500/20 text-teal-300 ring-teal-500/30",
            },
            {
              label: "how-to guides",
              count: howToChunks.length,
              color: "bg-amber-500/20 text-amber-300 ring-amber-500/30",
            },
            {
              label: "troubleshooting tips",
              count: troubleshootingChunks.length,
              color: "bg-orange-500/20 text-orange-300 ring-orange-500/30",
            },
          ]
            .filter((c) => c.count > 0)
            .map((chip) => (
              <span
                key={chip.label}
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs rounded-full px-3 py-1 ring-1",
                  chip.color
                )}
              >
                <span className="font-bold tabular-nums">{chip.count}</span>
                {chip.label}
              </span>
            ))}
        </div>
      )}
    </div>
  )
}
