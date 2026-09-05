import { useEffect, useState } from "react"
import { getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"

type RoomOption = { room_id: string; name: string }
type ItemOption = { item_unit_id: string; display_name: string; brand: string | null; model: string | null }

export function useChatFilters(homeId: string | undefined): {
  rooms: RoomOption[]
  items: ItemOption[]
  loading: boolean
  /** Non-null when the ITEM list failed — the picker renders it with a retry
   *  instead of claiming nothing matched (HH-149). */
  error: string | null
  reload: () => void
} {
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!homeId) {
      setRooms([])
      setItems([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    const load = async () => {
      try {
        const [roomsRes, itemsRes] = await Promise.all([
          getRooms(homeId),
          getItemUnits(homeId, { statusFilter: ["active", "stored"] }),
        ])

        if (cancelled) return

        // HH-149 (owner, 2026-09-05): these two lines used to be the WHOLE
        // failure path. When the items fetch failed the console knew and the
        // user did not — the picker just said "No appliances match", which is
        // a confident lie about their home. The error is state now.
        if (roomsRes.error) console.error("[useChatFilters] rooms error:", roomsRes.error.message)
        if (itemsRes.error) {
          console.error("[useChatFilters] items error:", itemsRes.error.message)
          setError(itemsRes.error.message)
        } else {
          setError(null)
        }

        setRooms(
          (roomsRes.data ?? []).map((r) => ({ room_id: r.room_id, name: r.name }))
        )
        setItems(
          (itemsRes.data ?? []).map((i) => ({
            item_unit_id: i.item_unit_id,
            display_name: i.display_name,
            brand: i.brand ?? null,
            model: i.model ?? null,
          }))
        )
      } catch (err) {
        console.error("[useChatFilters] unexpected error:", err)
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your items.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [homeId, reloadKey])

  return { rooms, items, loading, error, reload: () => setReloadKey((k) => k + 1) }
}
