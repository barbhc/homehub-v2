import { useEffect, useState } from "react"
import { getRooms } from "@/modules/home"
import { getItemUnits } from "@/modules/items"

type RoomOption = { room_id: string; name: string }
type ItemOption = { item_unit_id: string; display_name: string; brand: string | null; model: string | null }

export function useChatFilters(homeId: string | undefined): {
  rooms: RoomOption[]
  items: ItemOption[]
  loading: boolean
} {
  const [rooms, setRooms] = useState<RoomOption[]>([])
  const [items, setItems] = useState<ItemOption[]>([])
  const [loading, setLoading] = useState(true)

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

        if (roomsRes.error) console.error("[useChatFilters] rooms error:", roomsRes.error.message)
        if (itemsRes.error) console.error("[useChatFilters] items error:", itemsRes.error.message)

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
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [homeId])

  return { rooms, items, loading }
}
