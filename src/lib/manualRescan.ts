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
import { isCapacityRefusal, queueScan } from "@/lib/scanCapacity"

type ManualRef = Pick<ManualDocument, "manual_id" | "item_unit_id">

/** Where a manual's review happens: its item page, which watches the read and opens the review. */
export function reviewPathFor(m: ManualRef): string {
  return `/items/${m.item_unit_id}`
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
  return reviewPathFor(m)
}
