/**
 * Where a tapped notification should take you, and how it gets there.
 *
 * Two things were wrong with handling the tap inline:
 *
 * 1. `window.location.assign(url)` is a FULL page load. In remote-URL mode that
 *    re-runs the entire cold start — the very thing a deep link is meant to
 *    shortcut — and `server.errorPath` fires on any failed navigation, so a tap
 *    while briefly offline would replace the running app with the offline page.
 *    Routing in-app keeps the session and the warm caches.
 *
 * 2. The payload is untrusted input. `startsWith("/")` is not enough: "//evil.com"
 *    passes it and is a protocol-relative URL to another origin.
 *
 * The tap can also arrive before React has mounted (cold start), so the path is
 * parked here and claimed by the app when it is ready.
 */

const KEY = "homehub:pending-deeplink"
export const DEEP_LINK_EVENT = "homehub:deeplink"

/** An in-app path, or null. Rejects absolute, protocol-relative and non-paths. */
export function sanitizeDeepLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const url = raw.trim()
  if (!url.startsWith("/")) return null   // absolute or scheme-bearing
  if (url.startsWith("//")) return null   // protocol-relative → another origin
  if (url.includes("\\")) return null     // backslash tricks some parsers
  return url
}

/** Called from the native tap handler. Parks the path and nudges the app. */
export function parkDeepLink(raw: unknown): void {
  const path = sanitizeDeepLink(raw)
  if (!path) return
  try { sessionStorage.setItem(KEY, path) } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent(DEEP_LINK_EVENT, { detail: path }))
}

/** Reads and clears the parked path — a deep link must only be followed once. */
export function claimDeepLink(): string | null {
  try {
    const path = sessionStorage.getItem(KEY)
    if (path) sessionStorage.removeItem(KEY)
    return sanitizeDeepLink(path)
  } catch {
    return null
  }
}
