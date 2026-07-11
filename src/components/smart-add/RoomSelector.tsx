import { useEffect, useState } from "react"
import { useCurrentHome } from "@/modules/home"
import { getRooms } from "@/modules/home"
import { cn } from "@/lib/utils"

type RoomSelectorProps = {
  value: string | null
  onChange: (roomId: string | null) => void
  label?: string
  id?: string
  className?: string
  disabled?: boolean
}

/**
 * Room selector dropdown — uses rooms for the current home.
 * Wire to room_id on item_unit.
 */
export function RoomSelector({
  value,
  onChange,
  label = "Room",
  id = "room-select",
  className,
  disabled,
}: RoomSelectorProps) {
  const { home } = useCurrentHome()
  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])

  useEffect(() => {
    if (!home?.home_id) return
    getRooms(home.home_id).then((r) => setRooms(r.data ?? []))
  }, [home?.home_id])

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground block">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value
          onChange(v ? v : null)
        }}
        disabled={disabled}
        className="text-sm border border-border rounded-md px-3 py-2 bg-background w-full max-w-xs"
        aria-label={label}
      >
        <option value="">No room</option>
        {rooms.map((r) => (
          <option key={r.room_id} value={r.room_id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  )
}
