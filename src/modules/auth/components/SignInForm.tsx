import { useState } from "react"
import { Link } from "react-router-dom"
import {
  HouseIcon,
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  ChevronLeftIcon,
} from "lucide-react"
import { useAuth } from "./AuthProvider"
import { AppleButton } from "./AppleLogo"
import { takeAppleRedirectError } from "../appleRedirectError"
import { authErrorMessage } from "../authErrors"
import { cn } from "@/lib/utils"

type Mode = "signin" | "signup" | "reset"

type SignInFormProps = {
  className?: string
  /** Show the teal brand mark above the heading (mobile gate; hidden on desktop). */
  showMark?: boolean
  /** Which screen to start on (set by the route: /signin, /signup, /reset). */
  initialMode?: Mode
  /** Email handed to /signup in route state → pre-fills the field. */
  prefillEmail?: string
  onSuccess?: () => void
}

const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const TEAL = "var(--hh-teal)"
const FAINT = "var(--hh-faint)"
const LINE = "var(--hh-line-input)"

/** Teal-gradient house mark from the auth mockup (hh-auth.jsx · AuthMark). */
function AuthMark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        width: 60,
        height: 60,
        borderRadius: 17,
        background: "var(--hh-mark)",
        boxShadow: "0 8px 22px rgba(27,107,90,0.22)",
      }}
    >
      <HouseIcon size={28} strokeWidth={1.8} style={{ color: "var(--hh-on-fill)" }} />
    </div>
  )
}

/** Labeled input with a leading icon + optional password reveal, per the mockup. */
function AuthInput({
  label,
  icon: LeadIcon,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  minLength,
  maxLength,
  right,
}: {
  label: string
  icon: typeof MailIcon
  type?: "text" | "email" | "password"
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  maxLength?: number
  right?: React.ReactNode
}) {
  const [show, setShow] = useState(false)
  const isPw = type === "password"
  return (
    <div>
      <div className="flex items-baseline justify-between mb-[7px] px-0.5">
        <span className="text-[0.6875rem] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>
          {label}
        </span>
        {right}
      </div>
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 bg-[var(--hh-surface)]"
        style={{ border: `1px solid ${LINE}` }}
      >
        <LeadIcon size={16} className="shrink-0" style={{ color: FAINT }} />
        <input
          type={isPw ? (show ? "text" : "password") : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          className="flex-1 min-w-0 border-none outline-none bg-transparent py-[13px] text-[0.9375rem]"
          style={{ color: INK }}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="hit-44 shrink-0 p-1"
            style={{ color: FAINT }}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
          </button>
        )}
      </div>
    </div>
  )
}

const HEADINGS: Record<Mode, { title: string; sub: string }> = {
  signin: { title: "Welcome back", sub: "Sign in to look after your home." },
  signup: { title: "Create your account", sub: "Start keeping your home in order." },
  reset: { title: "Reset your password", sub: "Enter your email and we'll send a link to set a new one." },
}

