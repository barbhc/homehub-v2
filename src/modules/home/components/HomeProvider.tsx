import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { useAuth } from "@/modules/auth"
import { getPrimaryHome } from "../services/homeService"
import type { Home } from "@/integrations/types"

type HomeState = {
  home: Home | null
  loading: boolean
  refresh: () => Promise<void>
}

const HomeContext = createContext<HomeState | null>(null)

export function HomeProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const [home, setHome] = useState<Home | null>(null)
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
      setLoadedFor(null)
      return
    }
    try {
      console.debug("[HomeProvider] Loading home for user", user.id)
      const result = await getPrimaryHome()
      setHome(result.data ?? null)
      if (result.error) {
        console.debug("[HomeProvider] getPrimaryHome error:", result.error.message)
      }
      if (!result.data) {
        console.debug("[HomeProvider] No home found — user will see onboarding")
      }
    } catch (err) {
      console.debug("[HomeProvider] load failed:", err)
      setHome(null)
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
    <HomeContext.Provider value={{ home, loading, refresh: load }}>
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
