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
 * Hosting note: firebase.json's SPA rewrite (`**` → /index.html) also catches
 * a missing `/assets/` file, so a stale chunk comes back as index.html with a
 * 200 and the import fails on its MIME type ("'text/html' is not a valid
 * JavaScript MIME type") rather than a 404. That still rejects the import(),
 * so the reload below still runs. (This used to cite a vercel.json rewrite
 * that excluded /assets/; that belonged to the Vercel deploy and has no
 * Firebase Hosting equivalent.)
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
