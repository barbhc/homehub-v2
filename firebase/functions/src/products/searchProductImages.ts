/**
 * searchProductImages — port of v1 search-product-images. Uses the Brave Web
 * Search API to find product photos (thumbnails from web results). Requires
 * BRAVE_SEARCH_API_KEY; returns a clear error when unset (owner action).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"

const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
const REGION = "us-central1"

export type ProductImage = { title: string; thumbnailUrl: string; imageUrl: string; sourceUrl: string }

export const searchProductImages = onCall({ region: REGION, secrets: [BRAVE_SEARCH_API_KEY], timeoutSeconds: 30 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const braveKey = BRAVE_SEARCH_API_KEY.value()
  if (!braveKey) throw new HttpsError("failed-precondition", "Image search not configured (BRAVE_SEARCH_API_KEY unset).")

  const { query, count } = (request.data ?? {}) as { query?: string; count?: number }
  if (!query || !query.trim()) throw new HttpsError("invalid-argument", "query is required")
  const n = Math.min(typeof count === "number" ? count : 20, 30)

  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", `${query} product photo`)
  url.searchParams.set("count", String(n))
  url.searchParams.set("search_lang", "en")
  url.searchParams.set("safesearch", "strict")

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json", "Accept-Encoding": "gzip", "X-Subscription-Token": braveKey },
  })
  if (!res.ok) throw new HttpsError("unavailable", `Search failed (HTTP ${res.status})`)

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; thumbnail?: { src?: string; original?: string } }> }
  }
  const images: ProductImage[] = (data.web?.results ?? [])
    .filter((r) => r.thumbnail?.src)
    .map((r) => ({
      title: r.title ?? "",
      thumbnailUrl: r.thumbnail!.src ?? "",
      imageUrl: r.thumbnail!.original || r.thumbnail!.src || "",
      sourceUrl: r.url ?? "",
    }))
  return { ok: true, images }
})
