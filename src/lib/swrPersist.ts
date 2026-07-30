/**
 * Cross-restart warm start for the dashboard.
 *
 * SWR's cache is in-memory, so every cold launch (or WebView reload) throws away
 * the last dashboard and re-runs its ~9 Firestore queries before anything
 * renders — the multi-second blank/skeleton Home on reopen. We persist the last
 * resolved dashboard payload to localStorage and hand it back on the next launch
 * as SWR `fallback` data, so Home paints immediately and revalidates behind it.
 *
 * This deliberately does NOT use a custom SWR cache `provider`. That was the
 * first implementation and it wedged Home permanently in development: SWRConfig
 * creates the provider during render but tears it down in a layout-effect
 * cleanup (`SWRGlobalState.delete(provider)`), and React StrictMode runs layout
 * effects mount → cleanup → mount. Because children's effects run before the
 * parent's, `useSWR` in Home re-subscribed and then SWRConfig re-initialized the
 * provider's registries underneath it — the fetch resolved with nobody listening,
 * so `isLoading` never flipped and Home showed its skeleton forever. (Production
 * was unaffected: StrictMode only double-invokes effects in dev.) `fallback` is
 * plain config with no lifecycle, so there is nothing to tear down.
 *
 * Scope stays narrow: dashboard keys only, data only (never an error or
 * in-flight state). Cleared on sign-out so one user's Home never lingers for the
 * next.
 */
const CACHE_KEY = "hh-swr-dashboard-cache"
const PREFIX = "dashboard:"

/** Persisted shape: [[key, data], …] — data only, no SWR internals. */
type PersistedEntry = [string, unknown]

export function clearPersistedDashboardCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* private mode / quota — non-fatal */
  }
}

/**
 * The persisted dashboards as an SWR `fallback` map ({ [key]: data }). Read once
 * at module scope by App so the very first render already has data. Tolerates a
 * missing, corrupt, or legacy-shaped payload by returning {}.
 */
export function readPersistedDashboardFallback(): Record<string, unknown> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return {}
    const out: Record<string, unknown> = {}
    for (const entry of parsed as PersistedEntry[]) {
      if (!Array.isArray(entry) || typeof entry[0] !== "string") continue
      if (!entry[0].startsWith(PREFIX)) continue
      // The provider-era format stored SWR state objects ({ data }); unwrap those
      // so a cache written by the previous version still warms this one.
      const value = entry[1]
      const data =
        value && typeof value === "object" && !Array.isArray(value) && "data" in value
          ? (value as { data: unknown }).data
          : value
      if (data !== undefined) out[entry[0]] = data
    }
    return out
  } catch {
    return {}
  }
}

/**
 * Record one resolved dashboard payload. Called on every successful fetch rather
 * than on `beforeunload`/`visibilitychange`: iOS can kill a backgrounded WebView
 * without firing either, which is exactly the reopen this is meant to speed up.
 */
export function persistDashboardSnapshot(key: string, data: unknown): void {
  if (typeof window === "undefined") return
  if (!key.startsWith(PREFIX) || data === undefined) return
  try {
    const current = readPersistedDashboardFallback()
    current[key] = data
    const entries: PersistedEntry[] = Object.entries(current)
    localStorage.setItem(CACHE_KEY, JSON.stringify(entries))
  } catch {
    /* quota / serialization — non-fatal, we just lose the warm cache */
  }
}
