import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LockIcon, EyeIcon, EyeOffIcon, CheckIcon, MailCheckIcon, AlertCircleIcon } from "lucide-react"
import { verifyPasswordResetCode, confirmPasswordReset, isSignInWithEmailLink } from "firebase/auth"
import { auth } from "@/integrations/firebase"
import { useAuth } from "@/modules/auth"
import { AuthScreen, AuthCTA, AUTH } from "@/modules/auth/components/authUi"

/** Password field with reveal toggle, matching the auth mockup's AuthInput. */
function PwField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <div className="mb-[7px] px-0.5 text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: AUTH.sub }}>{label}</div>
      <div className="flex items-center gap-2.5 rounded-xl px-3 bg-white" style={{ border: `1px solid ${AUTH.line}` }}>
        <LockIcon size={16} className="shrink-0" style={{ color: AUTH.faint }} />
        <input
          type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={label} autoComplete="new-password" minLength={8}
          className="flex-1 min-w-0 border-none outline-none bg-transparent py-[13px] text-[15px]" style={{ color: AUTH.ink }}
        />
        <button type="button" onClick={() => setShow((v) => !v)} className="shrink-0 p-1" style={{ color: AUTH.faint }} aria-label={show ? "Hide password" : "Show password"}>
          {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
        </button>
      </div>
    </div>
  )
}

/**
 * Explicit phases replace the old `ready` boolean, whose failure paths (no
 * oobCode, or verifyPasswordResetCode rejecting) left the page stuck on
 * "Verifying your link…" forever with the error never rendered.
 *
 * "signin-handoff" exists because Firebase uses ONE email-action URL for every
 * template — pointing the reset template here means magic SIGN-IN links land
 * here too (mode=signIn). AuthProvider (mounted above the router) completes
 * those itself; this page just waits for the session and forwards home.
 */
type Phase = "verifying" | "form" | "done" | "signin-handoff" | "link-error"

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { user } = useAuth()
  // Firebase's action link lands here with ?mode=resetPassword|signIn&oobCode=…
  const oobCode = params.get("oobCode")
  const mode = params.get("mode")
  const isSignInLink = mode === "signIn" || isSignInWithEmailLink(auth, window.location.href)

  const [phase, setPhase] = useState<Phase>(() => {
    if (isSignInLink) return "signin-handoff"
    if (!oobCode) return "link-error"
    return "verifying"
  })
  const [linkError, setLinkError] = useState<string>(
    !isSignInLink && !oobCode ? "This reset link is incomplete or has expired." : ""
  )
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Reset-code verification (proves the link is real and unexpired before the form).
  useEffect(() => {
    if (phase !== "verifying" || !oobCode) return
    let cancelled = false
    void verifyPasswordResetCode(auth, oobCode)
      .then(() => { if (!cancelled) setPhase("form") })
      .catch(() => {
        if (!cancelled) {
          setLinkError("This reset link is invalid or has expired.")
          setPhase("link-error")
        }
      })
    return () => { cancelled = true }
  }, [phase, oobCode])

  // Sign-in handoff: AuthProvider completes the email link; when the session
  // appears, go home. If nothing happens in 10s the link was bad/consumed.
  useEffect(() => {
    if (phase !== "signin-handoff") return
    if (user) {
      navigate("/", { replace: true })
      return
    }
    const timer = setTimeout(() => {
      setLinkError("This sign-in link is invalid or has expired.")
      setPhase("link-error")
    }, 10_000)
    return () => clearTimeout(timer)
  }, [phase, user, navigate])

  const match = password.length >= 8 && password === confirm

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!match) { setError("Passwords don't match yet."); return }
    if (!oobCode) { setError("This reset link is invalid or has expired."); return }
    setLoading(true)
    try {
      await confirmPasswordReset(auth, oobCode, password)
      setLoading(false)
      setPhase("done")
      setTimeout(() => navigate("/signin"), 1800)
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : "Couldn't update your password.")
    }
  }

  if (phase === "done") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--hh-teal-wash)" }}>
            <CheckIcon size={32} style={{ color: AUTH.teal }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>Password updated</h1>
          <p className="text-[15px] mt-2" style={{ color: AUTH.sub }}>Taking you home…</p>
        </div>
      </AuthScreen>
    )
  }

  if (phase === "link-error") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--hh-teal-wash)" }}>
            <AlertCircleIcon size={32} style={{ color: AUTH.gold }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>That link didn't work</h1>
          <p className="text-[15px] mt-2 max-w-[300px]" style={{ color: AUTH.sub }}>{linkError}</p>
          <div className="mt-6 flex flex-col items-center gap-3 w-full max-w-[280px]">
            <AuthCTA type="button" onClick={() => navigate("/reset")}>Request a new link</AuthCTA>
            <button type="button" onClick={() => navigate("/signin")} className="text-sm underline underline-offset-2" style={{ color: AUTH.sub }}>
              Back to sign in
            </button>
          </div>
        </div>
      </AuthScreen>
    )
  }

  if (phase === "signin-handoff") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center" aria-busy="true">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--hh-teal-wash)" }}>
            <MailCheckIcon size={32} style={{ color: AUTH.teal }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>Finishing sign-in…</h1>
          <p className="text-[15px] mt-2 max-w-[280px]" style={{ color: AUTH.sub }}>One moment while we confirm your link.</p>
        </div>
      </AuthScreen>
    )
  }

  if (phase === "verifying") {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center" aria-busy="true">
          <div className="flex items-center justify-center mb-[18px]" style={{ width: 74, height: 74, borderRadius: "50%", background: "var(--hh-teal-wash)" }}>
            <MailCheckIcon size={32} style={{ color: AUTH.teal }} />
          </div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>Verifying your link…</h1>
          <p className="text-[15px] mt-2 max-w-[280px]" style={{ color: AUTH.sub }}>
            Open this page from the reset email so we can confirm it's you.
          </p>
        </div>
      </AuthScreen>
    )
  }

  return (
    <AuthScreen>
      <div className="mb-6">
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: AUTH.ink }}>Set a new password</h1>
        <p className="text-sm mt-1.5" style={{ color: AUTH.sub }}>Pick something you'll remember — at least 8 characters.</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <PwField label="New password" value={password} onChange={setPassword} />
        <PwField label="Confirm password" value={confirm} onChange={setConfirm} />
        {confirm.length > 0 && !match && (
          <p className="text-[12.5px] -mt-1 pl-0.5" style={{ color: AUTH.gold }}>Passwords don't match yet.</p>
        )}
        {error && <p className="text-sm" style={{ color: AUTH.gold }}>{error}</p>}
        <AuthCTA type="submit" disabled={!match || loading}>
          <CheckIcon size={18} /> {loading ? "Updating…" : "Update password"}
        </AuthCTA>
      </form>
    </AuthScreen>
  )
}
