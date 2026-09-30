/**
 * The Items page's data — the home's items and rooms — cached the way Home's
 * dashboard is (useDashboard.ts), so a revisit paints the list at once and a
 * relaunch paints the last list from localStorage while it revalidates.
 *
 * Until this hook the page loaded in a plain effect with `loading` starting
 * true: every visit, including a back-navigation from an item, showed a full
 * skeleton until Firestore answered, and a request that never answered was a
 * skeleton forever.
 */
import useSWR from "swr"
import { getItemUnits } from "@/modules/items"
import { getRooms } from "@/modules/home"
import { persistSwrSnapshot } from "./swrPersist"
import { LOAD_TIMEOUT_MS, withTimeout } from "./withTimeout"
import { homeItemsKey, type HomeItemsSnapshot } from "./homeItemsCache"

export {
  homeItemsKey,
  mutateHomeItems,
  removeItemFromCache,
  upsertItemInCache,
  type HomeItemsSnapshot,
} from "./homeItemsCache"

const TIMED_OUT = "Loading your items timed out. Check your connection and try again."

/**
 * THROWS on a failed read — including an offline read the cache answered with
 * nothing (refuseOfflineEmpty) — so SWR records an error and keeps the last good
 * list. Resolving `{ items: [] }` instead would paint "No items yet" over a
 * home full of them, and onSuccess would persist that empty list as the warm
 * snapshot for every launch after.
 */
async function fetchHomeItems(homeId: string): Promise<HomeItemsSnapshot> {
  const [items, rooms] = await Promise.all([
    getItemUnits(homeId, { refuseOfflineEmpty: true }),
    getRooms(homeId, { refuseOfflineEmpty: true }),
  ])
  if (items.error) throw new Error(items.error.message)
  if (rooms.error) throw new Error(rooms.error.message)
  return { items: items.data, rooms: rooms.data }
}

export function useHomeItems(homeId: string | null) {
  const swr = useSWR<HomeItemsSnapshot>(
    homeId ? homeItemsKey(homeId) : null,
    () => withTimeout(fetchHomeItems(homeId!), LOAD_TIMEOUT_MS, TIMED_OUT),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 5000,
      // NOT keepPreviousData (Home uses it; this must not): on a home switch it
      // would keep painting the previous home's items under the new home's name
      // until the new list landed. Keyed per home, a switch shows the new
      // home's own cached list, or the skeleton — never another home's items.
      keepPreviousData: false,
      onSuccess: (fresh, key) => persistSwrSnapshot(key, fresh),
    },
  )
  return {
    /** The list to paint — fresh, in-memory, or the persisted snapshot. `undefined` only when there is nothing to paint yet. */
    data: swr.data,
    /** The last read's failure. Set alongside `data` when a refresh failed behind a list we could still show. */
    error: swr.error instanceof Error ? swr.error : swr.error ? new Error(String(swr.error)) : undefined,
    /** Refetch now (Try again / Retry). */
    refresh: () => swr.mutate(),
  }
}
