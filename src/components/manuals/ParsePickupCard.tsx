import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react"
import {
  watchParse,
  toUiStage,
  ACTIVE_PARSE_STAGES,
  readPreviewDraft,
  commitReviewedDraft,
  type ParseStage,
} from "@/modules/knowledge/services/parseManualService"
import { TaskReviewSheet } from "./TaskReviewSheet"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { clearParsePending, isParsePending } from "@/lib/parsePickup"
import { ReviewItemTasksButton } from "./ReviewItemTasksButton"

/**
 * Manuals whose review we have already opened by ourselves, this session.
 *
 * Module-level rather than component state because the item page remounts on
 * every navigation, and "we opened this for you once" must survive that — a
 * sheet that reappears every time the user returns to the item is an ambush,
 * not a handoff. Cleared only by a reload, which is a cheap enough reset.
 */
const autoOpened = new Set<string>()

const ACTIVE_STAGES = ACTIVE_PARSE_STAGES

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
  /** Page count, once the worker has fetched the PDF. */
  pages: number | null
}

/**
 * Item-page pickup for a parse whose results are waiting to be reviewed.
 *
 * Originally gated ONLY on the wizard's localStorage handoff flag — which the
 * item-page attach path never sets. The audit smoke walked that path as a
 * brand-new user: the parse finished, previewDraft held 7 tasks, and this card
 * rendered null forever. The page said "no manual yet" one line above
 * "Manuals & References (1)", and the tasks were unreachable. A dead end on
 * the product's key flow.
 *
 * So the DATA is now the gate: a finished manual that still HAS a previewDraft
 * is by definition awaiting review — commitManualDraft deletes the draft on
 * save, so a lingering draft cannot mean anything else. The flag remains only
 * as the fast path for in-flight wizard parses (live progress before any
 * draft exists) and for surfacing errors from the wizard handoff.
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

  /** Manuals we watched actually RUN here, as opposed to finding already done.
   *  Watching one finish is the strongest evidence the user is waiting on it. */
  const watchedRunning = useRef<Set<string>>(new Set())

  const idsKey = manualIds.join(",")
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : []
    const unsubs = ids.map((manualId) =>
      watchParse(homeId, manualId, (stage, parse) => {
        if (ACTIVE_STAGES.includes(stage)) watchedRunning.current.add(manualId)
        setByManual((prev) => ({
          ...prev,
          [manualId]: {
            stage,
            tasks: parse.summary?.tasks ?? null,
            // Sticky: pdfPages is written once, at pdf_fetched, and later
            // snapshots do not repeat it.
            pages: parse.pdfPages ?? prev[manualId]?.pages ?? null,
          },
        }))
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [homeId, idsKey])

  // HH-87: the in-flight banner is DATA-gated. It used to require the wizard's
  // handoff flag, on the theory that item-page adds had their own inline
  // progress — true only while the add dialog stayed open. The owner added a
  // manual, closed the dialog, and the page offered to add one: the parse was
  // running and nothing on the page would say so. A manual in an active stage
  // is the evidence, however the parse began. (The done/error pickup below
  // keeps its own gates — this widens only the live state.)
  const active = useMemo(
    () => Object.entries(byManual).find(([, s]) => ACTIVE_STAGES.includes(s.stage)),
    [byManual]
  )
  // Draft probe for every finished manual. Bounded: an item has a handful of
  // manuals at most, and committed ones return null immediately.
  const [draftsById, setDraftsById] = useState<Record<string, PreviewResult | null>>({})
  const doneIdsKey = Object.entries(byManual)
    .filter(([, s]) => s.stage === "done")
    .map(([id]) => id)
    .sort()
    .join(",")
  useEffect(() => {
    const ids = doneIdsKey ? doneIdsKey.split(",") : []
    let cancelled = false
    for (const id of ids) {
      readPreviewDraft(homeId, id)
        .then((d) => { if (!cancelled) setDraftsById((prev) => (prev[id] === d ? prev : { ...prev, [id]: d })) })
        .catch(() => { if (!cancelled) setDraftsById((prev) => ({ ...prev, [id]: null })) })
    }
    return () => { cancelled = true }
  }, [homeId, doneIdsKey])

  const pickup = useMemo(
    () =>
      Object.entries(byManual).find(
        ([id, s]) =>
          !dismissed[id] &&
          // Flag-based: the wizard handed off (done or error both surface).
          (((s.stage === "done" || s.stage === "error") && isParsePending(id)) ||
            // Data-based: a finished parse with an unreviewed draft, however it
            // was started. This is what the item-page attach path produces.
            (s.stage === "done" && !!draftsById[id]))
      ),
    [byManual, dismissed, draftsById]
  )

  // Look for a draft as soon as a finished parse is picked up. A manual that
  // committed has none (commitManualDraft clears it), so absence is the signal
  // that the tasks are already live.
  const pickupId = pickup?.[0] ?? null
  useEffect(() => {
    if (!pickupId) { setDraft(null); return }
    let cancelled = false
    readPreviewDraft(homeId, pickupId)
      .then((d) => {
        if (cancelled) return
        setDraft(d)
        // The handoff (HH-48). `d` non-null means nothing has been saved yet, so
        // this is the review-and-amend moment rather than a look at live tasks.
        // Requires the user's own involvement — either their wizard flagged this
        // parse, or we sat and watched it run — so a stale draft from some
        // earlier visit never ambushes them on arrival.
        const theirs = isParsePending(pickupId) || watchedRunning.current.has(pickupId)
        if (d && theirs && !autoOpened.has(pickupId)) {
          autoOpened.add(pickupId)
          setDraftOpen(true)
        }
      })
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
            {/* The page count is the one concrete thing we know mid-parse, and
                it turns an indefinite wait into a job with a size. */}
            Reading your manual{active[1].pages ? ` · ${active[1].pages} pages` : ""}
          </p>
          <p className="text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
            {STAGE_LINE[ui] ?? "Working…"} You can leave this page — we'll keep going.
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
