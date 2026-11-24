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
 * reason.
 *
 * Hosting note: firebase.json's SPA rewrite (`**` → /index.html) also catches
 * a missing `/assets/` file, so a stale chunk comes back as index.html with a
 * 200 and the import fails on its MIME type ("'text/html' is not a valid
 * JavaScript MIME type") rather than a 404. That still rejects the import().
 *
 * ONLY for a replaced build (Codex review F6). This used to reload on ANY
 * import failure — and with no signal, an uncached route's import fails with
 * the same error a replaced build gives. Opening one offline therefore threw
 * away the screen the person was on and reloaded into nothing. The error
 * cannot tell the two apart, so the server is asked (probeBuild):
 *
 *  · the build was replaced → one reload, as before;
 *  · the server cannot be reached, the build is unchanged, or this session
 *    already reloaded once → no reload. The route shows the shared error state
 *    with Try again, in place, with the rest of the app still usable;
 *  · the failure is not an asset failure at all (the route's own module threw)
 *    → rethrown to the ErrorBoundary, never a reload.
 *
 * Try again imports the route again. React.lazy keeps a rejection for good, so
 * the lazy resolves to the error screen instead, and that screen swaps in the
 * route when a later import works. If a retry still cannot import while the
 * server IS reachable, it reloads: some browsers cache a failed import() for
 * the life of the page, and the person asked for the page.
 */
import { createElement, lazy, useState, type ComponentType } from "react"
import { LoadErrorState } from "@/components/layout/LoadStates"
import { isStaleChunkError, probeBuild } from "./chunkRetry"

const RELOAD_FLAG = "homehub:lazy-reloaded"

function alreadyReloaded(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1"
  } catch {
    // sessionStorage unavailable (private mode): treat as already retried, so
    // there is never a reload we could not record — and so never a loop.
    return true
  }
}

function markReloaded(): boolean {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1")
    return true
  } catch {
    // Can't record the reload, so the caller won't reload (see alreadyReloaded).
    return false
  }
}

function clearReloaded(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG)
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/** A promise that never settles: React stays in Suspense until the reload swaps the page. */
const untilReload = <V,>() => new Promise<V>(() => {})

/**
 * `reload` is injectable for tests only; production always reloads the window.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  reload: () => void = () => window.location.reload(),
) {
  /** The route, once ANY import of it has worked — kept across remounts. */
  let Route: T | null = null

  /** Shown in the route's place when it could not be loaded and reloading would not help. */
  function RouteLoadError() {
    const [trying, setTrying] = useState(false)
    const [, setLoaded] = useState(false)
    if (Route) return createElement(Route)
    const retry = () => {
      if (trying) return
      setTrying(true)
      factory()
        .then((mod) => {
          Route = mod.default
          clearReloaded()
          setLoaded(true)
        })
        .catch(async (err: unknown) => {
          console.warn("[lazyWithRetry] the route still could not be loaded:", err)
          // Reachable and still failing: this page cannot recover the import
          // by itself (a cached failure, or a replaced build) — reload. With
          // no server there is nothing to reload into: stay here.
          if (isStaleChunkError(err) && (await probeBuild()) !== "unreachable") reload()
        })
        .finally(() => setTrying(false))
    }
    return createElement(LoadErrorState, {
      title: "Couldn't load this page",
      message: trying ? "Trying again…" : "Check your connection and try again.",
      onRetry: retry,
    })
  }

  return lazy<ComponentType<unknown>>(async () => {
    try {
      const mod = await factory()
      // Success — clear the flag so the next stale-deploy gets one retry.
      clearReloaded()
      Route = mod.default
      return mod
    } catch (err) {
      // The route's own code threw while loading: not an asset problem, and a
      // reload would only run into it again.
      if (!isStaleChunkError(err)) throw err
      if (!alreadyReloaded() && (await probeBuild()) === "stale" && markReloaded()) {
        console.warn("[lazyWithRetry] this build was replaced, reloading once:", err)
        reload()
        return untilReload<{ default: ComponentType<unknown> }>()
      }
      console.warn("[lazyWithRetry] a route could not be loaded (offline, or not a new build); showing Try again:", err)
      return { default: RouteLoadError }
    }
  })
}
