import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { claimDeepLink, DEEP_LINK_EVENT } from "@/lib/pushDeepLink"
import { useCurrentHome } from "@/modules/home"

/** The home a push is about, if it named one. */
function homeParamOf(path: string): string | null {
  const q = path.indexOf("?")
  if (q === -1) return null
  return new URLSearchParams(path.slice(q + 1)).get("home")
}

/**
 * Follows a notification tap once the router exists.
 *
 * Handles both orders: a COLD start, where the tap is parked before React
 * mounts and is claimed here on the first render, and a WARM tap, where the
 * event arrives while the app is already open.
 *
 * Since a user can belong to more than one home, a push also names the home it
 * came from. Tapping a reminder about the second home while the first is
 * selected used to open a task the current home doesn't contain — a dead end
 * that looked like a bug in the notification. So: CLAIM the link immediately
 * (claiming is what makes a tap follow-once), then hold it until we know which
 * homes exist, switch if the push points elsewhere, and navigate.
 *
 * `setCurrentHome` is synchronous, so React batches the switch with the
 * navigation and the destination mounts already seeing the right home.
 */
export function usePushDeepLink(): void {
  const navigate = useNavigate()
  const { home, homes, homesReady, setCurrentHome } = useCurrentHome()
  /** A claimed link waiting on the homes list. */
  const [pendingCrossHome, setPendingCrossHome] = useState<string | null>(null)

  useEffect(() => {
    const follow = (path: string) => {
      const wanted = homeParamOf(path)
      // No home named (a legacy push), or it's the home already selected:
      // nothing to wait for. This is the common case and stays instant.
      if (!wanted || wanted === home?.home_id) {
        navigate(path)
        return
      }
      // Another home. Hold until the memberships have settled — switching
      // against a list we haven't loaded would just miss.
      setPendingCrossHome(path)
    }

    const pending = claimDeepLink()
    if (pending) follow(pending)

    const onLink = () => {
      const path = claimDeepLink()
      if (path) follow(path)
    }
    window.addEventListener(DEEP_LINK_EVENT, onLink)
    return () => window.removeEventListener(DEEP_LINK_EVENT, onLink)
  }, [navigate, home?.home_id])

  useEffect(() => {
    if (!pendingCrossHome || !homesReady) return
    const wanted = homeParamOf(pendingCrossHome)
    // Only switch to a home the user actually belongs to. If it isn't in the
    // list — removed from the home, or the lookup failed — navigate anyway
    // rather than swallowing the tap: that is exactly today's behaviour, and
    // never worse than it.
    if (wanted && homes.some((h) => h.home_id === wanted)) setCurrentHome(wanted)
    navigate(pendingCrossHome)
    setPendingCrossHome(null)
  }, [pendingCrossHome, homesReady, homes, setCurrentHome, navigate])
}
