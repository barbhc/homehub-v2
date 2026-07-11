/**
 * SSRF guard — ported VERBATIM from v1 `supabase/functions/_shared/mod.ts`
 * (invariant 8). Any server-side fetch of a user-supplied URL (URL manuals,
 * proxy-pdf, import-care-url) MUST pass `isAllowedUrl` first.
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
