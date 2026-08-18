import type { Home } from "@/integrations/types"

/**
 * Warm start for the home lookup — and, since multi-home shipped, the record of
 * WHICH home the user last selected on this device. One entry serves both: the
 * cache is the selection, so there is no second key to drift out of sync with
 * it. (Key name kept for compatibility with caches already on testers' phones.)
 *
 * Measured on the owner's phone (2026-08-04, cold start, native shell):
 * `getPrimaryHome()` cost **729ms** — the single slowest step of a 2053ms boot,
 * and nothing downstream can begin without it, because every dashboard query is
 * keyed by home id. It is two sequential round trips: a membership query, then a
 * read of the home document.
 *
 * That answer almost never changes. Caching it turns a blocking 729ms into a
 * synchronous read, and the network lookup becomes a background correction
 * instead of a gate.
 *
 * Correctness rules, in the order they matter:
 *   · Cached PER USER ID. Two people on one device must never see each other's
 *     home, and a stale entry from a previous account is worse than a slow boot.
 *   · Always revalidated. The cache decides what to paint FIRST, never what is
 *     true — if the lookup returns something different, that wins.
 *   · Cleared on sign-out, alongside the dashboard snapshot.
 */

const KEY = "homehub:primary-home"

interface Cached {
  uid: string
  home: Home
  at: string
}

export function readCachedHome(uid: string | null): Home | null {
  if (!uid || typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Cached
    // A cache written for someone else is not a slow path, it is a wrong one.
    if (parsed?.uid !== uid || !parsed.home?.home_id) return null
    return parsed.home
  } catch {
    return null
  }
}

export function writeCachedHome(uid: string, home: Home | null): void {
  if (typeof window === "undefined") return
  try {
    if (!home) {
      localStorage.removeItem(KEY)
      return
    }
    localStorage.setItem(KEY, JSON.stringify({ uid, home, at: new Date().toISOString() } satisfies Cached))
  } catch {
    /* private mode / quota — a missing warm start is not a failure */
  }
}

export function clearCachedHome(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* non-fatal */
  }
}
