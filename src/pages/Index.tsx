import { useEffect } from "react"
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
  const { home, loading: homeLoading, refresh } = useCurrentHome()

  const returnTo = searchParams.get("returnTo")

  useEffect(() => {
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

  if (!home) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
        <HomeOnboarding
          onComplete={async () => {
            await refresh()
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
