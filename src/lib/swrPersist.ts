/**
 * Cross-restart SWR cache for the dashboard.
 *
 * SWR's default cache is in-memory, so every cold app launch (or WebView reload)
 * throws away the last dashboard and re-runs its ~9 Firestore queries before
 * anything renders — the multi-second blank/skeleton Home on reopen. This
 * persists ONLY `dashboard:*` entries to localStorage so the next launch paints
 * the last known Home instantly, then SWR revalidates in the background
 * (stale-while-revalidate).
 *
 * Scope is deliberately narrow (dashboard keys only, and only their `data`, not
 * error/validating flags) to keep the payload small and avoid restoring a stale
 * error state. Cleared on sign-out (clearPersistedDashboardCache) so one user's
 * Home never lingers on the device for the next.
 */
const CACHE_KEY = "hh-swr-dashboard-cache"
const PREFIX = "dashboard:"

type SwrState = { data?: unknown }

export function clearPersistedDashboardCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/** SWRConfig `provider`: a Map seeded from localStorage, re-persisted on hide. */
export function localStorageDashboardProvider(): Map<string, SwrState> {
  if (typeof window === "undefined") return new Map()

  let restored: [string, SwrState][] = []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) restored = JSON.parse(raw)
  } catch {
    restored = []
  }
  const map = new Map<string, SwrState>(restored)

  const persist = () => {
    try {
      const entries: [string, SwrState][] = []
      for (const [k, v] of map.entries()) {
        if (!k.startsWith(PREFIX)) continue
        const data = (v as SwrState | undefined)?.data
        // Only persist resolved data — never a rejected/in-flight state.
        if (data !== undefined) entries.push([k, { data }])
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
    } catch {
      /* quota / serialization — non-fatal, we just lose the warm cache */
    }
  }

  // beforeunload covers desktop reload/close; visibilitychange:hidden is the
  // one that actually fires on iOS when the app is backgrounded or killed.
  window.addEventListener("beforeunload", persist)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") persist()
  })

  return map
}
