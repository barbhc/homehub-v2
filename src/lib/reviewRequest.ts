/**
 * "Open the review for this manual" — asked by a door that is not the item
 * page (the tray pill's Review, the manual row's Review), answered by the item
 * page's hand-off card, which owns the one review element (HH-120, HH-161).
 *
 * The pill lives in the app shell, outside the item page, so it cannot open the
 * page's review itself — and navigating to the page it is already on did
 * nothing at all (HH-161: the pill's Review sent you to /inventory/:id). A
 * request is held until the hand-off card for that manual takes it: at once
 * when the card is already on screen (review opens IN PLACE, no navigation),
 * or when the item page mounts after the pill navigated there.
 *
 * A request expires, so one the page never took (the draft was saved from
 * another device meanwhile) cannot pop a review open on some later visit.
 */

const TTL_MS = 60_000

let pending: { manualId: string; at: number } | null = null
const listeners = new Set<(manualId: string) => void>()

/** Ask for this manual's review to open. */
export function requestReview(manualId: string, now: number = Date.now()): void {
  pending = { manualId, at: now }
  for (const l of listeners) l(manualId)
}

/** Which manual's review has been asked for and not yet opened, if any. */
export function pendingReviewFor(now: number = Date.now()): string | null {
  return pending && now - pending.at <= TTL_MS ? pending.manualId : null
}

/** Take the pending request for this manual, if there is a live one. Taking it
 *  clears it, so one tap opens one review. */
export function takeReviewRequest(manualId: string, now: number = Date.now()): boolean {
  if (!pending || pending.manualId !== manualId) return false
  const live = now - pending.at <= TTL_MS
  pending = null
  return live
}

/** Hear requests as they are made. Returns the unsubscribe. */
export function onReviewRequest(listener: (manualId: string) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
