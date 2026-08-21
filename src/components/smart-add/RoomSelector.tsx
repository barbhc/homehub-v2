import { useEffect, useRef, useState } from "react"
import { Loader2Icon } from "lucide-react"
import { useCurrentHome } from "@/modules/home"
import { getRooms, createRoom } from "@/modules/home"
import { cn } from "@/lib/utils"
import { inferRoom } from "../../../shared/inventory/roomInference"

type RoomSelectorProps = {
  value: string | null
  onChange: (roomId: string | null) => void
  label?: string
  id?: string
  className?: string
  disabled?: boolean
  /** HH-23: the item's subtype, so an unanswered room can fill itself in.
   *  Only ever fills a room the home actually has, only while the field is
   *  still empty, and only when the subtype has an unambiguous answer —
   *  an air purifier could be in any room, so it stays empty and gets asked. */
  suggestForSubType?: string | null
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
  suggestForSubType,
}: RoomSelectorProps) {
  const { home } = useCurrentHome()
  const [rooms, setRooms] = useState<Array<{ room_id: string; name: string }>>([])
  const [newRoomMode, setNewRoomMode] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  /** True while the value on screen is OUR guess and the user hasn't confirmed
   *  it — drives the "we filled this in" hint, and nothing else. */
  const [suggested, setSuggested] = useState(false)
  /** Subtypes we've already offered a guess for, so a re-render doesn't argue
   *  with someone who deliberately cleared the field. */
  const offeredFor = useRef<string | null>(null)

  useEffect(() => {
    if (!home?.home_id) return
    getRooms(home.home_id).then((r) => setRooms(r.data ?? []))
  }, [home?.home_id])

  // Fill the room in from the item type. Deliberately never overrides a value
  // that is already set — the guess is a starting point, not a correction.
  useEffect(() => {
    if (!suggestForSubType || value != null || rooms.length === 0) return
    if (offeredFor.current === suggestForSubType) return
    offeredFor.current = suggestForSubType
    const guess = inferRoom(suggestForSubType, rooms.map((r) => r.name))
    if (!guess) return
    const match = rooms.find((r) => r.name.toLowerCase() === guess.toLowerCase())
    if (!match) return
    setSuggested(true)
    onChange(match.room_id)
    // onChange is a fresh closure each render in most callers; depending on it
    // would re-run this on every keystroke elsewhere in the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestForSubType, value, rooms])

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
            // Any deliberate choice ends the "we filled this in" state, whether
            // they agreed with the guess or replaced it.
            setSuggested(false)
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
      {/* A prefill the user cannot see is an assumption, not a suggestion.
          Says what we did and that it's theirs to change — the whole point of
          filling it in was to save a tap, not to slip a decision past them. */}
      {/* Exactly ONE help line. Her screenshot showed both this hint AND the
          caller's static "Pick where this item lives in your home." stacked,
          which is noise and part of what read as gaps. */}
      {suggested && value != null && !newRoomMode && (
        <p className="text-xs text-muted-foreground">
          Filled in from the item type &mdash; change it if that&rsquo;s not where it lives.
        </p>
      )}
      {createError && <p className="text-xs text-destructive">{createError}</p>}
    </div>
  )
}
