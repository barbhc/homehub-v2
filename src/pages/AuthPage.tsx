import { useState, type FormEvent } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { SignInForm, useAuth } from "@/modules/auth"
import { AuthMark, AuthCTA, AUTH } from "@/modules/auth/components/authUi"

type AuthMode = "signin" | "signup" | "reset"

const MODE_BY_PATH: Record<string, AuthMode> = {
  "/signin": "signin",
  "/signup": "signup",
  "/reset": "reset",
}

/**
 * Confirm-email form shown when a magic sign-in link is opened on a different
 * device (or with cleared storage): Firebase can't recover the email from the
 * link, so AuthProvider stashes the link and sends the user here. Replaces the
 * old window.prompt (blocked by some browsers, poor UX).
 */
function CompleteLinkForm() {
  const { completeMagicLink } = useAuth()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || busy) return
    setBusy(true)
    setError(null)
    const res = await completeMagicLink(email.trim())
    // On success, onAuthStateChanged sets the user and AuthPage redirects to "/".
    if (res.error) {
      setError(res.error.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-[340px] mx-auto flex flex-col items-center text-center">
      <AuthMark />
      <h1 className="font-display text-2xl font-extrabold tracking-tight mt-5" style={{ color: AUTH.ink }}>
        Finish signing in
      </h1>
      <p className="text-[15px] leading-relaxed mt-2" style={{ color: AUTH.sub }}>
        Confirm the email you used, and we'll complete your sign-in link.
      </p>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        autoFocus
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email"
        className="mt-6 w-full rounded-[14px] px-4 py-3 text-[15px] outline-none"
        style={{ border: `1px solid ${AUTH.line}`, background: "#fff", color: AUTH.ink }}
      />
      {error && (
        <p className="mt-2 text-[13.5px]" role="alert" style={{ color: AUTH.gold }}>
          {error}
        </p>
      )}
      <div className="mt-5 w-full">
        <AuthCTA type="submit" disabled={busy}>{busy ? "Signing in…" : "Continue"}</AuthCTA>
      </div>
    </form>
  )
}

/**
 * Pre-login auth route (/signin, /signup, /reset). Renders the centered auth
 * card per the hh-auth mockup. The initial screen is derived from the path
 * (kept prop-free so it composes with lazyWithRetry). Already-authenticated
 * users are bounced to "/" (which routes them on to /home or onboarding). The
 * landing SignupRow hands off a pre-filled email via location state.
 */
export default function AuthPage() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const initialMode = MODE_BY_PATH[location.pathname] ?? "signin"
  const prefillEmail = (location.state as { email?: string } | null)?.email
  const completeLink = new URLSearchParams(location.search).get("completeLink") === "1"

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
      {completeLink ? (
        <CompleteLinkForm />
      ) : (
        <SignInForm showMark initialMode={initialMode} prefillEmail={prefillEmail} className="mx-auto" />
      )}
    </div>
  )
}
