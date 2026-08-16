/**
 * identityResolver — layered "what product is this?" resolution for the add-item
 * flow. Given a typed brand + model, tries real product data first and degrades
 * gracefully:
 *
 *   1. Open Icecat (structured catalog; exact brand+model → name/category)
 *   2. Brave Search (fuzzy web fallback; also mines model-family variants
 *      like WM4000H → WM4000HWA/WM4000HBA for the "which one is yours?" card)
 *   3. (caller) Claude Haiku — the existing spec lookup doubles as the last
 *      identity source when it recognizes the product.
 *
 * Layers whose credential is absent are skipped, so the resolver ships dormant
 * and activates per-layer as keys are configured. Every layer is fail-open: a
 * timeout or schema surprise returns null, never an error — identity is
 * enrichment, not a gate (the typed brand+model are already the item's data).
 *
 * All cores take an injected `fetch` so tests run on fixtures, no network.
 */

export type ProductIdentity = {
  /** Human product name, e.g. "LG WM4000HWA Front Load Washer". */
  name: string
  /** Free-text category hint ("front load washer …") — the CLIENT maps it to a
   *  typed category via its existing keyword mapper (mapOcrCategoryToTyped). */
  rawCategory: string | null
  source: "icecat" | "brave" | "claude"
  confidence: "high" | "medium" | "low"
}

export type VariantCandidate = {
  /** Full model number, e.g. "WM4000HWA". */
  model: string
  /** Short human differentiator, e.g. "White" — null when unknown. */
  differentiator: string | null
}

/** Structural subset of global fetch — tests inject fixtures, prod passes fetch. */
type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

const LAYER_TIMEOUT_MS = 4500

