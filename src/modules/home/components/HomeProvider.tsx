import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { markBoot } from "@/lib/bootTiming"
import { track } from "@/lib/analytics"
import { useAuth } from "@/modules/auth"
import { getMyHomes } from "../services/homeService"
import { readCachedHome, writeCachedHome } from "@/lib/homeCache"
import type { Home } from "@/integrations/types"

type HomeState = {
  /** The SELECTED home. Contract unchanged for the ~24 consumers that only ever
   *  needed one home — switching swaps this and every home-keyed query follows. */
  home: Home | null
  /** Every home the user belongs to. Seeded from the cache pre-network so the
   *  switcher is never momentarily empty. */
  homes: Home[]
  /** True once the homes fetch has SETTLED for this uid (success or failure).
   *  A cross-home push deep link waits on this before switching. */
  homesReady: boolean
  loading: boolean
  /** Set when the membership/home LOOKUP FAILED (network, missing index, rules).
   *  Distinct from "loaded fine and the user has no home" (home=null, error=null).
   *  Consumers must NOT route to onboarding while this is set — treating a failed
   *  lookup as "no home" is what minted duplicate homes in the launch incident. */
  error: string | null
  /** Pass a home id to select it once the fetch lands — the race-free way to
   *  select a home that isn't in the current render's `homes` yet (just created). */
  refresh: (selectHomeId?: string) => Promise<void>
  /** Synchronous: `homes` already holds full Home objects, so the header and
   *  every SWR key flip in one render. Unknown ids are a no-op. */
  setCurrentHome: (homeId: string) => void
}

const HomeContext = createContext<HomeState | null>(null)

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [home, setHome] = useState<Home | null>(null)
  const [homes, setHomes] = useState<Home[]>([])
  const [homesReady, setHomesReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // setCurrentHome must not close over a stale `homes` — it can be called from a
  // sheet rendered before the latest fetch landed.
  const homesRef = useRef<Home[]>([])
  useEffect(() => { homesRef.current = homes }, [homes])
  // Track which user id we've completed a home fetch for. `loading` is derived
  // from this (below) so it stays true from the moment `user` resolves until
  // that user's home has actually been fetched — closing a deep-link race where
  // HomeGate would otherwise momentarily see loading=false + home=null (in the
  // render between user resolving and this load effect re-running) and wrongly
  // redirect to "/" (which then bounces to /home).
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const load = useCallback(async (selectHomeId?: string) => {
    if (!user) {
      console.debug("[HomeProvider] No user, clearing home")
      setHome(null)
      setHomes([])
      setHomesReady(false)
      setError(null)
      setLoadedFor(null)
      return
    }
    // Warm start: paint the last known home immediately and let the lookup
    // become a background correction. getPrimaryHome is two sequential round
    // trips and cost 729ms on the owner's phone — the slowest step of the boot,
    // and a blocking one, since every dashboard query is keyed by home id.
    const cached = readCachedHome(user.id)
    if (cached) {
      setHome(cached)
      // Seed the list too: the switcher opening to an empty sheet on a warm boot
      // would read as "you have no homes" during the fetch.
      setHomes([cached])
      setError(null)
      setLoadedFor(user.id)
      markBoot("home")
    }

    try {
      console.debug("[HomeProvider] Loading homes for user", user.id)
      const result = await getMyHomes()
      markBoot("home")
      // A SUCCESSFUL network answer always wins — the cache decides what paints
      // FIRST, never what is true. A FAILED one decides nothing: blanking a
      // home we already painted would bounce the user to onboarding, which is
      // the mistake this provider exists to prevent.
      if (!result.error) {
        const list = result.data?.homes ?? []
        // Selection priority: an explicit request (just-created home, deep
        // link) → the last home selected on this device → the membership's
        // primary → the first. A stored id that is no longer in the list (the
        // user was removed) simply falls through and the cache is rewritten.
        const selected =
          list.find((h) => h.home_id === selectHomeId) ??
          list.find((h) => h.home_id === cached?.home_id) ??
          list.find((h) => h.home_id === result.data?.primaryHomeId) ??
          list[0] ??
          null
        setHomes(list)
        setHome(selected)
        writeCachedHome(user.id, selected)
      } else if (!cached) {
        setHome(null)
      }
      if (result.error) {
        // A FAILED lookup (missing index, offline, rules) must be visible and must
        // not read as "no home" — see the error field's contract on HomeState.
        console.error("[HomeProvider] getPrimaryHome failed:", result.error.message)
        setError(result.error.message)
      } else {
        setError(null)
        if (!result.data) {
          console.debug("[HomeProvider] No home found — user will see onboarding")
        }
      }
    } catch (err) {
      console.error("[HomeProvider] load failed:", err)
      // Don't blank a home we already painted from cache: a failed refresh is
      // not evidence the home is gone, and clearing it here would bounce the
      // user to onboarding — the exact mistake that minted duplicate homes.
      if (!cached) setHome(null)
      setError(err instanceof Error ? err.message : "Could not load your home.")
    } finally {
      setLoadedFor(user.id)
      // Settled, success or failure — a cross-home deep link may now act on
      // whatever we know rather than waiting forever.
      setHomesReady(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id is sufficient; using user object would cause unnecessary re-fetches
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  /** Select an already-loaded home. Synchronous by design — see the type. */
  const setCurrentHome = useCallback(
    (homeId: string) => {
      const target = homesRef.current.find((h) => h.home_id === homeId)
      if (!target || !user) return
      setHome(target)
      writeCachedHome(user.id, target)
      track("home_switched", { home_id: homeId })
    },
    [user],
  )

  // Loading until auth settles AND home has been fetched for the current user.
  const loading = authLoading || (!!user && loadedFor !== user.id)

  return (
    <HomeContext.Provider value={{ home, homes, homesReady, loading, error, refresh: load, setCurrentHome }}>
      {children}
    </HomeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentHome(): HomeState {
  const ctx = useContext(HomeContext)
  if (!ctx) throw new Error("useCurrentHome must be used within HomeProvider")
  return ctx
}

/** Compatibility: returns property-shaped data for legacy pages using property.id */
// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentPropertyCompat(): {
  property: { id: string; name: string } | null
  loading: boolean
  refresh: () => Promise<void>
} {
  const { home, loading, refresh } = useCurrentHome()
  return {
    property: home ? { id: home.home_id, name: home.name } : null,
    loading,
    refresh,
  }
}
