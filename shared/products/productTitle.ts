/**
 * Turning a web search result into a product NAME.
 *
 * Reported: items landing in the inventory called things like "Amazon.com:
 * Ninja DZ201 ...". The identity resolver takes the best Brave result's title
 * verbatim, and a retailer listing title is not a product name — it is a
 * retailer's SEO string, complete with the store's own branding.
 *
 * Lives in `shared/` rather than in the function so it can be unit-tested from
 * the app's test runner (which only includes `src/**`), the same arrangement as
 * `specKeys.ts`.
 */

/** Hosts whose page titles describe a LISTING, not a product. Not exhaustive by
 *  design — an unknown retailer simply gets the same title cleanup everything
 *  else gets, which is the safe direction to be wrong in. */
const RETAILER_HOSTS = [
  "amazon.", "walmart.", "target.", "bestbuy.", "homedepot.", "lowes.",
  "costco.", "ebay.", "wayfair.", "overstock.", "newegg.", "sears.",
  "acehardware.", "menards.", "samsclub.", "bedbathandbeyond.", "qvc.",
  "aliexpress.", "etsy.", "temu.", "kohls.", "macys.",
]

export function isRetailerHost(hostOrUrl: string | null | undefined): boolean {
  if (!hostOrUrl) return false
  const h = hostOrUrl.toLowerCase()
  return RETAILER_HOSTS.some((r) => h.includes(r))
}

/** Best-effort host from a URL. Never throws — a malformed URL is just unknown. */
export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Strip site chrome from a result title:
 *   "Amazon.com: Ninja DZ201 Foodi 6-in-1"  → "Ninja DZ201 Foodi 6-in-1"
 *   "Ninja DZ201 Air Fryer | Best Buy"      → "Ninja DZ201 Air Fryer"
 *   "Ninja DZ201 Air Fryer - Walmart.com"   → "Ninja DZ201 Air Fryer"
 * A spaced-dash suffix is only stripped when the tail looks like site chrome
 * (short, no digits) — never touch dashes inside model numbers ("AP-1512HH").
 */
export function cleanProductTitle(title: string): string {
  let t = title.split("|")[0].trim()

  // Leading "Store:" / "Store.com:" prefix — the Amazon case. Only stripped when
  // the prefix is RECOGNISABLY a store: a known retailer, or something shaped
  // like a domain. Stripping any short leading segment would eat real titles
  // ("Air Fryer: The Complete Guide" → "The Complete Guide").
  const lead = t.match(/^([A-Za-z0-9.\- ]{2,20}):\s+(\S.*)$/)
  if (lead && (isRetailerHost(lead[1]) || /\.[a-z]{2,}$/i.test(lead[1].trim()))) {
    t = lead[2].trim()
  }

  const m = t.match(/^(.*\S)\s+[-–]\s+([^-–]{2,30})$/)
  if (m && !/\d/.test(m[2])) t = m[1].trim()

  // Listing-page furniture that survives the rules above because it trails the
  // model rather than a dash: "… WM4000HWA + Reviews".
  t = t.replace(/\s*[+·]\s*(reviews?|ratings?|specs?)\s*$/i, "").trim()

  return t.slice(0, 120)
}

/**
 * What to actually call the item.
 *
 * A search-result title is written to sell, not to name: "LEVOIT Core 300
 * Purifier with Replacement Filter - HEPA Air Cleaner Eliminates Allergens for
 * Bedroom, Pets, Smokers In 1". Taken verbatim that becomes the heading on the
 * item page and the label in every list.
 *
 * So: a SHORT cleaned title is a real product name and worth keeping — "Dyson
 * Airwrap Multi-Styler" is more recognizable than "Dyson HS05". Past that it is
 * marketing copy, and brand + model is what the owner would call it anyway.
 */
export const MAX_TITLE_NAME = 60

export function productDisplayName(title: string, brand: string, model: string): string {
  const cleaned = cleanProductTitle(title)
  const composed = `${brand.trim()} ${model.trim()}`.trim()
  if (!cleaned) return composed
  if (cleaned.length > MAX_TITLE_NAME && composed) return composed
  return cleaned
}
