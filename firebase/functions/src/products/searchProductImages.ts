/**
 * searchProductImages — port of v1 search-product-images. Uses the Brave Web
 * Search API to find product photos (thumbnails from web results). Requires
 * BRAVE_SEARCH_API_KEY; returns a clear error when unset (owner action).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { requireAnyMembership } from "../lib/membership.js"
import { withAiQuota } from "../lib/quota.js"
import { z } from "zod"
import { parseCallableInput } from "../lib/validate.js"
import { braveWebResults } from "../lib/externalResponses.js"

const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
const REGION = "us-central1"

export type ProductImage = { title: string; thumbnailUrl: string; imageUrl: string; sourceUrl: string }

/** The request (H3a). `count` above 30 is still clamped to 30, as before; a
 *  zero, negative or fractional one is refused rather than sent to Brave. */
export const SearchProductImagesRequest = z.object({
  query: z.string().max(400).refine((q) => q.trim().length > 0),
  count: z.number().int().positive().optional(),
})

export const searchProductImages = onCall({ region: REGION, secrets: [BRAVE_SEARCH_API_KEY], timeoutSeconds: 30 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { query, count } = parseCallableInput("searchProductImages", SearchProductImagesRequest, request.data, "query is required")
  await requireAnyMembership(getFirestore(), request.auth.uid)
  const braveKey = BRAVE_SEARCH_API_KEY.value()
  if (!braveKey) throw new HttpsError("failed-precondition", "Image search not configured (BRAVE_SEARCH_API_KEY unset).")

  return withAiQuota(getFirestore(), request.auth.uid, "searchProductImages", async () => {
  const n = Math.min(count ?? 20, 30)

  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", `${query} product photo`)
  url.searchParams.set("count", String(n))
  url.searchParams.set("search_lang", "en")
  url.searchParams.set("safesearch", "strict")

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": braveKey },
  })
  if (!res.ok) throw new HttpsError("unavailable", `Search failed (HTTP ${res.status})`)

  const images: ProductImage[] = braveWebResults(await res.json()).flatMap((r) => {
    const src = r.thumbnail?.src
    if (!src) return []
    return [{ title: r.title ?? "", thumbnailUrl: src, imageUrl: r.thumbnail?.original || src, sourceUrl: r.url ?? "" }]
  })
  return { ok: true, images }
  })
})
