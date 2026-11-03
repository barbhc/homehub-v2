/**
 * Settings → Manuals: a rescan is a new READ, and a read ends in the review.
 *
 * Every rescan here ran in COMMIT mode — the worker read the manual and wrote
 * its tasks straight into the home, with no review — including for a manual
 * whose last read was sitting unsaved ("Read — not saved"), the one state
 * whose whole point is that the owner has not decided yet. That is the
 * "these items just appeared" bug the item page was cured of twice
 * (parseManualService's `mode` is required for exactly that reason).
 *
 * So a rescan from Settings is a PREVIEW, handed to the item page the same way
 * the add wizard hands off its first read: `markParsePending` tells the item
 * page this read is news, and its pickup watches it land and opens the review.
 * Nothing is saved until the owner saves the review.
 */
import type { ManualDocument } from "@/integrations/types"
import { parseManualAndWait, startParse } from "@/modules/knowledge/services/parseManualService"
import type { ParseManualResult } from "@/modules/knowledge/services/parseManualService"
import { markParsePending } from "@/lib/parsePickup"
import { requestReview } from "@/lib/reviewRequest"
import { isCapacityRefusal, queueScan } from "@/lib/scanCapacity"
import { isParseInFlightMessage } from "../../shared/parse/parseErrors"
import { isAwaitingReview, type ManualParseFacts } from "@/lib/manualReviewState"

type ManualRef = Pick<ManualDocument, "manual_id" | "item_unit_id">

/** Where a manual's review happens: its item page, which watches the read and opens the review. */
export function reviewPathFor(m: ManualRef): string {
  return `/items/${m.item_unit_id}`
}

/** A document attached as "Reference doc". The screen that attaches one says it
 *  won't generate upkeep, so no read of it may run the task parser.
 *
 *  Takes a nullable role although `ManualDocument.role` is not: this reads a
 *  stored field, and a document written before the role existed has none. Only
 *  an explicit "reference" is one — never the absence of an answer. */
export function isReferenceDoc(m: { role?: string | null }): boolean {
  return m.role === "reference"
}

/**
 * Which manuals a bulk rescan may read.
 *
 * "Rescan All" passed every manual, which broke two promises the rest of the
 * screen keeps (Codex review 2026-10-29, findings 3 and 5):
 *
 *  - A manual already "Read — not saved" has a draft waiting on a decision, and
 *    a new read replaces exactly that draft. This is why the ROW offers Review
 *    instead of Rescan, and why the rule at the top of this file and
 *    `docs/add-item-flow.md` both already said "a manual already 'Read — not
 *    saved' offers Review, not another read". The guard was on the row and
 *    missing from the button underneath it.
 *  - A reference document was attached on the promise that it won't generate
 *    upkeep. Rescan All ran the owner-manual parser over it anyway, and saving
 *    the review that came back created upkeep templates from a recipe book.
 *
 * Skipping is never silent: the caller says how many were left alone.
 */
export function rescanTargets<T extends { role?: string | null } & ManualParseFacts>(manuals: T[]): T[] {
  return manuals.filter((m) => !isReferenceDoc(m) && !isAwaitingReview(m))
}

export type RescanStart =
  | { ok: true; reviewPath: string }
  /** `queued`: refused for capacity (HH-124) — recorded to start itself later, not lost. */
  | { ok: false; error: string; queued: boolean }

/**
 * Start a fresh read that ends in the review, and say where to go to watch it.
 * Never awaited: the worker reads server-side and the item page picks it up.
 */
export async function startRescanForReview(homeId: string, m: ManualRef): Promise<RescanStart> {
  const started = await startParse(m.manual_id, { homeId, mode: "preview" })
  if (!started.ok) {
    // The manual is being read right now (the server refuses a second,
    // separately billed scan — Package C). That read is the thing to watch,
    // not a failure: hand off to it exactly as if this one had started.
    if (started.inFlight || isParseInFlightMessage(started.error)) {
      markParsePending(m.manual_id)
      return { ok: true, reviewPath: reviewPathFor(m) }
    }
    const queued = isCapacityRefusal(started.error)
    if (queued) queueScan(m.manual_id, m.item_unit_id, Date.now())
    return { ok: false, error: started.error, queued }
  }
  markParsePending(m.manual_id)
  return { ok: true, reviewPath: reviewPathFor(m) }
}

/**
 * For "Rescan all": read one manual and wait for it, so a long list goes one at
 * a time. A finished read is left for its review — flagged, so the item page
 * opens it — and never committed here.
 */
export async function rescanForReviewAndWait(homeId: string, m: ManualRef): Promise<ParseManualResult> {
  const result = await parseManualAndWait(m.manual_id, { homeId, mode: "preview" })
  if (result.ok) markParsePending(m.manual_id)
  return result
}

/**
 * A manual already read and waiting ("Read — not saved") needs its review, not
 * another read — reading it again would throw away the draft it has. Flags it
 * so the item page opens that review, and says where it is.
 */
export function openPendingReview(m: ManualRef): string {
  markParsePending(m.manual_id)
  // HH-161: the item page opens a review by itself only for a read it watched
  // finish; a read that finished elsewhere waits for a tap. This IS the tap —
  // Settings' Review — so it asks the page's hand-off to open it on arrival,
  // the same way the pill's Review does.
  requestReview(m.manual_id)
  return reviewPathFor(m)
}
