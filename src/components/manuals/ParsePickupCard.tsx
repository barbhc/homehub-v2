import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckIcon, XIcon } from "lucide-react"
import { readPreviewDraft, commitReviewedDraft } from "@/modules/knowledge/services/parseManualService"
import { startRescanForReview } from "@/lib/manualRescan"
import { capacityNotice } from "@/lib/scanCapacity"
import { TaskReviewSheet } from "./TaskReviewSheet"
import { draftReviewCounts } from "./reviewRows"
import { recordParseFeedback } from "@/modules/knowledge/services/parseFeedbackService"
import type { PreviewChunk, PreviewResult, PreviewTask } from "@/modules/knowledge/types/previewTypes"
import type { ReviewEditSummary } from "./TaskReviewFeedback"
import type { ManualDocument } from "@/integrations/types"
import { clearParsePending, isParsePending } from "@/lib/parsePickup"
import { isAwaitingReview } from "@/lib/manualReviewState"
import { onReviewRequest, pendingReviewFor, takeReviewRequest } from "@/lib/reviewRequest"
import { useNotificationsBlocked } from "@/hooks/useNotificationsBlocked"
import { useHomeProfile } from "@/modules/home"
import { settingsPane } from "@/lib/settingsPaths"
import { InlineError } from "@/components/layout/LoadStates"
import { LOAD_TIMEOUT_MS, withTimeout } from "@/lib/withTimeout"
import { getTaskTemplatesByItem } from "@/modules/care/services/taskService"
import { libraryKeyOf } from "@/modules/care/services/careSuggestionService"
import type { TypicalChoiceEntry, TypicalTask } from "../../../shared/care/manualReplaces"

/**
 * Reads whose review we have already opened by ourselves, this session, keyed
 * by manual AND run — a later read of the same manual is news of its own.
 *
 * Module-level rather than component state because the item page remounts on
 * every navigation, and "we opened this for you once" must survive that — a
 * sheet that reappears every time the user returns to the item is an ambush,
 * not a handoff. Cleared only by a reload, which is a cheap enough reset.
 */
const autoOpened = new Set<string>()

/** The button's words: what the review will ask about (HH-161 S2.1, S3.1). */
function reviewLabel(counts: { total: number; maintenance: number }): string {
  if (counts.maintenance > 0) return `Review ${counts.maintenance} upkeep ${counts.maintenance === 1 ? "task" : "tasks"}`
  if (counts.total === 1) return "Review 1 tip or step"
  if (counts.total > 1) return `Review ${counts.total} tips & steps`
  return "Review what we found"
}

/**
 * The item page's hand-off: a finished read, delivered to the review.
 *
 * HH-161 gave this card back its one job. It used to be three things — a
 * reading band pinned ABOVE the page (above "‹ Items"), round 14's separate
 * no-maintenance card ("No maintenance in this manual, so nothing will remind
 * you"), and this hand-off — each with its own watch on the manual. The read
 * now lives in the Upkeep card and the pill; the no-maintenance card is gone
 * (one review serves both cases, round 18); what is left is ONE card, between
 * the name and Upkeep, saying the manual was read and offering its review.
 *
 * It reads the page's LIVE manuals (useItemManuals), through the one
 * definition of "waiting for review" (lib/manualReviewState), and keeps no
 * watch of its own.
 *
 * It opens the review by itself only when this page WATCHED the read finish
 * (HH-48) — once per read, per session, with or without maintenance (S2.4,
 * S3.3). A read that finished while nobody was looking waits for a tap: here,
 * or the pill's Review, which asks this card to open it in place.
 *
 * Exactly one review element, rendered in one place: in place of the card when
 * it opened itself (the page's own next section — round 11), or as a drawer
 * beside it when someone tapped Review. Nothing is saved before Save (HH-134).
 */
