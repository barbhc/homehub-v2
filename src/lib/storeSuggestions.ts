/**
 * "Where you bought it" — suggestions that normalise what gets stored.
 *
 * Round 11 (owner): "For Where you bought it, prefill with previously entered
 * stores or sites to normalize entries."
 *
 * The problem being solved is one home accumulating "home depot", "Home Depot"
 * and "HomeDepot" as three different retailers, which makes the field useless
 * for anything later — grouping a warranty view by store, or answering "what
 * did I buy at Costco". Offering what they typed last time is what prevents it.
 *
 * Two sources, merged:
 *  - what THIS home has already entered, ranked by how often
 *  - a small curated seed, so the very first item gets help too
 *
 * The seed lives in the repo and is reviewed like code (same call the owner
 * made for the brand registry). It is US-leaning and deliberately short: a long
 * list of retailers nobody uses is noise, and anything missing is one tap away
 * because the raw text is ALWAYS offered as the last option. Suggesting is not
 * deciding.
 */

/** Curated seed — common US retailers for home items. Extend in a PR. */
export const SEED_STORES: readonly string[] = [
  "Amazon",
  "Best Buy",
  "Costco",
  "Home Depot",
  "Lowe's",
  "Target",
  "Walmart",
  "Wayfair",
  "IKEA",
  "Ace Hardware",
  "Sears",
  "AJ Madison",
  "Abt",
  "P.C. Richard & Son",
  "The Appliance Store",
  "Facebook Marketplace",
  "Craigslist",
  "eBay",
  "Directly from the manufacturer",
  "Came with the house",
]

/** Case- and punctuation-insensitive, so "Home Depot" === "homedepot". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export interface StoreSuggestion {
  /** The value that gets saved. */
  value: string
  /** How many items in this home already use it. 0 for seed-only entries. */
  uses: number
  /** True when this row saves exactly what the user typed, unchanged. */
  isRaw?: boolean
}

/**
 * Collapse a home's `store_name` column into ranked, de-duplicated entries.
 *
 * The FIRST spelling a home used wins as the canonical display, because that is
 * the one they will recognise; later variants only add to its count. Sorting is
 * by use count, then alphabetical, so the answer is stable rather than
 * shuffling as counts tie.
 */
export function collapseStores(raw: readonly (string | null | undefined)[]): StoreSuggestion[] {
  const byKey = new Map<string, StoreSuggestion>()
  for (const entry of raw) {
    const value = (entry ?? "").trim()
    if (!value) continue
    const key = squash(value)
    if (!key) continue
    const found = byKey.get(key)
    if (found) found.uses += 1
    else byKey.set(key, { value, uses: 1 })
  }
  return [...byKey.values()].sort((a, b) => b.uses - a.uses || a.value.localeCompare(b.value))
}

export interface SuggestStoresInput {
  /** What is in the field right now. */
  query: string
  /** Every `store_name` on this home's items, in any order. */
  homeEntries: readonly (string | null | undefined)[]
  /** Override the curated list — tests, and future locales. */
  seed?: readonly string[]
  /** Rows to show before the always-present raw option. */
  limit?: number
}

/**
 * What to show under the field.
 *
 * With an empty query this is the home's own history (most used first), so the
 * second appliance offers the store the first one came from. As they type it
 * narrows by prefix first, then by substring — "dep" should still find Home
 * Depot, but "Home" should not rank "Facebook Marketplace" above it.
 *
 * The final row is always the raw text, EXCEPT when it already matches a
 * suggestion exactly — offering "Use Home Depot as typed" directly beneath
 * "Home Depot" is noise.
 */
export function suggestStores({
  query,
  homeEntries,
  seed = SEED_STORES,
  limit = 6,
}: SuggestStoresInput): StoreSuggestion[] {
  const typed = query.trim()
  const home = collapseStores(homeEntries)
  const known = new Set(home.map((h) => squash(h.value)))

  // Seed entries the home has never used, appended after real history.
  const fromSeed: StoreSuggestion[] = seed
    .filter((s) => !known.has(squash(s)))
    .map((value) => ({ value, uses: 0 }))

  const pool = [...home, ...fromSeed]

  let matches: StoreSuggestion[]
  if (!typed) {
    matches = pool
  } else {
    const q = squash(typed)
    const starts = pool.filter((s) => squash(s.value).startsWith(q))
    const contains = pool.filter(
      (s) => !squash(s.value).startsWith(q) && squash(s.value).includes(q)
    )
    matches = [...starts, ...contains]
  }

  const out = matches.slice(0, Math.max(0, limit))

  if (typed && !out.some((s) => squash(s.value) === squash(typed))) {
    out.push({ value: typed, uses: 0, isRaw: true })
  }
  return out
}
