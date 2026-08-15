import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { SparklesIcon, XIcon } from "lucide-react"
import { useAuth } from "@/modules/auth"
import { dismissProfileBanner, getDismissedProfileBanners } from "@/lib/userPreferences"

/**
 * Soft gate for existing users whose home profile is incomplete.
 *
 * The dismissal is kept on the SERVER, per home. It used to live only in
 * localStorage, and the owner reported the banner reappearing after she had
 * dismissed it — anything that clears WebView storage (a data reset, a quota
 * write that failed into the catch, a reinstall) silently un-answered a
 * question she had already answered, and the app went back to nagging.
 *
 * localStorage is still written, but only as a fast local mirror so the banner
 * does not flash on the next cold start while the server value loads. The
 * server is the truth; the mirror is an optimisation.
 */
const MIRROR_PREFIX = "homehub:profile_banner_dismissed:"

export function ProfileCompletionBanner({ homeId }: { homeId: string }) {
  const { user } = useAuth()
  const mirrorKey = `${MIRROR_PREFIX}${homeId}`

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(mirrorKey) === "1"
    } catch {
      return false
    }
  })

  // Confirm against the server. A dismissal made on another device, or one whose
  // local mirror has been wiped, still counts.
  useEffect(() => {
    const uid = user?.id
    if (!uid || dismissed) return
    let cancelled = false
    void getDismissedProfileBanners(uid)
      .then((ids) => {
        if (cancelled || !ids.includes(homeId)) return
        setDismissed(true)
        try { window.localStorage.setItem(mirrorKey, "1") } catch { /* mirror is optional */ }
      })
      .catch(() => {
        /* a nag we cannot verify is better than a crash — leave it showing */
      })
    return () => { cancelled = true }
  }, [user?.id, homeId, dismissed, mirrorKey])

  if (dismissed) return null

  const handleDismiss = () => {
    setDismissed(true)
    try { window.localStorage.setItem(mirrorKey, "1") } catch { /* mirror is optional */ }
    // The write that actually matters. Fire-and-forget: the banner is already
    // gone locally, and a failed write means it returns next launch — annoying,
    // never wrong.
    if (user?.id) void dismissProfileBanner(user.id, homeId).catch(() => {})
  }

  return (
    <div className="mt-2 mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
          <SparklesIcon className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Finish your home profile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            A few quick questions help tailor maintenance reminders, warranty tracking, and the
            assistant to your home.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/onboarding/profile"
              className="inline-flex items-center rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground min-h-11"
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
          aria-label="Dismiss"
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
