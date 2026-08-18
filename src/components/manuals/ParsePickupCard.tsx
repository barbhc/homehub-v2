import { useEffect, useMemo, useState } from "react"
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react"
import {
  watchParse,
  toUiStage,
  readPreviewDraft,
  commitReviewedDraft,
  type ParseStage,
} from "@/modules/knowledge/services/parseManualService"
import { TaskReviewSheet } from "./TaskReviewSheet"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { clearParsePending, isParsePending } from "@/lib/parsePickup"
import { ReviewItemTasksButton } from "./ReviewItemTasksButton"

const ACTIVE_STAGES: ParseStage[] = [
  "queued",
  "started",
  "pdf_fetched",
  "claude_call",
  "claude_responded",
  "committing",
]

const STAGE_LINE: Record<string, string> = {
  uploading: "Starting…",
  queued: "Waiting for a parsing slot…",
  reading: "Reading the document end to end…",
  extracting: "Pulling out care steps and schedules…",
  saving: "Saving results to your home…",
}

interface ManualParseState {
  stage: ParseStage
  tasks: number | null
}

/**
 * Item-page pickup for a wizard parse the user walked away from. Three
 * states, all gated on the wizard's parsePickup handoff flag (old manuals sit
 * at `done` forever, and item-page rescans have their own inline progress):
 * live progress, "N tasks ready — review", and a one-line error. Renders
 * nothing otherwise.
 */
export function ParsePickupCard({
  homeId,
  itemUnitId,
  itemName,
  manualIds,
  onReviewSaved,
}: {
  homeId: string
  itemUnitId: string
  itemName: string
  manualIds: string[]
  onReviewSaved: () => void
}) {
  const [byManual, setByManual] = useState<Record<string, ManualParseState>>({})
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  /** The uncommitted draft for the manual being picked up, if it still has one.
   *  Present ⇒ the wizard previewed and the user left before saving. */
  const [draft, setDraft] = useState<PreviewResult | null>(null)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftSaving, setDraftSaving] = useState(false)

  const idsKey = manualIds.join(",")
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : []
    const unsubs = ids.map((manualId) =>
      watchParse(homeId, manualId, (stage, parse) => {
        setByManual((prev) => ({
          ...prev,
          [manualId]: { stage, tasks: parse.summary?.tasks ?? null },
        }))
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [homeId, idsKey])

  // Both states gate on the wizard's handoff flag: item-page rescans have
  // their own inline progress UI, and old parses sit at `done` forever.
  const active = useMemo(
    () => Object.entries(byManual).find(([id, s]) => ACTIVE_STAGES.includes(s.stage) && isParsePending(id)),
    [byManual]
  )
  const pickup = useMemo(
    () =>
      Object.entries(byManual).find(
        ([id, s]) => (s.stage === "done" || s.stage === "error") && isParsePending(id) && !dismissed[id]
      ),
    [byManual, dismissed]
  )

  // Look for a draft as soon as a finished parse is picked up. A manual that
  // committed has none (commitManualDraft clears it), so absence is the signal
  // that the tasks are already live.
  const pickupId = pickup?.[0] ?? null
  useEffect(() => {
    if (!pickupId) { setDraft(null); return }
    let cancelled = false
    readPreviewDraft(homeId, pickupId)
      .then((d) => { if (!cancelled) setDraft(d) })
      .catch(() => { if (!cancelled) setDraft(null) })
    return () => { cancelled = true }
  }, [homeId, pickupId])

  const dismiss = (manualId: string) => {
    clearParsePending(manualId)
    setDismissed((prev) => ({ ...prev, [manualId]: true }))
  }

  if (active) {
    const ui = toUiStage(active[1].stage)
    return (
      <div
        className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        <Loader2Icon className="size-4 shrink-0 animate-spin" style={{ color: "var(--hh-teal)" }} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
            Still reading the manual — {STAGE_LINE[ui] ?? "working…"}
          </p>
          <p className="text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
            Takes a couple of minutes. You can leave this page; we'll keep working.
          </p>
        </div>
      </div>
    )
  }

  if (!pickup) return null
  const [manualId, state] = pickup

  if (state.stage === "error") {
    return (
      <div
        className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        <p className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--hh-clay)" }}>
          We couldn't finish reading the manual. You can retry from the manual card below.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismiss(manualId)}
          className="shrink-0 rounded-full p-1"
          style={{ color: "var(--hh-sub)" }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="mb-4 flex items-center gap-3 rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--hh-teal)", background: "var(--hh-surface)" }}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: "color-mix(in srgb, var(--hh-teal) 15%, transparent)" }}
      >
        <CheckIcon className="size-3.5" style={{ color: "var(--hh-teal)" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
          Manual read{state.tasks != null ? ` — ${state.tasks} suggested ${state.tasks === 1 ? "task" : "tasks"}` : ""}
        </p>
        <p className="text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
          {draft
            ? "Nothing saved yet — review to choose what to keep."
            : "They're saved already — review to adjust or remove any."}
        </p>
      </div>
      {/* Two different "review" buttons, because there are two different
          states behind them. A wizard parse the user walked away from leaves an
          UNCOMMITTED draft and zero tasks — the committed-task loader would
          open an empty sheet. When a draft is present we review THAT and commit
          on save; otherwise the tasks are already live and we review those. */}
      {draft ? (
        <button
          type="button"
          onClick={() => setDraftOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[11.5px] font-bold"
          style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}
        >
          Review them
        </button>
      ) : (
        <ReviewItemTasksButton
          homeId={homeId}
          itemUnitId={itemUnitId}
          itemName={itemName}
          taskCount={state.tasks ?? 1}
          compact
          onDone={() => {
            dismiss(manualId)
            onReviewSaved()
          }}
        />
      )}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => dismiss(manualId)}
        className="shrink-0 rounded-full p-1"
        style={{ color: "var(--hh-sub)" }}
      >
        <XIcon className="size-4" />
      </button>

      {draft && (
        <TaskReviewSheet
          open={draftOpen}
          onOpenChange={setDraftOpen}
          itemName={itemName}
          previewData={draft}
          saving={draftSaving}
          onSave={async (tasks: PreviewTask[], chunks: PreviewChunk[]) => {
            setDraftSaving(true)
            const res = await commitReviewedDraft(homeId, manualId, chunks, tasks)
            setDraftSaving(false)
            if (!res.ok) return res.error
            setDraftOpen(false)
            setDraft(null)
            dismiss(manualId)
            onReviewSaved()
            return null
          }}
          onFeedback={(p) => {
            void recordParseFeedback(homeId, {
              manualId,
              itemUnitId,
              reasons: p.reasons,
              note: p.note,
              edits: p.edits,
              rescanRequested: p.rescan,
            })
          }}
        />
      )}
    </div>
  )
}
