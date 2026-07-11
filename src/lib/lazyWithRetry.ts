/**
 * lazyWithRetry — React.lazy wrapper that recovers from stale-chunk failures.
 *
 * When a new build deploys, any client that still has the old index.html in
 * memory will try to fetch asset hashes that no longer exist (e.g.
 * `/assets/Home-<oldhash>.js`). That import() rejects, React bubbles the
 * error to the nearest ErrorBoundary, and the user sees a crash.
 *
 * We detect those failures and force one hard reload so the browser fetches
 * the new index.html (with fresh asset hashes). A sessionStorage flag
 * prevents infinite reload loops if the import keeps failing for a real
 * reason (e.g. offline, or a genuine runtime bug in the chunk).
 *
 * Companion fix: vercel.json's SPA rewrite now excludes `/assets/`, so a
 * missing asset 404s cleanly instead of being served as HTML — otherwise
 * the browser raises the confusing "'text/html' is not a valid JavaScript
 * MIME type" TypeError before this handler ever sees the failure.
 */
import { lazy, type ComponentType } from "react"

const RELOAD_FLAG = "homehub:lazy-reloaded"

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory()
      // Success — clear the flag so the next stale-deploy gets one retry.
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(RELOAD_FLAG)
      }
      return mod
    } catch (err) {
      const alreadyRetried =
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(RELOAD_FLAG) === "1"

      if (!alreadyRetried && typeof window !== "undefined") {
        try {
          sessionStorage.setItem(RELOAD_FLAG, "1")
        } catch {
          // sessionStorage might be disabled (private mode). If so we fall
          // through and throw so the ErrorBoundary at least catches it.
        }
        console.warn("[lazyWithRetry] chunk load failed, reloading:", err)
        window.location.reload()
        // Return a never-resolving promise so React stays in Suspense
        // until the reload actually swaps the page.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }
  })
}
