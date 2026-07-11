import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/modules/auth"
import { getPreference, setPreference, PREF_DASHBOARD_TIERS } from "@/lib/userPreferences"
import { DEFAULT_TIER_FILTER, type TierFilter } from "@/lib/dashboard"

export function useTierFilter() {
  const { user } = useAuth()
  const [tierFilter, setTierFilterState] = useState<TierFilter>(DEFAULT_TIER_FILTER)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false

    getPreference<TierFilter>(user.id, PREF_DASHBOARD_TIERS)
      .then((saved) => {
        if (!cancelled && saved) setTierFilterState(saved)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [user?.id])

  const setTierFilter = useCallback(
    (next: TierFilter) => {
      // Prevent disabling all tiers
      if (!next.essential && !next.recommended && !next.optional) return

      setTierFilterState(next)

      if (user?.id) {
        setPreference(user.id, PREF_DASHBOARD_TIERS, next).catch(() => {})
      }
    },
    [user?.id]
  )

  return { tierFilter, setTierFilter, isLoading }
}
