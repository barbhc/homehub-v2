/**
 * SSRF guard — `isAllowedUrl` ported VERBATIM from v1
 * `supabase/functions/_shared/mod.ts` (invariant 8). Any server-side fetch of a
 * user-supplied URL (URL manuals, proxy-pdf, import-care-url) MUST pass it.
 *
 * Checking the URL once is not enough on its own: `fetch` follows redirects by
 * default, and only the FIRST hop was ever validated. An attacker-controlled
 * host could answer 302 -> http://169.254.169.254/… (or any RFC1918 address)
 * and the redirect was followed for them. Use `fetchGuarded` instead of `fetch`
 * for any URL that came from a user — it re-checks every hop.
 */

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^192\.168\./,
  /^0\.0\.0\.0/,
  /^169\.254\./,
]

export function isAllowedUrl(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }

  // Only allow http and https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block localhost variants
  if (hostname === "localhost" || hostname === "[::1]" || hostname.endsWith(".local")) {
    return false
  }

  // Block metadata endpoint
  if (hostname === "169.254.169.254") {
    return false
  }

  // Block private IP ranges
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return false
    }
  }

  return true
}

/** Hops allowed before giving up. Real manual links redirect once or twice
 *  (http->https, CDN handoff); more than this is not a document fetch. */
export const MAX_REDIRECTS = 3

/**
 * `fetch` for user-supplied URLs: validates the URL, then follows redirects
 * MANUALLY so that every hop is re-validated with `isAllowedUrl`.
 *
 * `redirect: "manual"` is the point of the exercise. With the default
 * ("follow") the runtime chases Location headers itself and the guard only ever
 * sees the URL the user typed, so a 302 to an internal address is honoured.
 *
 * Throws on a blocked URL (initial or redirected) and on exceeding
 * MAX_REDIRECTS. Returns the first non-redirect response.
 */
export async function fetchGuarded(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUrl(current)) {
      throw new Error(
        hop === 0
          ? "URL not allowed: private or internal addresses are blocked"
          : `URL not allowed: redirect to a private or internal address was blocked (hop ${hop})`
      )
    }
    const res = await fetchImpl(current, { ...init, redirect: "manual" })
    // 304 is in the 3xx range but is not a redirect and carries no Location.
    if (res.status < 300 || res.status > 399 || res.status === 304) return res

    const location = res.headers.get("location")
    if (!location) return res // a 3xx with nowhere to go — hand it back as-is.
    // Relative Locations are legal (RFC 7231) and must resolve against the hop
    // we are ON, not the original URL.
    current = new URL(location, current).toString()
  }
  throw new Error(`Too many redirects (more than ${MAX_REDIRECTS})`)
}
