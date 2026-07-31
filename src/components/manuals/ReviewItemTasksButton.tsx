import { useState } from "react"
import { Loader2Icon, SlidersHorizontalIcon } from "lucide-react"
import { TaskReviewSheet } from "./TaskReviewSheet"
import { loadItemTasksForReview, saveItemTaskReview, type ExistingTaskReview } from "@/modules/care/services/taskReviewService"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { PreviewChunk, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { ReviewEditSummary } from "./TaskReviewFeedback"

/**
 * "Review tasks" on the item page — the same wizard used after a parse, pointed
 * at the tasks an item already has.
 *
 * Without this the new bucketing only ever reaches appliances added from here on:
 * the owner's 210 existing tasks came from older parses and had no route into a
 * post-parse-only screen. This is how a home gets calm rather than just staying
 * that way.
 */
export function ReviewItemTasksButton({
  homeId,
  itemUnitId,
  itemName,
  taskCount,
  onDone, compact }: {
  homeId: string
  itemUnitId: string
  itemName: string
  taskCount: number
  onDone: () => void
  /** Renders as a pill for the "Upkeep" section heading rather than a full-width
   *  card. Same action either way. */
  compact?: boolean
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [review, setReview] = useState<ExistingTaskReview | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async () => {
    setLoading(true)
    setError(null)
    const res = await loadItemTasksForReview(homeId, itemUnitId)
    setLoading(false)
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Could not load tasks")
      return
    }
    setReview(res.data)
    setOpen(true)
  }

  const handleSave = async (tasks: PreviewTask[], chunks: PreviewChunk[], edits: ReviewEditSummary): Promise<string | null> => {
    if (!review) return "Nothing to save"
    setSaving(true)
    const res = await saveItemTaskReview({
      homeId,
      itemUnitId,
      idByTitle: review.idByTitle,
      manualByTitle: review.manualByTitle,
      tasks,
      chunks,
    })
    setSaving(false)
    if (res.error) return res.error.message
    // Every correction is parser feedback, not only explicit complaints. Fire and
    // forget — recordParseFeedback never blocks or fails a save.
    if (edits.total > 0) {
      void recordParseFeedback(homeId, {
        manualId: null,
        itemUnitId,
        source: "review_save",
        reasons: [],
        note: "",
        edits,
        rescanRequested: false,
      })
    }
    setOpen(false)
    setReview(null)
    onDone()
    return null
  }

  if (taskCount === 0) return null

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => void start()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold disabled:opacity-60"
          style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}
        >
          {loading && <Loader2Icon className="size-3 animate-spin" />}
          Review tasks
        </button>
      ) : (
      <button
        type="button"
        onClick={() => void start()}
        disabled={loading}
        className="w-full flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        {loading ? <Loader2Icon className="size-4 animate-spin shrink-0" /> : <SlidersHorizontalIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal)" }} />}
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>Review these tasks</span>
          <span className="block text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
            Decide what's scheduled, what reminds you, and what's just a tip.
          </span>
        </span>
        <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--hh-faint)" }}>{taskCount}</span>
      </button>
      )}
      {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}

      {review && (
        <TaskReviewSheet
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setReview(null)
          }}
          itemName={itemName}
          previewData={review.preview}
          onSave={handleSave}
          saving={saving}
          onFeedback={(p) => {
            void recordParseFeedback(homeId, {
              manualId: null,
              itemUnitId,
              reasons: p.reasons,
              note: p.note,
              edits: p.edits,
              rescanRequested: p.rescan,
            })
          }}
        />
      )}
    </>
  )
}
