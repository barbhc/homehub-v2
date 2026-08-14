import { useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { claimDeepLink, DEEP_LINK_EVENT } from "@/lib/pushDeepLink"

/**
 * Follows a notification tap once the router exists.
 *
 * Handles both orders: a COLD start, where the tap is parked before React
 * mounts and is claimed here on the first render, and a WARM tap, where the
 * event arrives while the app is already open.
 */
export function usePushDeepLink(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const pending = claimDeepLink()
    if (pending) navigate(pending)

    const onLink = () => {
      const path = claimDeepLink()
      if (path) navigate(path)
    }
    window.addEventListener(DEEP_LINK_EVENT, onLink)
    return () => window.removeEventListener(DEEP_LINK_EVENT, onLink)
  }, [navigate])
}
