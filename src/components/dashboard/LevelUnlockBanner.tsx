import { useState, useEffect } from "react"
import { SparklesIcon, XIcon } from "lucide-react"
import type { UserLevel } from "@/hooks/useUserLevel"

const SEEN_KEY = "homehub:level-seen"
const RANK: Record<UserLevel, number> = { essentials: 0, engaged: 1, power: 2 }

// Only levels that actually unlock new surfaces get a celebratory notice.
const UNLOCK_COPY: Partial<Record<UserLevel, string>> = {
  engaged:
    "Your home's growing — the full Tasks view (filters + calendar), Deep Clean, and the Fix tools are now unlocked.",
  power:
    "You're a power user now — bulk actions and the admin tools are unlocked.",
}

/**
 * Progressive-complexity unlock notice (Phase B). Shows once when the user's
 * auto-derived level rises past what they've seen before — so growing into more
 * capability feels rewarding rather than features silently appearing. Tracks the
 * highest-seen level in localStorage. `derivedLevel` (not the override-effective
 * level) drives it, so choosing "Simple" doesn't suppress real progress.
 */
export function LevelUnlockBanner({ derivedLevel }: { derivedLevel: UserLevel | null }) {
  const [reached, setReached] = useState<UserLevel | null>(null)

  useEffect(() => {
    if (!derivedLevel) return
    const seen = (window.localStorage.getItem(SEEN_KEY) as UserLevel | null) ?? "essentials"
    if (RANK[derivedLevel] > RANK[seen] && UNLOCK_COPY[derivedLevel]) {
      setReached(derivedLevel)
    }
  }, [derivedLevel])

  function dismiss() {
    if (derivedLevel) window.localStorage.setItem(SEEN_KEY, derivedLevel)
    setReached(null)
  }

  if (!reached) return null

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start gap-3">
        <SparklesIcon className="size-4 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">New features unlocked</p>
          <p className="text-xs text-muted-foreground mt-0.5">{UNLOCK_COPY[reached]}</p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Dismiss"
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  )
}
