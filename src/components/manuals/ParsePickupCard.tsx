import { useEffect, useMemo, useRef, useState } from "react"
import { CheckIcon, XIcon } from "lucide-react"
import {
  watchParse,
  toUiStage,
  ACTIVE_PARSE_STAGES,
  readPreviewDraft,
  commitReviewedDraft,
  type ParseStage,
} from "@/modules/knowledge/services/parseManualService"
import { draftMaintenanceCount, TaskReviewSheet } from "./TaskReviewSheet"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import { clearParsePending, isParsePending } from "@/lib/parsePickup"
import { SCAN_KEEPS_GOING_SHORT } from "@/lib/scanCopy"
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

/** Upkeep in a draft — what the review actually asks about. Cleaning jobs and
 *  per-use tips are saved without a question, so counting them here would
 *  promise a longer review than the sheet delivers. */
/** Everything the scan kept, for the "here is what we saved" line. */
function savedCount(draft: PreviewResult): number {
  return draft.tasks?.length ?? 0
}

// HH-127: this used to compute its own answer and disagreed with the sheet on
// setup tasks — see draftHasSchedulableMaintenance for what that cost.
function maintenanceCount(draft: PreviewResult): number {
  return draftMaintenanceCount(draft)
}

const STAGE_LINE: Record<string, string> = {
  uploading: "Starting…",
  queued: "Waiting for a scanning slot…",
  reading: "Scanning the document end to end…",
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
        // HH-121: "I'm not sure what this page is. It just popped up."
        //
        // Round 12 made focus="maintenance" the default, which was right — but
        // it also made the NO-MAINTENANCE branch the thing that auto-opens, and
        // that branch has nothing to decide. The owner got a full-height sheet
        // reading "Nothing here needs a reminder" over eleven rows, ninety-five
        // minutes after the scan, with nothing explaining its arrival.
        //
        // The rule: a sheet may interrupt for a DECISION, never for an
        // announcement. With no maintenance there is no decision, so the card
        // below says what happened and takes over nothing.
        if (d && theirs && maintenanceCount(d) > 0 && !autoOpened.has(pickupId)) {
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
    const pages = active[1].pages
    // HH-135 (design A). This was a bordered card holding an 11.5px paragraph
    // over three lines — "the text is quite small and I'm wondering if there's a
    // more delightful animation". A four-minute wait shown as a small static
    // block reads as nothing happening.
    //
    // So: one readable line saying what is happening, a 3px rail carrying the
    // motion, and the leave-is-safe promise cut to a single clause instead of a
    // sentence. The rail is indeterminate ON PURPOSE — we know the page count
    // but not how far through them Claude is, and a bar that implies progress
    // it cannot measure is the kind of small lie this product does not tell.
    //
    // PLACEMENT NOTE: design A drew this under the item name. It renders above
    // the page instead, because ParsePickupCard is mounted once for BOTH the
    // mobile and desktop trees (CSS hides one) — moving it into RefinedItemDetail
    // would mount it twice, and two mounts means two review sheets, which is
    // HH-120. Doing that properly means hoisting the parse watch out of this
    // component; it is not a copy-and-polish change.
    return (
      <div className="mb-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[14.5px] font-bold" style={{ color: "var(--hh-ink)" }}>
            Reading the manual
          </p>
          {pages ? (
            <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--hh-sub)" }}>
              {pages} pages
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--hh-sub)" }}>
          {STAGE_LINE[ui] ?? "Working…"} {SCAN_KEEPS_GOING_SHORT}
        </p>
        <div
          className="mt-2 h-[3px] w-full overflow-hidden rounded-full"
          style={{ background: "var(--hh-line)" }}
          role="progressbar"
          aria-label="Reading the manual"
        >
          <div className="hh-scanrail h-full rounded-full" style={{ background: "var(--hh-teal)" }} />
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

  // Did we sit and watch this scan run? That is the owner's own distinction
  // between "still in the flow" (a section of the page) and "came back later"
  // (a drawer over what you were already looking at).
  const inFlow = watchedRunning.current.has(manualId)

  // One review element, rendered in exactly one place — either as this card's
  // replacement (in flow) or as a drawer beside it (came back later). Building
  // it once is what makes "only ONE review is ever mounted" structural.
  const reviewSheet = draft ? (
    <TaskReviewSheet
      open={draftOpen}
      onOpenChange={setDraftOpen}
      itemName={itemName}
      previewData={draft}
      // The one review this flow asks for. Cleaning, setup and tips are
      // saved and shown on the page; only upkeep needs a decision here.
      focus="maintenance"
      // Round 11: in the flow it is a SECTION of the page; out of the flow
      // it is a drawer. `watchedRunning` already knows which — it holds the
      // manuals whose scan we sat and watched. Someone who stayed is still
      // in the flow and should not be handed something to dismiss; someone
      // who left and came back is already somewhere on this page, and
      // sliding the review over that genuinely IS a detour.
      presentation={inFlow ? "inline" : "sheet"}
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
  ) : null

  // HH-120. In-flow the review is a SECTION of the page, which is what the owner
  // asked for — but PR #167 rendered it INSIDE this card, a narrow horizontal
  // flex row, and the review is built for a full-width sheet. It collapsed to
  // one word per line and sat behind the drawer another caller had opened, so
  // two review surfaces were mounted at once.
  //
  // The card is REPLACED by it, never wrapped around it: same content, same
  // controls, the page's own width.
  if (draft && draftOpen && inFlow) {
    return (
      <div className="mb-4">
        {reviewSheet}
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
        {/* Counted from the draft, not from the parse summary: the summary
            counts everything the manual yielded, and this card is about the
            only part that needs a decision. */}
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--hh-ink)" }}>
          {draft
            ? maintenanceCount(draft) > 0
              ? `${maintenanceCount(draft)} maintenance ${maintenanceCount(draft) === 1 ? "task" : "tasks"} to review`
              // HH-121: say what HAPPENED, and name the thing it happened to.
              // "Manual read" on its own is a status, not an explanation.
              : `We finished reading the ${itemName} manual`
            : `Manual read${state.tasks != null ? ` — ${state.tasks} suggested ${state.tasks === 1 ? "task" : "tasks"}` : ""}`}
        </p>
        <p className="text-[11.5px]" style={{ color: "var(--hh-sub)" }}>
          {draft
            ? maintenanceCount(draft) > 0
              ? "Set how often each repeats and whether it reminds you. Nothing is scheduled until you say so."
              // HH-134: this said "We saved N …" about an UNCOMMITTED draft.
              // runParse writes previewDraft only; commitDraft is what saves.
              // So the card was reporting work that had not happened, next to
              // the button that does it.
              : `Nothing in it needs a reminder. ${savedCount(draft)} ${savedCount(draft) === 1 ? "guide" : "guides, setup steps and tips"} are ready to keep.`
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
          {/* HH-134: "Review & schedule" over a card that just said nothing
              needs a reminder was the invitation half of the contradiction.
              With nothing to schedule the offer is to LOOK, and the sheet
              behind it is where saving happens. */}
          {maintenanceCount(draft) > 0 ? "Review & schedule" : "See what we found"}
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
      {reviewSheet}


    </div>
  )
}
