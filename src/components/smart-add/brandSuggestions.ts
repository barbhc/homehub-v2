/**
 * What BrandAutocomplete offers for a typed brand: COMMON_BRANDS, prefix
 * matches first, then contains. Its own module so BrandAutocomplete.tsx
 * exports only its component (react-refresh).
 */
import { COMMON_BRANDS } from "@/modules/inventory/constants/brands"

const MAX_SUGGESTIONS = 6

export function brandSuggestionsFor(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const contains: string[] = []
  for (const b of COMMON_BRANDS) {
    const lower = b.toLowerCase()
    // HH-75: this used to skip any brand whose LOWERCASED form equalled the
    // query — meant as "don't re-suggest what they already typed". But the
    // comparison ignores case while the suggestion's whole value is the case:
    // typing "lg" matched "LG" here and dropped it, so the list went empty at
    // the exact moment the brand was complete, and the tap that would have
    // fixed "lg" to "LG" disappeared with it. Instant for a two-letter brand.
    // Only an EXACT match — same characters, same case — is nothing to offer.
    if (b === query.trim()) continue
    if (lower.startsWith(q)) starts.push(b)
    else if (lower.includes(q)) contains.push(b)
  }
  return [...starts, ...contains].slice(0, MAX_SUGGESTIONS)
}
