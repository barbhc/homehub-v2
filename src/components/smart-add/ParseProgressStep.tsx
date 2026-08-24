import { useEffect, useState } from "react"
import { CheckIcon, Loader2Icon, AlertCircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
// Structural, not nominal: this step only counts by care_type / chunk_type, and
// it now receives PREVIEW rows (uncommitted draft) rather than live rows. Typing
// it to the two fields it actually reads keeps it usable from both.

/**
 * UI stages for the parse trust arc (fix B). Maps from the worker's Firestore
 * `parse.stage` via `toUiStage` in parseManualService: started/pdf_fetched →
 * reading, claude_* → extracting, committing → saving. The component advances to
 * a populated review ONLY on `done` (the worker reaches done only after commit),
 * so an empty review is impossible.
 */
export type ParseProgressState =
  | "idle"
  | "uploading"
  | "queued"
  | "reading"
  | "extracting"
  | "saving"
  | "done"
  | "error"

interface ParseProgressStepProps {
  progress: ParseProgressState
  parsedChunks: { chunk_type?: string | null }[]
  parsedTasks: { care_type?: string | null }[]
  /** Shown while working: lets the user leave for the item page. The worker
   *  parses server-side, so leaving is always safe — this makes that visible. */
  onContinueInBackground?: () => void
}

const STAGES = [
  { id: "uploading", label: "Uploading manual", unlockAt: "uploading" },
  { id: "queued", label: "Queued", unlockAt: "queued" },
  { id: "reading", label: "Reading document content", unlockAt: "reading" },
  { id: "extracting", label: "Extracting knowledge", unlockAt: "extracting" },
  { id: "saving", label: "Saving results", unlockAt: "saving" },
  { id: "done", label: "Ready to review", unlockAt: "done" },
] as const

const PROGRESS_ORDER: ParseProgressState[] = [
  "idle",
  "uploading",
  "queued",
  "reading",
  "extracting",
  "saving",
  "done",
]

/** Honest, stage-aware subline (replaces the old "20–40 seconds" fib — real full
 *  manual parses take 2–4 minutes on the worker). */
const STAGE_SUBCOPY: Record<ParseProgressState, string> = {
  idle: "",
  uploading: "Sending your manual securely…",
  queued: "Waiting for a scanning slot — this is fine, we'll start shortly.",
  reading: "Reading the document end to end. This takes 2–4 minutes for a full manual.",
  extracting: "Pulling out care steps, schedules, and troubleshooting tips…",
  saving: "Saving results to your home. Almost there.",
  done: "Here's what we found. Review and adjust before saving.",
  error: "We couldn't finish reading this manual. You can retry, or add tasks yourself.",
}

function progressIndex(p: ParseProgressState) {
  return PROGRESS_ORDER.indexOf(p)
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

export function ParseProgressStep({ progress, parsedChunks, parsedTasks, onContinueInBackground }: ParseProgressStepProps) {
  const maintenanceTasks = parsedTasks.filter((t) => t.care_type !== "cleaning")
  const cleaningTasks = parsedTasks.filter((t) => t.care_type === "cleaning")
  const howToChunks = parsedChunks.filter((c) => c.chunk_type === "how_to")
  const troubleshootingChunks = parsedChunks.filter((c) => c.chunk_type === "troubleshooting")

  const isDone = progress === "done"
  const isError = progress === "error"
  const isWorking = !isDone && !isError && progress !== "idle"
  const currentIdx = progressIndex(progress)

  // Elapsed timer — surfaces after 60s so the honest 2–4 min wait feels tracked,
  // not stalled. Resets when a run starts; stops on done/error.
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!isWorking) return
    setElapsed(0)
    const start = Date.now()
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(id)
    // Restart the timer whenever the run (re)enters a working stage from idle.
  }, [isWorking])

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
          {isDone ? "Scan complete" : isError ? "Couldn't finish" : "Scanning your manual…"}
        </h2>
        <p className="text-sm text-white/50 mt-1">{STAGE_SUBCOPY[progress]}</p>
        {isWorking && elapsed >= 60 && (
          <p className="text-xs text-white/35 mt-2 tabular-nums">
            Elapsed {formatElapsed(elapsed)} · you can leave this page and come back — we'll keep working.
          </p>
        )}
      </div>

      {isWorking && onContinueInBackground && (
        <div className="relative -mt-3">
          <button
            type="button"
            onClick={onContinueInBackground}
            className="inline-flex items-center gap-1.5 rounded-full ring-1 ring-white/25 px-4 py-2 text-[13px] font-semibold text-white/85 hover:bg-white/10 transition-colors"
          >
            Continue in background →
          </button>
          <p className="text-[11px] text-white/35 mt-2">
            We'll keep reading — the tasks we find will be waiting on the item's page.
          </p>
        </div>
      )}

      {isError ? (
        <div className="relative flex items-center gap-3 rounded-xl bg-white/5 ring-1 ring-white/10 px-4 py-3">
          <AlertCircleIcon className="size-5 text-amber-300/80 shrink-0" />
          <span className="text-sm text-white/70">{STAGE_SUBCOPY.error}</span>
        </div>
      ) : (
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
      )}

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
