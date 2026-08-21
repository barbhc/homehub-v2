/**
 * HH-86 — the item page read "LG DLGX3901B" with "LG · DLGX3901B" directly
 * under it.
 *
 * My own doing: #139 stopped requiring a name and composes a blank one as
 * "Brand Model", which is the right first name for an item — but the detail
 * header renders name AND "brand · model" as a pair on the assumption that the
 * name is something else ("Kitchen dryer"). For every item added since #139
 * the two lines are the same words twice.
 *
 * The subtitle's job is to add information. When it cannot, it should say
 * nothing — so the test is content, not provenance: a hand-typed name of
 * exactly "LG DLGX3901B" earns the same silence as a composed one.
 */

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

/** "Brand · Model" when that adds anything beyond the display name; else null. */
export function itemSubtitle(
  displayName: string | null | undefined,
  brand: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const parts = [brand, model].filter((x): x is string => !!x && !!x.trim())
  if (parts.length === 0) return null
  const subtitle = parts.join(" · ")
  const name = squash(displayName ?? "")
  // Every word of the subtitle already visible in the name → nothing to add.
  // Checked per part, not on the joined string, so "LG DLGX3901B dryer" (name
  // carrying MORE than brand+model) still suppresses the echo.
  if (name && parts.every((p) => name.includes(squash(p)))) return null
  return subtitle
}
