import { useEffect, useRef } from "react"
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
  /** A claimed cross-home link waiting on the homes list. Nothing renders it —
   *  it only has to last until the list settles — so it is a ref. (It was
   *  state, set in one effect to make a second effect act on it and clear it:
   *  react-hooks/set-state-in-effect.) */
  const parked = useRef<string | null>(null)

  useEffect(() => {
    /** Switch to the push's home (if it is one of yours), then go. */
    const settle = (path: string) => {
      const wanted = homeParamOf(path)
      // Only switch to a home the user actually belongs to. If it isn't in the
      // list — removed from the home, or the lookup failed — navigate anyway
      // rather than swallowing the tap: that is exactly today's behaviour, and
      // never worse than it.
      if (wanted && homes.some((h) => h.home_id === wanted)) setCurrentHome(wanted)
      navigate(path)
    }
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
      if (homesReady) settle(path)
      else parked.current = path
    }

    // A link parked while the list was loading: this run is the list settling.
    if (homesReady && parked.current) {
      const path = parked.current
      parked.current = null
      settle(path)
    }

    const pending = claimDeepLink()
    if (pending) follow(pending)

    const onLink = () => {
      const path = claimDeepLink()
      if (path) follow(path)
    }
    window.addEventListener(DEEP_LINK_EVENT, onLink)
    return () => window.removeEventListener(DEEP_LINK_EVENT, onLink)
  }, [navigate, home?.home_id, homes, homesReady, setCurrentHome])
}
