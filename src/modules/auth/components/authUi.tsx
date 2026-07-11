import { HouseIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Shared pre-login visual primitives — the calm teal token system from the
// hh-auth mockup, reused across SignInForm, AcceptInvite, ResetPassword, and
// NotFound so every pre-login screen is consistent.

export const AUTH = {
  ink: "var(--hh-ink)",
  sub: "var(--hh-sub)",
  teal: "var(--hh-teal)",
  faint: "#9AA6A2",
  line: "rgba(15,23,42,0.14)",
  bg: "var(--hh-bg)",
  /** Validation/mismatch tone — gold, never red (redesign non-negotiable). */
  gold: "#B4791F",
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
        background: "linear-gradient(150deg,#1B6B5A,#2D9B82)",
        boxShadow: "0 8px 22px rgba(27,107,90,0.22)",
      }}
    >
      <HouseIcon size={size * 0.46} strokeWidth={1.8} className="text-white" />
    </div>
  )
}

/** Full-screen centered shell on the page background, no nav chrome. */
export function AuthScreen({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn("min-h-[100dvh] flex flex-col items-center justify-center px-6 py-12", className)}
      style={{ background: AUTH.bg }}
    >
      <div className="w-full max-w-sm">{children}</div>
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
      style={{ background: disabled ? "#C9D4D0" : AUTH.teal }}
    >
      {children}
    </button>
  )
}
