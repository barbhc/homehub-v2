import { useEffect, useState } from "react"
import { getDevToolsEnabled } from "@/lib/userPreferences"

/** `loading` until the prefs doc answers; `off` for everyone it does not say `dev_tools: true` for. */
export type DevTools = "loading" | "on" | "off"

/**
 * Whether this person sees Settings' internal tools (startup diagnostics, admin
 * tools, the manuals list): only when their prefs doc says `dev_tools: true`,
 * which is set by hand and never in the app.
 *
 * The answer is held with the uid it was read for, so a different sign-in
 * never inherits it. A read that fails answers `off`, the safe answer for
 * everyone, and is logged so a tester who expects the tools can see why they
 * are missing.
 */
export function useDevTools(userId: string | undefined): DevTools {
  const [read, setRead] = useState<{ uid: string; on: boolean } | null>(null)
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    getDevToolsEnabled(userId).then(
      (on) => {
        if (!cancelled) setRead({ uid: userId, on })
      },
      (e: unknown) => {
        console.warn(`[settings] could not read dev_tools for ${userId}:`, e instanceof Error ? e.message : e)
        if (!cancelled) setRead({ uid: userId, on: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId])
  if (!userId) return "off"
  if (!read || read.uid !== userId) return "loading"
  return read.on ? "on" : "off"
}
