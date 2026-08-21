import { useEffect, useRef } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { useAuth } from "@/modules/auth"
import { HomeOnboarding, useCurrentHome } from "@/modules/home"
import Landing from "@/pages/Landing"

/**
 * Entry at "/": marketing landing, onboarding, or redirect to the app.
 * - Not authenticated → marketing Landing (sign-in lives at /signin)
 * - Authenticated, no home → HomeOnboarding
 * - Authenticated, has home → redirect to /home
 */
export default function Index() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { home, loading: homeLoading, error: homeError, refresh } = useCurrentHome()

  const returnTo = searchParams.get("returnTo")

  // Set the moment onboarding hands off to the profile step. Without it, the
  // redirect effect below fires on Index's final render (home just landed in
  // context) and its navigate("/home") stomps the funnel's navigate to
  // /onboarding/profile — every new user skipped the profile questions and
  // the first-item step behind them.
  const funnelingRef = useRef(false)

  useEffect(() => {
    if (funnelingRef.current) return
    if (!user || homeLoading) return
    if (home) {
      navigate(returnTo || "/home", { replace: true })
    } else if (returnTo?.startsWith("/invite/")) {
      // New user accepting an invite — skip home creation, go to invite page
      navigate(returnTo, { replace: true })
    }
  }, [user, home, homeLoading, navigate, returnTo])

  if (authLoading || (user && homeLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-busy="true" aria-label="Loading">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Landing />
  }

  // A FAILED home lookup is not "no home" — never route to onboarding here, or a
  // transient error mints a duplicate home (the launch-day incident).
  if (homeError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md mx-auto text-center">
          <h1 className="text-2xl font-display font-normal mb-2">We couldn't load your home</h1>
          <p className="text-muted-foreground mb-6">
            Something went wrong while looking up your account. Check your connection and try again.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (!home) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <HomeOnboarding
          onComplete={async (homeId) => {
            funnelingRef.current = true
            // Pass the created home's id: refresh() polls until the members
            // collection-group query can actually see it (HomeProvider.load).
            await refresh(homeId)
            navigate("/onboarding/profile", { replace: true })
          }}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  )
}
