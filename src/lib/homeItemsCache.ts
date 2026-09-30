/**
 * The Items list's cache — its key, its shape, and the patches every item write
 * applies to it.
 *
 * A leaf module on purpose: the item service imports it to keep the list honest
 * after a write, and useHomeItems (which imports the item service to fetch)
 * re-exports it. Keeping the fetch out of this file is what keeps that from
 * being an import cycle.
 *
 * Why writes patch the cache at all: the list is now cached, and SWR does not
 * refetch a key it fetched in the last few seconds (`dedupingInterval`). Before
 * the cache, every visit re-read Firestore, so a rename or a delete was always
 * reflected; now the page paints what it last saw. So every write that changes
 * what the list shows patches what it last saw — the deleted item is already
 * gone when ItemDetailPage navigates back to /inventory, not a moment later —
 * and marks the key stale, so the next visit refetches rather than trusting
 * the patch.
 */
import { mutate } from "swr"
import type { ItemUnit, Room } from "@/integrations/types"
import { ITEMS_KEY_PREFIX, isHomeItemsSnapshot, persistSwrSnapshot, readPersistedSwrFallback } from "./swrPersist"

/**
 * What the Items page renders: the home's ACTIVE items, newest first (the
 * order getItemUnits returns), and its rooms, by name. If this shape changes,
 * bump ITEMS_KEY_PREFIX's version in swrPersist.ts — persisted snapshots of the
 * old shape are then ignored rather than rendered.
 */
export interface HomeItemsSnapshot {
  items: ItemUnit[]
  rooms: Room[]
}

export function homeItemsKey(homeId: string): string {
  return `${ITEMS_KEY_PREFIX}${homeId}`
}

/** The snapshot persisted for `key` by an earlier session, if there is a well-formed one. */
function persistedSnapshot(key: string): HomeItemsSnapshot | undefined {
  const value = readPersistedSwrFallback()[key]
  return isHomeItemsSnapshot(value) ? value : undefined
}

/**
 * Apply `change` to the list wherever it is held — SWR's in-memory cache, or,
 * when the page has not been opened this session, the snapshot persisted by an
 * earlier one (which App already handed SWR as `fallback`) — and persist the
 * result so a reload cannot resurrect what the write removed.
 *
 * The in-memory update is synchronous (SWR applies a function mutator before
 * its first await), so a navigation straight after the write renders the
 * patched list. `revalidate: true` clears SWR's dedupe marker for the key: a
 * mounted list refetches now, an unmounted one on its next visit.
 */
function patchHomeItems(homeId: string, change: (snapshot: HomeItemsSnapshot) => HomeItemsSnapshot): void {
  const key = homeItemsKey(homeId)
  mutate<HomeItemsSnapshot>(
    key,
    (current) => {
      const base = current ?? persistedSnapshot(key)
      if (!base) return current
      const next = change(base)
      persistSwrSnapshot(key, next)
      return next
    },
    { revalidate: true },
  ).catch((e: unknown) => {
    // The write this follows has already succeeded; a failed patch only costs
    // the instant update (the next visit refetches). Log it, never throw it
    // into the caller's success path.
    console.warn(`[items cache] could not patch ${key}:`, e instanceof Error ? e.message : e)
  })
}

/** After a soft delete: the item is off the list before the page navigates back to it. */
export function removeItemFromCache(homeId: string, itemUnitId: string): void {
  patchHomeItems(homeId, (s) => ({ ...s, items: s.items.filter((i) => i.item_unit_id !== itemUnitId) }))
}

/**
 * After a create or an update: the fresh item replaces its old row in place, or
 * — new — goes first, where getItemUnits' newest-first order puts it. An item
 * that is no longer active (or is deleted) leaves the list, since the list only
 * holds active items.
 */
export function upsertItemInCache(item: ItemUnit): void {
  patchHomeItems(item.home_id, (s) => {
    const others = s.items.filter((i) => i.item_unit_id !== item.item_unit_id)
    if (item.status !== "active" || item.deleted_at) return { ...s, items: others }
    const at = s.items.findIndex((i) => i.item_unit_id === item.item_unit_id)
    const items = at === -1 ? [item, ...s.items] : s.items.map((i) => (i.item_unit_id === item.item_unit_id ? item : i))
    return { ...s, items }
  })
}

/** Refetch the list: now if it is on screen, otherwise on its next visit. */
export function mutateHomeItems(homeId: string): Promise<unknown> {
  return mutate(homeItemsKey(homeId))
}
