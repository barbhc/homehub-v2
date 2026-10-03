import { addMonths } from "../../shared/dates/calendar"

/**
 * Purchase date + coverage length → the date the warranty window closes.
 *
 * Extracted from the Smart Add purchase step so the item page's editor derives
 * the expiry the same way. Two places computing a warranty end date by hand is
 * how they drift, and a warranty that expires on a different day depending on
 * which screen entered it is worse than none.
 *
 * Calendar months, not 30-day blocks: a 24-month warranty bought on 14 Feb runs
 * to 14 Feb, which is what the receipt says. The months are added to the date's
 * own parts (shared/dates/calendar.ts): this used to build local midnight and
 * read it back as UTC, which east of Greenwich is the day before.
 */
export function warrantyExpiry(purchaseDate: string, months: number | null | undefined): string | null {
  if (!purchaseDate || months == null || months <= 0) return null
  const [y, m, d] = purchaseDate.trim().split("-").map(Number)
  // Whatever fits YYYY-MM-DD once padded; anything else (a 5-digit year, a
  // fraction) is not a date we can count from, and addMonths would throw.
  const width = [4, 2, 2]
  if (![y, m, d].every((n, i) => Number.isInteger(n) && n > 0 && String(n).length <= width[i])) return null
  const pad = (n: number, i: number) => String(n).padStart(width[i], "0")
  return addMonths(`${pad(y, 0)}-${pad(m, 1)}-${pad(d, 2)}`, months)
}
