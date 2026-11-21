/**
 * The home's cleaning guides, read ONCE per home and shared.
 *
 * Tasks → Cleaning shows them in two places: the count under the "Tasks" title
 * ("N cleaning guides" — in BOTH trees, phone and desktop, which are both
 * mounted) and the guides list itself (CleaningView, mounted once). One SWR key
 * per home means one read for all three.
 *
 * THROWS on a failed read, so a failure is a visible "Couldn't load your
 * cleaning guides." — never "No cleaning guides yet" about a list never read
 * (audit H6).
 */
import useSWR from "swr"
import { getDeepCleanGuides, type DeepCleanGuide } from "@/lib/cleanSession"
import { LOAD_TIMEOUT_MS, withTimeout } from "@/lib/withTimeout"

const TIMED_OUT = "Loading your cleaning guides timed out. Check your connection and try again."

export function cleaningGuidesKey(homeId: string): string {
  return `clean-guides:${homeId}`
}

export function useCleaningGuides(homeId: string | null, enabled = true) {
  const key = homeId && enabled ? cleaningGuidesKey(homeId) : null
  const { data, error, isValidating, mutate } = useSWR<DeepCleanGuide[], Error>(
    key,
    () => withTimeout(getDeepCleanGuides(homeId!), LOAD_TIMEOUT_MS, TIMED_OUT),
    {
      dedupingInterval: 5000,
      // Never another home's guides under this home's name.
      keepPreviousData: false,
      onError: (e) => console.warn(`[clean] could not load cleaning guides for home ${homeId}:`, e.message),
    },
  )
  return {
    /** The guides; `undefined` until a read has answered. */
    guides: data,
    /** The read failed and no retry is under way. */
    failed: error !== undefined && !isValidating,
    /** Nothing to show yet: the first read, or a retry after a failure. */
    loading: key !== null && data === undefined && (error === undefined || isValidating),
    retry: () => void mutate(),
  }
}
