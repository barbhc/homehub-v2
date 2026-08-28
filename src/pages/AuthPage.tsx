import { Navigate, useLocation } from "react-router-dom"
import { SignInForm, useAuth } from "@/modules/auth"

type AuthMode = "signin" | "signup" | "reset"

const MODE_BY_PATH: Record<string, AuthMode> = {
  "/signin": "signin",
  "/signup": "signup",
  "/reset": "reset",
}

export default function AuthPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const initialMode = MODE_BY_PATH[location.pathname] ?? "signin"
  const prefillEmail = (location.state as { email?: string } | null)?.email

  // After auth, return to an internal page if one was requested (e.g. an invite
  // link sent the user here). Only same-site paths — guard against open redirect.
  const rawReturn = new URLSearchParams(location.search).get("returnTo")
  const returnTo = rawReturn && rawReturn.startsWith("/") && !rawReturn.startsWith("//") ? rawReturn : null

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: "var(--hh-bg)" }}>
        <p style={{ color: "var(--hh-sub)" }}>Loading…</p>
      </div>
    )
  }
  if (user) return <Navigate to={returnTo ?? "/"} replace />

  return (
    <div
      className="min-h-[100dvh] flex flex-col items-center justify-center px-6"
      style={{
        background: "var(--hh-bg)",
        // Clear the status bar / home indicator (env is 0 in a browser, where the
        // 40px base gives normal breathing room; a notched PWA gets the inset).
        paddingTop: "max(env(safe-area-inset-top), 40px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 40px)",
      }}
    >
      <SignInForm showMark initialMode={initialMode} prefillEmail={prefillEmail} className="mx-auto" />
    </div>
  )
}
