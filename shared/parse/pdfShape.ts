/**
 * How much document is actually in this PDF.
 *
 * A tester meant to download an owner's manual and got only its cover page.
 * We accepted the one-page file, said nothing, and produced three plausible
 * air-fryer tasks — which he correctly identified as generic advice rather
 * than anything the manual said, filed under a heading that reads "From your
 * manual". Presenting inferred care as manual-derived is the exact
 * "never assert what we haven't verified" failure, and the user had no signal
 * that anything was wrong.
 *
 * Page counting from raw bytes is BEST-EFFORT and returns null when it cannot
 * be sure — a PDF whose page tree lives in a compressed object stream is not
 * readable this way. Null means "don't claim anything", never "thin": a false
 * warning on a real manual would teach people to ignore the warning.
 */

/** Pages beyond which a document is clearly a real manual, not a cover sheet. */
export const THIN_PAGE_MAX = 2

/**
 * Best-effort page count. Two independent signals, agreeing or nothing:
 *  - `/Type /Page` object headers (excluding `/Pages`, the tree node)
 *  - the page tree's `/Count N`
 */
export function countPdfPages(bytes: Uint8Array): number | null {
  // Latin-1 view: PDF structure is ASCII even when streams are binary.
  let text = ""
  const CHUNK = 8192
  for (let i = 0; i < bytes.length; i += CHUNK) {
    text += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }

  // `/Type /Page` but NOT `/Type /Pages` — the trailing char must not be 's'.
  const typeMatches = text.match(/\/Type\s*\/Page(?![s])/g)
  const byType = typeMatches ? typeMatches.length : 0

  // The page tree root carries the authoritative total; take the largest.
  const countMatches = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]))
  const byCount = countMatches.length ? Math.max(...countMatches) : 0

  if (byType > 0 && byCount > 0) return Math.max(byType, byCount)
  if (byType > 0) return byType
  if (byCount > 0) return byCount
  return null // compressed page tree — unknown, and we say so
}

/** True only when we COUNTED the pages and there are few of them. */
export function isThinManual(pages: number | null | undefined): boolean {
  return typeof pages === "number" && pages > 0 && pages <= THIN_PAGE_MAX
}

/** The sentence shown to the user. Describes what we saw and what it usually
 *  means, and stops short of claiming the tasks are wrong — some of them may be
 *  fine, and the user is the one who can tell. */
export function thinManualWarning(pages: number): string {
  return `This PDF is only ${pages} page${pages === 1 ? "" : "s"} — usually a cover or summary sheet rather than the full manual. Anything below is general guidance for this kind of appliance, not something we read in your manual. Check it before saving, or add the full PDF instead.`
}
