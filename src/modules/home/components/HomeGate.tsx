import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "@/modules/auth"
import { useCurrentHome } from "./HomeProvider"

/**
 * Redirects to / when authenticated but no home selected.
 */
export function HomeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { home, loading } = useCurrentHome()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" aria-busy="true" aria-label="Loading">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!home) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
