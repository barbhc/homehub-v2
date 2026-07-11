import { useEffect } from "react"
import { getInterfaceOverride, setInterfaceOverride } from "@/lib/interfaceLevel"
import { getInterfaceLevelPref } from "@/lib/userPreferences"

/**
 * Hydrates the localStorage interface-level cache from the user's persisted
 * preference (Phase 5) once per session. The localStorage value is the
 * synchronous source the UI reads (so it never flashes); this brings it in
 * line with the cross-device choice when they differ.
 *
 * If the user has no stored preference, we leave the local cache untouched —
 * the derived level remains the first-run default. Persisting on *change* is
 * handled where the user has a userId in hand (InterfaceLevelSection).
 *
 * Mount once near the app root (AppLayout).
 */
export function useInterfaceLevelSync(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    // Snapshot the cache before the async read so we never clobber a choice the
    // user makes *while* we're fetching: if the local value changed in the
    // meantime, the user's click wins and we leave it alone.
    const before = getInterfaceOverride()
    getInterfaceLevelPref(userId)
      .then((level) => {
        if (cancelled || !level) return
        if (getInterfaceOverride() !== before) return
        if (level !== before) setInterfaceOverride(level)
      })
      .catch(() => {
        /* non-fatal: fall back to the localStorage cache / derived default */
      })
    return () => {
      cancelled = true
    }
  }, [userId])
}
