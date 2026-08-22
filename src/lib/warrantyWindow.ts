/**
 * Purchase date + coverage length → the date the warranty window closes.
 *
 * Extracted from the Smart Add purchase step so the item page's editor derives
 * the expiry the same way. Two places computing a warranty end date by hand is
 * how they drift, and a warranty that expires on a different day depending on
 * which screen entered it is worse than none.
 *
 * Calendar months, not 30-day blocks: a 24-month warranty bought on 14 Feb runs
 * to 14 Feb, which is what the receipt says.
 */
export function warrantyExpiry(purchaseDate: string, months: number | null | undefined): string | null {
  if (!purchaseDate || months == null || months <= 0) return null
  const [y, m, d] = purchaseDate.trim().split("-").map(Number)
  if (!y || !m || !d) return null
  const expiry = new Date(y, m - 1, d)
  expiry.setMonth(expiry.getMonth() + months)
  return expiry.toISOString().split("T")[0]
}
