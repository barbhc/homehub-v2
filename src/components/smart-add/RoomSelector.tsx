import { useEffect, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { getRooms, createRoom } from "@/modules/home"
import { cn } from "@/lib/utils"

type RoomSelectorProps = {
  value: string | null
  onChange: (roomId: string | null) => void
  label?: string
  id?: string
  className?: string
  disabled?: boolean
}

/** Select sentinel: choosing it swaps the select for a create-a-room input. */
const ROOM_NEW = "__new__"

/**
 * Room selector dropdown — uses rooms for the current home, and can create one
 * inline ("+ New room…"). Beta feedback: the seeded defaults were the only
 * rooms that could ever exist. Wire to room_id on item_unit.
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
  const [newRoomMode, setNewRoomMode] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    if (!home?.home_id) return
    getRooms(home.home_id).then((r) => setRooms(r.data ?? []))
  }, [home?.home_id])

  const handleCreate = async () => {
    if (!home?.home_id) return
    const name = newRoomName.trim()
    if (!name) return
    // Same name typed again → reuse rather than duplicate.
    const existing = rooms.find((r) => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      setNewRoomMode(false)
      setNewRoomName("")
      onChange(existing.room_id)
      return
    }
    setCreating(true)
    setCreateError(null)
    const res = await createRoom({ home_id: home.home_id, name })
    setCreating(false)
    if (res.error || !res.data) {
      setCreateError(res.error?.message ?? "Could not create the room")
      return
    }
    const room = res.data
    setRooms((prev) => [...prev, { room_id: room.room_id, name: room.name }])
    setNewRoomMode(false)
    setNewRoomName("")
    onChange(room.room_id)
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground block">
        {label}
      </label>
      {newRoomMode ? (
        <div className="flex items-center gap-2">
          <input
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void handleCreate()
              }
              if (e.key === "Escape") setNewRoomMode(false)
            }}
            placeholder="New room, e.g. Garage"
            aria-label="New room name"
            className="text-sm border border-border rounded-md px-3 py-2 bg-background w-full max-w-[200px]"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating || !newRoomName.trim()}
            className="inline-flex items-center gap-1 text-sm font-semibold rounded-md border border-border px-3 py-2 disabled:opacity-50"
          >
            {creating && <Loader2Icon className="size-3.5 animate-spin" />}
            Add
          </button>
          <button
            type="button"
            onClick={() => setNewRoomMode(false)}
            disabled={creating}
            className="text-sm text-muted-foreground px-1 py-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => {
            const v = e.target.value
            if (v === ROOM_NEW) {
              setNewRoomMode(true)
              return
            }
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
          <option value={ROOM_NEW}>+ New room…</option>
        </select>
      )}
      {createError && <p className="text-xs text-destructive">{createError}</p>}
    </div>
  )
}
