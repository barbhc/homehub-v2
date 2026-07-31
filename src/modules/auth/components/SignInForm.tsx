import { useState } from "react"
import { Link } from "react-router-dom"
import {
  HouseIcon,
  MailIcon,
  LockIcon,
  UserIcon,
  EyeIcon,
  EyeOffIcon,
  WandSparklesIcon,
  ChevronLeftIcon,
} from "lucide-react"
import { useAuth, APPLE_REDIRECT_ERROR_KEY } from "./AuthProvider"
import { cn } from "@/lib/utils"

/** An Apple redirect sign-in (native shell) reports failures on the return load,
 *  not inline — pick up any stashed message once and clear it. */
function takeAppleRedirectError(): string | null {
  const stashed = window.sessionStorage.getItem(APPLE_REDIRECT_ERROR_KEY)
  if (stashed) window.sessionStorage.removeItem(APPLE_REDIRECT_ERROR_KEY)
  return stashed
}

type Mode = "signin" | "signup" | "reset"

type SignInFormProps = {
  className?: string
  /** Show the teal brand mark above the heading (mobile gate; hidden on desktop). */
  showMark?: boolean
  /** Which screen to start on (set by the route: /signin, /signup, /reset). */
  initialMode?: Mode
  /** Email handed off from the landing SignupRow → pre-fills the field. */
  prefillEmail?: string
  onSuccess?: () => void
}

const INK = "var(--hh-ink)"
const SUB = "var(--hh-sub)"
const TEAL = "var(--hh-teal)"
const FAINT = "#9AA6A2"
const LINE = "rgba(15,23,42,0.14)"

/** Teal-gradient house mark from the auth mockup (hh-auth.jsx · AuthMark). */
function AuthMark({ className }: { className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        width: 60,
        height: 60,
        borderRadius: 17,
        background: "linear-gradient(150deg,#1B6B5A,#2D9B82)",
        boxShadow: "0 8px 22px rgba(27,107,90,0.22)",
      }}
    >
      <HouseIcon size={28} strokeWidth={1.8} className="text-white" />
    </div>
  )
}

/** The real Apple wordmark (lucide's `apple` is a fruit, not the brand). */
function AppleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" className="block">
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.23 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.76-4.16zM14.6 4.59c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44z" />
    </svg>
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
        <span className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>
          {label}
        </span>
        {right}
      </div>
      <div
        className="flex items-center gap-2.5 rounded-xl px-3 bg-white"
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
          className="flex-1 min-w-0 border-none outline-none bg-transparent py-[13px] text-[15px]"
          style={{ color: INK }}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="shrink-0 p-1"
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

/** Apple SSO goes live once the Supabase Apple provider is configured; until
 *  then the button shows disabled. Flip VITE_APPLE_SIGNIN_ENABLED=true (Vercel
 *  env) after completing the config in design/apple-signin-scope.md. */
const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN_ENABLED === "true"

export function SignInForm({ className, showMark, initialMode = "signin", prefillEmail, onSuccess }: SignInFormProps) {
  const { signIn, signUp, resetPassword, signInWithMagicLink, signInWithApple } = useAuth()
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
        if (err) { setError(err.message); return }
        setMessage("Check your email for a password reset link.")
        return
      }
      if (mode === "signin") {
        const { error: err } = await signIn(email, password)
        if (err) { setError(err.message); return }
        onSuccess?.()
        return
      }
      const { error: err } = await signUp(email, password, name)
      if (err) { setError(err.message); return }
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
      if (err) { setError(err.message); setLoading(false) }
      // On success the browser redirects to Apple; no further UI needed.
    } catch {
      setError("Couldn't start Apple sign-in. Please try again.")
      setLoading(false)
    }
  }

  const handleMagicLink = async () => {
    if (loading) return
    reset()
    if (!email.trim()) { setError("Enter your email first, then tap the magic link."); return }
    setLoading(true)
    try {
      const { error: err } = await signInWithMagicLink(email)
      if (err) { setError(err.message); return }
      setMessage(`We emailed a magic sign-in link to ${email}.`)
    } catch {
      setError("Couldn't send the link. Please try again.")
    } finally {
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
          className="inline-flex items-center gap-1 mb-3 -ml-1 font-semibold text-[15px]"
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
            right={mode === "signin" ? (
              <button
                type="button" onClick={() => go("reset")}
                className="font-bold text-[12.5px]" style={{ color: TEAL }}
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
          className="w-full rounded-[14px] py-[15px] text-[15px] font-bold text-white transition-opacity disabled:opacity-70"
          style={{ background: TEAL }}
        >
          {ctaLabel}
        </button>
      </form>

      {mode !== "reset" && (
        <>
          <div className="flex items-center gap-2.5 my-4">
            <div className="flex-1 h-px" style={{ background: "rgba(15,23,42,0.10)" }} />
            <span className="text-xs font-semibold" style={{ color: SUB }}>or</span>
            <div className="flex-1 h-px" style={{ background: "rgba(15,23,42,0.10)" }} />
          </div>

          {/* Apple SSO — live once the Supabase Apple provider is configured
              (VITE_APPLE_SIGNIN_ENABLED=true); disabled "coming soon" until then. */}
          {APPLE_ENABLED ? (
            <button
              type="button" onClick={handleApple} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-[14px] py-[14px] text-[15px] font-bold text-white bg-black disabled:opacity-70"
            >
              <AppleLogo size={18} /> {mode === "signup" ? "Sign up with Apple" : "Continue with Apple"}
            </button>
          ) : (
            <>
              <button
                type="button" disabled aria-disabled="true"
                title="Apple sign-in is coming soon"
                className="w-full inline-flex items-center justify-center gap-2.5 rounded-[14px] py-[14px] text-[15px] font-bold text-white bg-black opacity-50 cursor-not-allowed"
              >
                <AppleLogo size={18} /> {mode === "signup" ? "Sign up with Apple" : "Continue with Apple"}
              </button>
              <p className="text-center text-[11px] mt-1.5" style={{ color: FAINT }}>Apple sign-in coming soon</p>
            </>
          )}

          {/* Magic link is a sign-in convenience only (mockup: sign-in screen). */}
          {mode === "signin" && (
            <button
              type="button" onClick={handleMagicLink} disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2.5 rounded-[14px] py-[14px] mt-3 text-[15px] font-bold bg-white disabled:opacity-70"
              style={{ color: INK, border: `1.5px solid ${LINE}` }}
            >
              <WandSparklesIcon size={17} style={{ color: TEAL }} /> Email me a magic link
            </button>
          )}

          {mode === "signup" && (
            <p className="text-center text-[12.5px] leading-relaxed mt-2.5 px-2" style={{ color: SUB }}>
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
            <button type="button" onClick={() => go("signin")} className="font-bold" style={{ color: TEAL }}>Sign in</button>
          </>
        ) : mode === "signin" ? (
          <>New to Homehub?{" "}
            <button type="button" onClick={() => go("signup")} className="font-bold" style={{ color: TEAL }}>Create an account</button>
          </>
        ) : null}
      </div>
    </div>
  )
}