export function SignInForm({ className, showMark, initialMode = "signin", prefillEmail, onSuccess }: SignInFormProps) {
  const { signIn, signUp, resetPassword, signInWithApple } = useAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState(prefillEmail ?? "")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(takeAppleRedirectError)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const reset = () => { setError(null); setMessage(null) }
  const go = (m: Mode) => { setMode(m); reset() }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    reset()
    setLoading(true)
    try {
      if (mode === "reset") {
        const { error: err } = await resetPassword(email)
        if (err) { setError(authErrorMessage(err)); return }
        setMessage("Check your email for a password reset link.")
        return
      }
      if (mode === "signin") {
        const { error: err } = await signIn(email, password)
        if (err) { setError(authErrorMessage(err)); return }
        onSuccess?.()
        return
      }
      const { error: err } = await signUp(email, password, name)
      if (err) { setError(authErrorMessage(err)); return }
      setMessage("Check your email to confirm your account.")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  const handleApple = async () => {
    if (loading) return
    reset()
    setLoading(true)
    try {
      const { error: err } = await signInWithApple()
      if (err) { setError(authErrorMessage(err)); setLoading(false) }
      // On success the browser redirects to Apple; no further UI needed.
    } catch {
      setError("Couldn't start Apple sign-in. Please try again.")
      setLoading(false)
    }
  }

  const heading = HEADINGS[mode]
  const ctaLabel = loading ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"

  return (
    <div className={cn("w-full max-w-sm", className)}>
      {mode === "reset" && (
        <button
          type="button"
          onClick={() => go("signin")}
          className="hit-44 inline-flex items-center gap-1 mb-3 -ml-1 font-semibold text-[0.9375rem]"
          style={{ color: TEAL }}
        >
          <ChevronLeftIcon size={20} strokeWidth={2.4} /> Sign in
        </button>
      )}

      {showMark && mode !== "reset" && (
        <AuthMark className="lg:hidden mb-5 mx-auto" />
      )}

      <div className={cn("mb-6", showMark ? "text-center lg:text-left" : "text-left")}>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: INK }}>
          {heading.title}
        </h1>
        <p className="text-sm mt-1.5" style={{ color: SUB }}>{heading.sub}</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {mode === "signup" && (
          <AuthInput
            label="Your name" icon={UserIcon} value={name} onChange={setName}
            placeholder="Your name" autoComplete="name" maxLength={100}
          />
        )}
        <AuthInput
          label="Email" icon={MailIcon} type="email" value={email} onChange={setEmail}
          placeholder="you@email.com" autoComplete="email" required
        />
        {mode !== "reset" && (
          <AuthInput
            label="Password" icon={LockIcon} type="password" value={password} onChange={setPassword}
            placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required minLength={mode === "signup" ? 8 : 6}
            // "Forgot?" grows UP into the 16px between the fields, and down
            // only to the password box: Show password sits right under it,
            // too close for two centred 44pt taps.
            right={mode === "signin" ? (
              <button
                type="button" onClick={() => go("reset")}
                className="hit-44-up font-bold text-[0.78125rem] [--hit-out:7px]" style={{ color: TEAL }}
              >
                Forgot?
              </button>
            ) : undefined}
          />
        )}

        {error && <p className="text-sm" style={{ color: "var(--hh-clay)" }}>{error}</p>}
        {message && <p className="text-sm" style={{ color: SUB }}>{message}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full rounded-[14px] py-[15px] text-[0.9375rem] font-bold text-white transition-opacity disabled:opacity-70"
          style={{ background: "var(--hh-teal-fill)" }}
        >
          {ctaLabel}
        </button>
      </form>

      {mode !== "reset" && (
        <>
          <div className="flex items-center gap-2.5 my-4">
            <div className="flex-1 h-px" style={{ background: LINE }} />
            <span className="text-xs font-semibold" style={{ color: SUB }}>or</span>
            <div className="flex-1 h-px" style={{ background: LINE }} />
          </div>

          <AppleButton onClick={() => void handleApple()} disabled={loading}
            label={mode === "signup" ? "Sign up with Apple" : "Continue with Apple"} />

          {mode === "signup" && (
            <p className="text-center text-[0.78125rem] leading-relaxed mt-2.5 px-2" style={{ color: SUB }}>
              By continuing you agree to our{" "}
              <Link to="/terms" className="underline underline-offset-2">Terms</Link> and{" "}
              <Link to="/privacy" className="underline underline-offset-2">Privacy Policy</Link>.
            </p>
          )}
        </>
      )}

      <div className="text-center text-sm mt-6" style={{ color: SUB }}>
        {mode === "signup" ? (
          <>Already have an account?{" "}
            <button type="button" onClick={() => go("signin")} className="hit-44 font-bold" style={{ color: TEAL }}>Sign in</button>
          </>
        ) : mode === "signin" ? (
          <>New to Homehub?{" "}
            <button type="button" onClick={() => go("signup")} className="hit-44 font-bold" style={{ color: TEAL }}>Create an account</button>
          </>
        ) : null}
      </div>
    </div>
  )
}