/** Uppercase alphanumerics only — "WM4000H-WA" and "wm4000hwa" compare equal. */
export function normalizeModel(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

/**
 * Open Icecat lookup: exact brand + product code → structured identity.
 * Docs shape: { data: { GeneralInfo: { Title, Category: { Name: { Value } } } } }.
 * Anything unexpected (non-sponsored brand, unknown code, schema drift) → null.
 */
export async function icecatIdentity(
  fetchJson: FetchLike,
  username: string,
  brand: string,
  model: string,
): Promise<ProductIdentity | null> {
  try {
    const url =
      `https://live.icecat.biz/api?UserName=${encodeURIComponent(username)}` +
      `&Language=en&Brand=${encodeURIComponent(brand)}&ProductCode=${encodeURIComponent(model)}`
    const res = await fetchJson(url, { signal: AbortSignal.timeout(LAYER_TIMEOUT_MS) })
    if (!res.ok) return null
    const body = asRecord(await res.json())
    const data = asRecord(body?.data)
    const info = asRecord(data?.GeneralInfo)
    if (!info) return null
    const title = str(info.Title)
    if (!title) return null
    const category = asRecord(info.Category)
    const categoryName = asRecord(category?.Name)
    return {
      name: title.slice(0, 120),
      rawCategory: str(categoryName?.Value)?.slice(0, 120) ?? null,
      source: "icecat",
      confidence: "high",
    }
  } catch {
    return null
  }
}

/** Title cleanup + retailer detection live in shared/ so they are unit-testable
 *  from the app's test runner. Re-exported here for existing importers. */
import { cleanProductTitle, isRetailerHost, hostOf } from "../../../../shared/products/productTitle.js"
export { cleanProductTitle, isRetailerHost, hostOf }

/**
 * Mine model-family variants from search text: tokens that EXTEND the typed
 * model ("WM4000H" → "WM4000HWA"). Only meaningful for reasonably long prefixes;
 * capped at 3 distinct.
 */
export function mineVariants(typedModel: string, haystacks: string[]): VariantCandidate[] {
  const prefix = normalizeModel(typedModel)
  if (prefix.length < 5) return []
  const seen = new Set<string>()
  for (const text of haystacks) {
    for (const rawToken of text.toUpperCase().split(/[^A-Z0-9-]+/)) {
      const token = normalizeModel(rawToken)
      if (
        token.startsWith(prefix) &&
        token.length > prefix.length &&
        token.length <= prefix.length + 6 &&
        /\d/.test(token)
      ) {
        seen.add(token)
        if (seen.size >= 3) return [...seen].map((model) => ({ model, differentiator: null }))
      }
    }
  }
  return [...seen].map((model) => ({ model, differentiator: null }))
}

export type BraveIdentityResult = {
  identity: ProductIdentity | null
  variants: VariantCandidate[]
}

/**
 * Brave web-search fallback. Exact-token match on the model → identity from the
 * best result title; otherwise returns any mined family variants so the client
 * can ask "which one is yours?" instead of guessing.
 */
export async function braveIdentity(
  fetchJson: FetchLike,
  apiKey: string,
  brand: string,
  model: string,
): Promise<BraveIdentityResult> {
  const empty: BraveIdentityResult = { identity: null, variants: [] }
  try {
    const q = encodeURIComponent(`${brand} ${model}`)
    const res = await fetchJson(`https://api.search.brave.com/res/v1/web/search?q=${q}&count=5`, {
      headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(LAYER_TIMEOUT_MS),
    })
    if (!res.ok) return empty
    const body = asRecord(await res.json())
    const web = asRecord(body?.web)
    const results = Array.isArray(web?.results) ? web.results : []
    const items = results
      .map((r) => {
        const rec = asRecord(r)
        return rec
          ? { title: str(rec.title) ?? "", description: str(rec.description) ?? "", url: str(rec.url) ?? "" }
          : null
      })
      .filter((r): r is { title: string; description: string; url: string } => !!r && !!r.title)
    if (!items.length) return empty

    // Exact = a whole TOKEN equals the typed model ("WM4000HWA:" → "WM4000HWA").
    // A substring check would let a partial prefix ("WM4000H") confidently claim
    // the first variant it sees — the design's "confidently wrong" failure mode;
    // partial models must fall through to the variants pick instead.
    const modelNorm = normalizeModel(model)
    const isExact = (r: { title: string }) =>
      r.title.split(/\s+/).some((tok) => normalizeModel(tok) === modelNorm)
    // Prefer a NON-RETAILER exact hit. A store listing title is the retailer's
    // SEO string, not a product name — taking it verbatim is how items ended up
    // called "Amazon.com: Ninja DZ201 ...". A retailer hit is still better than
    // nothing, so it remains the fallback, just with its chrome stripped.
    const exact = items.find((r) => isExact(r) && !isRetailerHost(hostOf(r.url))) ?? items.find(isExact)
    const haystacks = items.flatMap((r) => [r.title, r.description])
    const variants = mineVariants(model, haystacks)

    // If the results ALSO contain longer models extending the typed one, the
    // user typed a PARTIAL — and a token-exact title hit for a partial is
    // almost always a retailer search/category page ("Smd24 at US Appliance"),
    // not the product. The "which one is yours?" pick is the honest answer.
    // A true full model has no mined extensions, so exact still wins there.
    if (!exact || variants.length > 0) return { identity: null, variants }
    return {
      identity: {
        name: cleanProductTitle(exact.title),
        rawCategory: `${exact.title} ${exact.description}`.slice(0, 300),
        source: "brave",
        confidence: "medium",
      },
      variants: [],
    }
  } catch {
    return empty
  }
}

export type IdentityLayerDeps = {
  fetchJson: FetchLike
  icecatUsername: string | null
  braveApiKey: string | null
}

/**
 * Sequential first-hit-wins over the external layers (Icecat → Brave). The
 * Haiku fallback lives in the caller, which already has the spec-lookup result.
 */
export async function resolveExternalIdentity(
  deps: IdentityLayerDeps,
  brand: string,
  model: string,
): Promise<BraveIdentityResult> {
  if (deps.icecatUsername) {
    const hit = await icecatIdentity(deps.fetchJson, deps.icecatUsername, brand, model)
    if (hit) return { identity: hit, variants: [] }
  }
  if (deps.braveApiKey) {
    return braveIdentity(deps.fetchJson, deps.braveApiKey, brand, model)
  }
  return { identity: null, variants: [] }
}
