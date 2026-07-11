import { useState } from "react"
import { Link } from "react-router-dom"
import { SparklesIcon, XIcon } from "lucide-react"

/**
 * Soft gate for existing users: if their home_profile is missing or
 * incomplete (no completed_at), nudge them to finish it. Dismissible per-home
 * so repeated visits after dismissal don't nag.
 *
 * Not a hard gate — Arc 4's profile values gracefully default when absent, so
 * we don't want to block the dashboard on this. The banner re-appears if the
 * user clears localStorage, which is fine.
 */
const DISMISS_KEY_PREFIX = "homehub:profile_banner_dismissed:"

export function ProfileCompletionBanner({ homeId }: { homeId: string }) {
  const storageKey = `${DISMISS_KEY_PREFIX}${homeId}`
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(storageKey) === "1"
    } catch {
      return false
    }
  })

  if (dismissed) return null

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(storageKey, "1")
    } catch {
      // localStorage unavailable (private mode, quota); dismiss in-memory only.
    }
    setDismissed(true)
  }

  return (
    <div className="mt-2 mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
          <SparklesIcon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-display font-semibold leading-tight">
            Finish your home profile
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            A few quick questions help tailor maintenance reminders, warranty tracking, and the
            assistant to your home.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Link
              to="/onboarding/profile"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-11"
            >
              Finish profile
            </Link>
            <button
              type="button"
              onClick={handleDismiss}
              className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent min-h-11"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss profile completion banner"
          className="shrink-0 -mr-1 -mt-1 inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
