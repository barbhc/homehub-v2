import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Whether an answer is still for what is on screen — so a late reply for a
 * home (or item) the person has since left lands nowhere.
 *
 * A read starts for one key and its answer arrives whenever the network says.
 * If the person switched homes in between, applying it paints the old home's
 * members, rooms or history on the new home's screen. So a read keeps the key
 * it asked for, and checks it when the answer arrives:
 *
 *     const isCurrentHome = useIsCurrent(homeId)
 *     …
 *     const res = await readRooms(homeId)
 *     if (isCurrentHome(homeId)) applyRooms(res)
 *
 * `isCurrent(key)` is true while `key` is what the component last rendered
 * with and it is still mounted.
 *
 * This is for reads that can start OUTSIDE the effect that owns them: Try
 * again, the re-read after an add, a callback held by an older render. A read
 * made only by one effect is guarded by that effect's own cleanup
 * (`let cancelled = false … return () => { cancelled = true }`), the pattern
 * used across the app — which cannot reach the others. A stale read should
 * also check before it STARTS when it shows a spinner: one started for a home
 * already left would otherwise leave that spinner on the next home, with its
 * answer dropped.
 *
 * Updated in a layout effect, so it names the new key before any promise can
 * resolve after the render that switched.
 */
export function useIsCurrent<K>(key: K): (asked: K) => boolean {
  const shown = useRef<{ key: K } | null>({ key })
  useLayoutEffect(() => {
    shown.current = { key }
    return () => {
      shown.current = null
    }
  }, [key])
  return useCallback((asked: K) => shown.current !== null && Object.is(shown.current.key, asked), [])
}
