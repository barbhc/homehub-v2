/**
 * Whether an item still owes the purchase-details nudge.
 *
 * The nudge appears on the item page while the manual is being read — the one
 * stretch where the user has nothing else to do — and says what the data buys
 * them: the warranty window. Dismissing it is not deleting it: the same fields
 * live on in the Details & records section, which is where anyone who changes
 * their mind goes anyway.
 *
 * localStorage, not Firestore, and per item: this is one person's "not now" on
 * one device, not a fact about the home worth syncing to everyone in it.
 */

const KEY_PREFIX = "hh-purchase-nudge-dismissed:"

export function dismissPurchaseNudge(itemUnitId: string): void {
  try {
    localStorage.setItem(KEY_PREFIX + itemUnitId, String(Date.now()))
  } catch {
    // Storage full/blocked → the nudge reappears next visit. Annoying, never broken.
  }
}

export function isPurchaseNudgeDismissed(itemUnitId: string): boolean {
  try {
    return localStorage.getItem(KEY_PREFIX + itemUnitId) !== null
  } catch {
    return false
  }
}

/**
 * Does this item still have something to gain from the nudge?
 *
 * An item that already carries a purchase date has nothing to be asked for, so
 * the nudge never shows — asking for what we already have is the fastest way to
 * teach someone to ignore a card.
 */
export function shouldOfferPurchaseNudge(
  itemUnitId: string,
  purchaseDate: string | null | undefined,
): boolean {
  if (purchaseDate) return false
  return !isPurchaseNudgeDismissed(itemUnitId)
}
