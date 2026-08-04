import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { markBoot } from "@/lib/bootTiming"
import { useAuth } from "@/modules/auth"
import { getPrimaryHome } from "../services/homeService"
import { readCachedHome, writeCachedHome } from "@/lib/homeCache"
import type { Home } from "@/integrations/types"

type HomeState = {
  home: Home | null
  loading: boolean
  /** Set when the membership/home LOOKUP FAILED (network, missing index, rules).
   *  Distinct from "loaded fine and the user has no home" (home=null, error=null).
   *  Consumers must NOT route to onboarding while this is set — treating a failed
   *  lookup as "no home" is what minted duplicate homes in the launch incident. */
  error: string | null
  refresh: () => Promise<void>
}

const HomeContext = createContext<HomeState | null>(null)

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [home, setHome] = useState<Home | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Track which user id we've completed a home fetch for. `loading` is derived
  // from this (below) so it stays true from the moment `user` resolves until
  // that user's home has actually been fetched — closing a deep-link race where
  // HomeGate would otherwise momentarily see loading=false + home=null (in the
  // render between user resolving and this load effect re-running) and wrongly
  // redirect to "/" (which then bounces to /home).
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      console.debug("[HomeProvider] No user, clearing home")
      setHome(null)
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
      setError(null)
      setLoadedFor(user.id)
      markBoot("home")
    }

    try {
      console.debug("[HomeProvider] Loading home for user", user.id)
      const result = await getPrimaryHome()
      markBoot("home")
      // The network answer always wins — the cache decides what paints FIRST,
      // never what is true.
      setHome(result.data ?? null)
      if (!result.error) writeCachedHome(user.id, result.data ?? null)
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.id is sufficient; using user object would cause unnecessary re-fetches
  }, [user?.id])

  useEffect(() => {
    load()
  }, [load])

  // Loading until auth settles AND home has been fetched for the current user.
  const loading = authLoading || (!!user && loadedFor !== user.id)

  return (
    <HomeContext.Provider value={{ home, loading, error, refresh: load }}>
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
