import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { LockIcon, EyeIcon, EyeOffIcon, CheckIcon, MailCheckIcon } from "lucide-react"
import { verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth"
import { auth } from "@/integrations/firebase"
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

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  // Firebase's password-reset link lands here with ?mode=resetPassword&oobCode=…
  // (set the Auth email action handler to this page in the console).
  const oobCode = params.get("oobCode")
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    // Validate the one-time code before showing the form (proves the link is real
    // and unexpired). No sign-in happens — confirmPasswordReset uses the code directly.
    if (!oobCode) return
    let cancelled = false
    void verifyPasswordResetCode(auth, oobCode)
      .then(() => { if (!cancelled) setReady(true) })
      .catch(() => { if (!cancelled) setError("This reset link is invalid or has expired.") })
    return () => { cancelled = true }
  }, [oobCode])

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
      setDone(true)
      setTimeout(() => navigate("/signin"), 1800)
    } catch (err) {
      setLoading(false)
      setError(err instanceof Error ? err.message : "Couldn't update your password.")
    }
  }

  if (done) {
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

  if (!ready) {
    return (
      <AuthScreen>
        <div className="flex flex-col items-center text-center">
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
