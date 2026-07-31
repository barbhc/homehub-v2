import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, Timestamp, type Firestore } from "firebase-admin/firestore"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { consumeDailyAiQuota } from "../lib/quota.js"
import { requireAnyMembership } from "../lib/membership.js"

/**
 * Find the owner's manual PDF from brand + model.
 *
 * The single worst step in adding an appliance is being told to go find its
 * manual: leave the app, search the manufacturer site, match your exact model,
 * download a PDF, come back, upload it. People give up there, and an item with no
 * manual is an item with no tasks — which is most of the product's value.
 *
 * The user has already typed brand and model by this point, so we can do that
 * search for them. We do NOT attach anything automatically: this returns
 * candidates with their source domain and the user picks, per "suggest, never
 * assume" — silently attaching the wrong model's manual would poison every task
 * generated from it, and they'd have no idea why.
 */

const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
const REGION = "us-central1"
/** Generous: this is one search per appliance added, not per keystroke. */
const FIND_MANUAL_DAILY_LIMIT = 60
const CACHE_TTL_DAYS = 30
const MAX_CANDIDATES = 4

export interface ManualCandidate {
  url: string
  title: string
  /** Shown to the user — the domain is how a person judges whether to trust it. */
  host: string
  /** True when the host looks like the manufacturer rather than an aggregator. */
  official: boolean
}

const sanitize = (v: unknown, max = 80): string =>
  typeof v === "string" ? v.trim().slice(0, max) : ""

const cacheKey = (brand: string, model: string) =>
  `${brand}|${model}`.toLowerCase().replace(/[^a-z0-9|]+/g, "-").slice(0, 200)

/** Aggregators and manual-farm sites: usable, but ranked below the manufacturer
 *  and flagged so the user can tell the difference. */
const AGGREGATORS = /manualslib|manualsonline|manua\.ls|manualowl|scribd|slideshare|pdfcoffee|studylib/i

export function looksOfficial(host: string, brand: string): boolean {
  if (AGGREGATORS.test(host)) return false
  const b = brand.toLowerCase().replace(/[^a-z0-9]/g, "")
  if (b.length < 2) return false
  // Compare DOMAIN LABELS, not the whole string. Substring matching can't handle
  // the short brands the owner actually owns — "lg" appears incidentally in
  // plenty of hostnames — so a 2-letter brand must BE a label ("lg.com"), while
  // a longer one may appear inside one ("bosch-home.com").
  const labels = host.toLowerCase().split(".").map((l) => l.replace(/[^a-z0-9]/g, ""))
  return labels.some((l) => (b.length <= 2 ? l === b : l.includes(b)))
}

/** A result is a manual candidate only if it's plausibly a PDF we may fetch. */
export function isPdfCandidate(url: string): boolean {
  if (!isAllowedUrl(url)) return false
  try {
    const u = new URL(url)
    // Query strings are common on CDN-served PDFs, so test the path only.
    return /\.pdf$/i.test(u.pathname) || /\/pdf\//i.test(u.pathname)
  } catch {
    return false
  }
}

interface BraveResult { title?: string; url?: string; description?: string }

export function rankCandidates(results: BraveResult[], brand: string, model: string): ManualCandidate[] {
  const seen = new Set<string>()
  const out: ManualCandidate[] = []
  const modelToken = model.toLowerCase().replace(/[^a-z0-9]/g, "")

  for (const r of results) {
    const url = String(r.url ?? "")
    if (!url || seen.has(url) || !isPdfCandidate(url)) continue
    let host: string
    try { host = new URL(url).hostname.replace(/^www\./, "") } catch { continue }
    seen.add(url)
    out.push({
      url,
      title: String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, 160) || `${brand} ${model} manual`,
      host,
      official: looksOfficial(host, brand),
    })
  }

  // Manufacturer first, then results that actually name the model — a generic
  // "washer manual" from an aggregator is worse than nothing, because attaching
  // it produces confidently wrong tasks.
  return out
    .sort((a, b) => {
      if (a.official !== b.official) return a.official ? -1 : 1
      const am = a.url.toLowerCase().replace(/[^a-z0-9]/g, "").includes(modelToken) ? 0 : 1
      const bm = b.url.toLowerCase().replace(/[^a-z0-9]/g, "").includes(modelToken) ? 0 : 1
      return am - bm
    })
    .slice(0, MAX_CANDIDATES)
}

async function braveSearch(key: string, query: string): Promise<BraveResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", "12")
  url.searchParams.set("text_decorations", "false")
  url.searchParams.set("search_lang", "en")
  try {
    const res = await fetch(url.toString(), { headers: { "X-Subscription-Token": key } })
    if (!res.ok) return []
    const json = (await res.json()) as { web?: { results?: BraveResult[] } }
    return json.web?.results ?? []
  } catch {
    return [] // fail-open: no manual found is a fine answer, an error page isn't
  }
}

export const findManual = onCall(
  { region: REGION, secrets: [BRAVE_SEARCH_API_KEY], timeoutSeconds: 30 },
  async (request): Promise<{ candidates: ManualCandidate[]; source: "cache" | "search" | "unavailable" }> => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
    const uid = request.auth.uid
    const db: Firestore = getFirestore()
    await requireAnyMembership(db, uid)

    const body = (request.data ?? {}) as Record<string, unknown>
    const brand = sanitize(body.brand)
    const model = sanitize(body.model)
    if (brand.length < 2 || model.length < 2) {
      throw new HttpsError("invalid-argument", "brand and model are required")
    }

    const ref = db.collection("manualSearchCache").doc(cacheKey(brand, model))
    const snap = await ref.get()
    const now = Date.now()
    if (snap.exists) {
      const expiresAt = snap.get("expiresAt") as Timestamp | undefined
      if (!expiresAt || expiresAt.toMillis() > now) {
        return { candidates: (snap.get("candidates") as ManualCandidate[]) ?? [], source: "cache" }
      }
    }

    const key = BRAVE_SEARCH_API_KEY.value()
    // No key configured → say so plainly rather than pretending we found nothing;
    // the UI keeps upload/paste-URL available either way.
    if (!key) return { candidates: [], source: "unavailable" }

    await consumeDailyAiQuota(db, uid, "findManual", FIND_MANUAL_DAILY_LIMIT)

    // Two passes: the precise one first, then a looser fallback, because
    // filetype: is a hint rather than a guarantee on most engines.
    let results = await braveSearch(key, `"${brand} ${model}" owner's manual filetype:pdf`)
    let candidates = rankCandidates(results, brand, model)
    if (candidates.length === 0) {
      results = await braveSearch(key, `${brand} ${model} manual pdf`)
      candidates = rankCandidates(results, brand, model)
    }

    // Misses are cached too — "no manual online for this model" is an answer worth
    // not re-buying every time the user reopens the step.
    await ref.set({
      brand, model, candidates,
      expiresAt: Timestamp.fromMillis(now + CACHE_TTL_DAYS * 86_400_000),
      updatedAt: Timestamp.now(),
    })

    return { candidates, source: "search" }
  },
)