export function ParsePickupCard({
  homeId,
  itemUnitId,
  itemName,
  itemCategory,
  itemBrand,
  itemModel,
  manuals,
  watched,
  onReviewSaved,
}: {
  homeId: string
  itemUnitId: string
  /** D4: what the item is, for the care library's usual filter intervals.
   *  Primitives, so the review's rows are not rebuilt on every render. */
  itemCategory?: string | null
  itemBrand?: string | null
  itemModel?: string | null
  itemName: string
  /** The item's live manual docs (useItemManuals). */
  manuals: ManualDocument[]
  /** Manuals whose current read this page watched run (useItemManuals). */
  watched: ReadonlySet<string>
  onReviewSaved: () => void
}) {
  // Freeze-prep is suppressed before the review rather than at save.
  const { profile } = useHomeProfile(homeId)
  const freezeRiskFalse = profile?.freeze_risk === false
  // D4: the home's CHOSEN level only. A home that never picked one passes
  // nothing, and its review is exactly the one it always had.
  const taskLevel = profile?.task_level ?? undefined
  const careItem = useMemo(
    () => ({ display_name: itemName, category: itemCategory ?? null, brand: itemBrand ?? null, model: itemModel ?? null }),
    [itemName, itemCategory, itemBrand, itemModel],
  )
  const navigate = useNavigate()
  const notificationsBlocked = useNotificationsBlocked()
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const [loaded, setLoaded] = useState<{ key: string; draft: PreviewResult } | null>(null)
  /** PR D: the item's typical (care library) tasks, read beside the draft and
   *  keyed like it. Never waited for: the review opens on the draft alone, and
   *  its Replace questions appear when this arrives. */
  const [typical, setTypical] = useState<{ key: string; tasks: TypicalTask[] } | null>(null)
  const [open, setOpen] = useState<"inline" | "sheet" | null>(null)
  const [saving, setSaving] = useState(false)
  /** Runs saved here. The save's answer can beat the listener's news of it by
   *  a moment; without this the card would flash back for that moment. */
  const [savedRuns, setSavedRuns] = useState<ReadonlySet<string>>(new Set())
  /**
   * Bumped by Try again, and when a door asks for a review whose draft is not
   * on hand: the pickup below is re-chosen AND its draft is read again. (It
   * used to re-render only — the read did not depend on it, so a Review asked
   * for after a failed read did nothing at all. Codex review F1.)
   */
  const [attempt, setAttempt] = useState(0)
  /** The draft read that came back with nothing to show: it failed, or the
   *  manual had no draft. Keyed like `loaded`, so a new read starts clean. */
  const [unread, setUnread] = useState<{ key: string; why: "failed" | "no-draft" } | null>(null)

  // What the callbacks below read. They run outside render (a draft arriving,
  // a door asking), so they read the latest values through refs.
  const watchedRef = useRef(watched)
  const openRef = useRef(open)
  useEffect(() => { watchedRef.current = watched; openRef.current = open })
  /** The run whose draft is on hand. */
  const loadedRef = useRef<{ manualId: string; runKey: string } | null>(null)

  /**
   * Open the review for a run whose draft is here: a door's request opens it in
   * place, as a drawer over the page (S2.3); a read this page watched finish
   * opens it by itself, once, as the page's next section (HH-48, S2.4/S3.3).
   * Either way at most one review is open — a request while one is open is
   * simply spent.
   */
  const openIfDue = useCallback((manualId: string, runKey: string) => {
    const asked = takeReviewRequest(manualId)
    if (openRef.current) return
    if (asked) {
      setDismissed((prev) => ({ ...prev, [manualId]: false }))
      setOpen("sheet")
    } else if (watchedRef.current.has(manualId) && !autoOpened.has(runKey)) {
      autoOpened.add(runKey)
      setOpen("inline")
    }
  }, [])

  useEffect(() => onReviewRequest((manualId) => {
    const here = loadedRef.current
    // The draft is already on hand: open it now. Otherwise choose the pickup
    // again — the asked-for manual wins — and its draft's arrival opens it.
    if (here && here.manualId === manualId) openIfDue(manualId, here.runKey)
    else setAttempt((n) => n + 1)
  }), [openIfDue])

  const awaiting = manuals.filter((m) => isAwaitingReview(m) && !savedRuns.has(`${m.manual_id}:${m.parse_request_id ?? ""}`))
  // A review someone asked for wins, even over a card they dismissed; otherwise
  // the first read waiting that has not been waved away. (Read at render: a
  // request bumps `asked`, which is what renders this again.)
  const requested = pendingReviewFor()
  const pickup =
    awaiting.find((m) => m.manual_id === requested) ??
    awaiting.find((m) => !dismissed[m.manual_id]) ??
    null
  /** One read of one manual — a new read (new requestId) is a new hand-off. */
  const runKey = pickup ? `${pickup.manual_id}:${pickup.parse_request_id ?? ""}` : null
  const draftKey = pickup ? `${runKey}:${pickup.parse_stage_at ?? ""}` : null

  const pickupId = pickup?.manual_id ?? null
  useEffect(() => {
    if (!pickupId || !draftKey || !runKey) return
    let cancelled = false
    // PR D: the typical (care library) tasks already on this item. Optional by
    // nature and never waited for: if this read is slow or fails, the review
    // still opens and saves — it just asks nothing, and the server behaves as
    // before. (Blocking the draft on it held the review back for the whole
    // timeout wherever Firestore did not answer — CI caught it.)
    void withTimeout(
      getTaskTemplatesByItem(homeId, itemUnitId), LOAD_TIMEOUT_MS, "Reading the item's tasks timed out.",
    ).then(
      (res) => {
        if (res.error || !res.data) {
          console.warn(`[pickup] could not read the tasks of item ${itemUnitId} (home ${homeId}); the review will not offer Replace:`, res.error?.message)
          return []
        }
        return res.data.flatMap((t) => {
          const libraryKey = libraryKeyOf(t)
          return libraryKey ? [{ templateId: t.task_template_id, title: t.title, libraryKey }] : []
        })
      },
      (e: unknown) => {
        console.warn(`[pickup] could not read the tasks of item ${itemUnitId} (home ${homeId}); the review will not offer Replace:`, e instanceof Error ? e.message : e)
        return []
      },
    ).then((tasks) => { if (!cancelled) setTypical({ key: draftKey, tasks }) })
    // Timed: a read that never answers is a failed read, with its Try again.
    withTimeout(readPreviewDraft(homeId, pickupId), LOAD_TIMEOUT_MS, "Reading the draft timed out.").then(
      (d) => {
        if (cancelled) return
        if (!d) {
          // The manual says a review is waiting and has no draft: usually it
          // was saved a moment ago and the news has not reached this page yet.
          setUnread({ key: draftKey, why: "no-draft" })
          return
        }
        setUnread(null)
        setLoaded({ key: draftKey, draft: d })
        loadedRef.current = { manualId: pickupId, runKey }
        openIfDue(pickupId, runKey)
      },
      (e: unknown) => {
        if (cancelled) return
        console.warn(`[pickup] could not read the draft of manual ${pickupId} (home ${homeId}):`, e instanceof Error ? e.message : e)
        // Said where the card would be (Codex review F1): the card used to
        // just not appear, under a pill still offering "Review".
        setUnread({ key: draftKey, why: "failed" })
      },
    )
    return () => { cancelled = true }
  }, [homeId, itemUnitId, pickupId, draftKey, runKey, openIfDue, attempt])

  const draft = loaded && loaded.key === draftKey ? loaded.draft : null
  const typicalTasks = typical && typical.key === draftKey ? typical.tasks : undefined
  // A failed read is always said. "No draft" is said only when someone asked
  // for this review — otherwise it is the quiet moment after a save elsewhere,
  // and the card is about to go anyway.
  const readFailed =
    !draft && pickup !== null && unread?.key === draftKey &&
    (unread.why === "failed" || requested === pickup.manual_id)

  const dismiss = (manualId: string) => {
    clearParsePending(manualId)
    setDismissed((prev) => ({ ...prev, [manualId]: true }))
  }

  // A read that failed, which this page watched or the add wizard handed over.
  // (One that failed weeks ago, on a visit nobody is waiting on, stays quiet —
  // the manual row can still start it again.)
  const failed = manuals.find((m) =>
    m.parse_stage === "error" && !dismissed[m.manual_id] && (watched.has(m.manual_id) || isParsePending(m.manual_id)))

  if (readFailed) {
    return (
      <div
        data-testid="handoff-load-error"
        className="rounded-xl border px-4 py-2"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        <InlineError onRetry={() => { setUnread(null); setAttempt((n) => n + 1) }}>Couldn&apos;t load what we found.</InlineError>
      </div>
    )
  }

  if (!pickup || !draft) {
    if (!failed) return null
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-4 py-3"
        style={{ borderColor: "var(--hh-line)", background: "var(--hh-surface)" }}
      >
        <p className="min-w-0 flex-1 text-[0.8125rem]" style={{ color: "var(--hh-clay)" }}>
          We couldn&apos;t finish reading the manual. You can try again from Manuals &amp; References.
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => dismiss(failed.manual_id)}
          className="shrink-0 rounded-full p-1"
          style={{ color: "var(--hh-sub)" }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    )
  }

  const manualId = pickup.manual_id
  const counts = draftReviewCounts(draft, freezeRiskFalse, { taskLevel, item: careItem })

  // The one review element, built once and rendered in exactly one place —
  // which is what makes "only ONE review is ever mounted" structural.
  const reviewSheet = (
    <TaskReviewSheet
      freezeRiskFalse={freezeRiskFalse}
      taskLevel={taskLevel}
      careItem={careItem}
      onChangeTaskLevel={() => navigate(settingsPane("task-level"))}
      notificationsBlocked={notificationsBlocked}
      open={open !== null}
      onOpenChange={(o) => { if (!o) setOpen(null) }}
      itemName={itemName}
      previewData={draft}
      typicalTasks={typicalTasks}
      focus="maintenance"
      // Round 11: in the flow it is a SECTION of the page; out of the flow it
      // is a drawer. Someone who stayed and watched is still in the flow and
      // should not be handed something to dismiss; someone who tapped Review
      // is already somewhere on this page, and sliding it over that IS a detour.
      presentation={open === "inline" ? "inline" : "sheet"}
      saving={saving}
      onSave={async (tasks: PreviewTask[], chunks: PreviewChunk[], edits: ReviewEditSummary, typicalChoices: TypicalChoiceEntry[]) => {
        setSaving(true)
        const res = await commitReviewedDraft(homeId, manualId, chunks, tasks, draft.draftRequestId, typicalChoices)
        setSaving(false)
        if (!res.ok) return res.error
        // Corrections made in a fresh read's review are parser feedback too —
        // recorded on save, not only when someone files a complaint (PR #25).
        if (edits.total > 0) {
          void recordParseFeedback(homeId, {
            manualId,
            itemUnitId,
            source: "review_save",
            reasons: [],
            note: "",
            edits,
            rescanRequested: false,
          })
        }
        setSavedRuns((prev) => new Set(prev).add(`${manualId}:${pickup.parse_request_id ?? ""}`))
        setOpen(null)
        clearParsePending(manualId)
        onReviewSaved()
        return null
      }}
      // The one review that HAS a manual behind it, so the one that can offer
      // Re-scan. The existing-task review (ReviewItemTasksButton) passes
      // nothing and therefore draws no button, instead of drawing an inert one.
      onRescan={async () => {
        const started = await startRescanForReview(homeId, { manual_id: manualId, item_unit_id: itemUnitId })
        if (started.ok) {
          // The draft on screen is about to be replaced, so the review it was
          // opened on closes with it. (Saving it afterwards would be refused
          // server-side as superseded, which is correct but is not a thing to
          // make someone discover.)
          setOpen(null)
          return { ok: true }
        }
        // Refused for capacity is queued work, not a failure: the server parked
        // it and the sweep starts it. Say so, and close — there is nothing for
        // the user to do differently.
        if (started.queued) {
          const notice = capacityNotice(started.error)
          setOpen(null)
          return { ok: true, message: `${notice.title} — ${notice.eta.toLowerCase()}.` }
        }
        return { ok: false, message: started.error }
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
  )

  // HH-120. In flow the review REPLACES the card — never rendered inside it, a
  // narrow row built for one line, where it collapsed to a word per line.
  if (open === "inline") return <div>{reviewSheet}</div>

  // A card someone waved away stays away, unless a door asked for its review.
  if (dismissed[manualId] && open === null) return null

  return (
    /* HH-143: the action row drops below the sentence until the CARD (not the
       viewport — the card sits in narrower parents) has room for both. The
       threshold was measured, not picked: see e2e/emu/notice-fit.spec.ts. */
    <div
      data-testid="handoff-card"
      className="@container rounded-xl border px-4 py-3"
      style={{ borderColor: "var(--hh-teal)", background: "var(--hh-surface)" }}
    >
      <div className="flex flex-col gap-2.5 @min-[30rem]:flex-row @min-[30rem]:items-center @min-[30rem]:gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: "color-mix(in srgb, var(--hh-teal) 15%, transparent)" }}
          >
            <CheckIcon className="size-3.5" style={{ color: "var(--hh-teal)" }} />
          </span>
          {/* Says what happened. The same words with or without maintenance:
              round 18 retired the card that explained an absence. It does not
              name the item: the card sits under the item's own name, and "We
              read the Bosch dishwasher manual" beneath "Bosch dishwasher" said
              it twice (owner, #228 review). The pill's tray, which has no
              heading, is where rows name their item. */}
          <p className="min-w-0 flex-1 text-[0.84375rem] font-semibold" style={{ color: "var(--hh-ink)" }}>
            We read the manual
          </p>
        </div>
        {/* Action and dismiss travel together: on one row they sit where they
            always did; stacked, the action leads and the dismiss sits far right. */}
        <div className="flex items-center justify-between gap-3 @min-[30rem]:shrink-0 @min-[30rem]:justify-start">
          <button
            type="button"
            onClick={() => setOpen("sheet")}
            className="hit-44 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[0.75rem] font-bold"
            style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}
          >
            {reviewLabel(counts)}
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismiss(manualId)}
            className="hit-44 shrink-0 rounded-full p-1"
            style={{ color: "var(--hh-sub)" }}
          >
            <XIcon className="size-4" />
          </button>
        </div>
      </div>
      {reviewSheet}
    </div>
  )
}
