import { useEffect, useState } from "react"
import { getItemUnit } from "@/modules/items"

/**
 * Items' display names, for the few item ids the pill's tray is showing.
 *
 * The tray's rows name the ITEM first — "Dishwasher · 42 pages" — with the
 * manual's title beneath it: people think in items, not file names (owner,
 * #228 review). The tray's entries already carry each manual's itemUnitId, so
 * this reads those item documents and nothing else.
 *
 * Each id is read ONCE per session and cached here by id. The tray re-renders
 * on every stage the worker writes; none of those may cost a read, and the
 * effect below only runs when the SET of ids changes. A failed read is logged
 * and left uncached, so the next change to the set tries again — the row shows
 * the manual's title meanwhile, as it did before names existed. An item that
 * is gone (missing or deleted) is cached as having no name, and keeps the title.
 */
const names = new Map<string, string | null>()
const inFlight = new Set<string>()
const cacheKey = (homeId: string, itemId: string) => `${homeId}/${itemId}`

export function useItemNames(homeId: string | null, itemIds: readonly string[]): ReadonlyMap<string, string> {
  // Re-render when a name lands; the names themselves live in the cache.
  const [, setLanded] = useState(0)
  const idSet = [...new Set(itemIds.filter(Boolean))].sort().join("|")

  useEffect(() => {
    if (!homeId || !idSet) return
    for (const id of idSet.split("|")) {
      const key = cacheKey(homeId, id)
      if (names.has(key) || inFlight.has(key)) continue
      inFlight.add(key)
      const failed = (message: string) => {
        inFlight.delete(key)
        console.warn(`[tray] could not read the name of item ${id}:`, message)
      }
      getItemUnit(homeId, id).then(
        (res) => {
          if (res.error) return failed(res.error.message)
          inFlight.delete(key)
          names.set(key, res.data?.display_name?.trim() || null)
          // A no-op if the pill has unmounted since (React 18+ drops it quietly).
          setLanded((n) => n + 1)
        },
        (e: unknown) => failed(e instanceof Error ? e.message : String(e)),
      )
    }
  }, [homeId, idSet])

  const out = new Map<string, string>()
  if (homeId) {
    for (const id of itemIds) {
      const name = names.get(cacheKey(homeId, id))
      if (name) out.set(id, name)
    }
  }
  return out
}
