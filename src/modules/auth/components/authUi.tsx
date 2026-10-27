import { HouseIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared pre-login visual primitives — the calm teal token system from the
// hh-auth mockup, reused across SignInForm, AcceptInvite, ResetPassword, and
// NotFound so every pre-login screen is consistent.

export const AUTH = {
  ink: "var(--hh-ink)",
  sub: "var(--hh-sub)",
  teal: "var(--hh-teal)",
  faint: "var(--hh-faint)",
  line: "var(--hh-line-input)",
  bg: "var(--hh-bg)",
  /** Validation/mismatch tone — gold, never red (redesign non-negotiable). */
  gold: "var(--hh-gold)",
} as const

/** Teal-gradient house brand mark (hh-auth.jsx · AuthMark). */
export function AuthMark({ size = 60, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        background: "var(--hh-mark)",
        boxShadow: "0 8px 22px rgba(27,107,90,0.22)",
      }}
    >
      <HouseIcon size={size * 0.46} strokeWidth={1.8} style={{ color: "var(--hh-on-fill)" }} />
    </div>
  )
}

/**
 * Full-screen centered shell on the page background, no nav chrome.
 *
 * Nothing above it clears the status bar, so it does: `pt-safe-screen` is the
 * same safe-area rule the app shell uses (index.css — the inset, or the 44px
 * native/standalone fallback when WebKit reports 0), kept at every width, and
 * the bottom clears the home indicator. The py-12 breathing room sits INSIDE
 * that, so in a browser (inset 0) the screen is exactly as it was.
 */
export function AuthScreen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("min-h-[100dvh] flex flex-col pt-safe-screen pb-[env(safe-area-inset-bottom)]", className)}
      style={{ background: AUTH.bg }}
    >
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}

/** Primary teal CTA. */
export function AuthCTA({
  children, onClick, type = "button", disabled, className,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: "button" | "submit"
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      className={cn(
        "w-full inline-flex items-center justify-center gap-2 rounded-[14px] py-[15px] text-[15px] font-bold text-white transition-opacity",
        className,
      )}
      style={{ background: disabled ? "var(--hh-fill-disabled)" : "var(--hh-teal-fill)" }}
    >
      {children}
    </button>
  )
}
