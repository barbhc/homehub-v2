/**
 * What we say while a manual is being scanned.
 *
 * HH-116 and HH-117 are the same report a screen apart: "there isn't any exit
 * button that essentially says that the user can leave and this process will
 * continue", then "if they wanted to leave this page and either add another
 * item or navigate somewhere else or close this app out completely, this
 * process will continue."
 *
 * The hand-off is the core promise of this flow. It was written on the item
 * page — one screen AFTER the moment someone is watching a spinner and deciding
 * whether they are stuck — and nowhere else. It now has ONE source, used on
 * every surface that shows a running scan, so the promise cannot drift or go
 * missing from the screen that needs it most.
 *
 * The three exits are named in the owner's own words, because a vaguer version
 * ("you can leave this page") is the weakest of the three and reassures least.
 */

/** The full sentence. Use wherever a scan is visibly running. */
export const SCAN_KEEPS_GOING =
  "You can leave this page, add another item, or close the app — it keeps going and we'll tell you when it's ready."

/** The short form, for a tray or a strip with no room for the full sentence. */
export const SCAN_KEEPS_GOING_SHORT = "You can close the app — these keep going."

/**
 * The vocabulary rule, kept next to the copy it governs.
 *
 * The app SCANS a manual. Never "parse" (developer jargon) and never "read"
 * (which suggests we are opening the document for the user to read themselves).
 * Round 11 swept for these and missed `${n} manual${s} parsing` because the
 * sweep matched double-quoted strings and that one is a template literal —
 * which is exactly why the check now lives in a test rather than in a habit.
 */
export const BANNED_SCAN_WORDS = ["parsing", "parse", "analyz", "analys"] as const

/** "6 of 24" when we know, "starting…" when we don't. Never a fake percentage. */
export function scanProgressLabel(page: number | null, total: number | null): string {
  if (total == null || total <= 0) return "starting…"
  if (page == null || page <= 0) return `${total} pages`
  return `page ${Math.min(page, total)} of ${total}`
}
