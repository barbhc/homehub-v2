import { Navigate, useLocation } from "react-router-dom"
import { useAuth } from "./AuthProvider"

type AuthGateProps = {
  children: React.ReactNode
}

/**
 * Redirects to / if not authenticated. Use to protect routes that require login.
 */
export function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <>{children}</>
}
