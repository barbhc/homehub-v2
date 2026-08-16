import { useState } from "react"
import { CheckIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createRoom } from "@/modules/home"
import type { Room } from "@/integrations/types"
import { cn } from "@/lib/utils"

/**
 * Pick-or-create a room for an item. Beta feedback: rooms only existed as the
 * seeded defaults — there was no way to add "Garage" anywhere in the app, and
 * on mobile no way to change an item's room at all.
 */
export function RoomPickerDialog({
  open,
  onOpenChange,
  homeId,
  rooms,
  currentRoomId,
  onPick,
  onRoomCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  homeId: string
  rooms: Room[]
  currentRoomId: string | null
  /** Called with the chosen room id (null = no room). Caller persists. */
  onPick: (roomId: string | null) => void
  /** Bubble a newly created room up so the page's rooms list stays current. */
  onRoomCreated: (room: Room) => void
}) {
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pick = (roomId: string | null) => {
    onPick(roomId)
    onOpenChange(false)
  }

  const handleCreate = async () => {
    const name = newName.trim()
    if (!name) return
    const existing = rooms.find((r) => r.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      pick(existing.room_id)
      setNewName("")
      return
    }
    setCreating(true)
    setError(null)
    const res = await createRoom({ home_id: homeId, name })
    setCreating(false)
    if (res.error || !res.data) {
      setError(res.error?.message ?? "Could not create the room")
      return
    }
    onRoomCreated(res.data)
    setNewName("")
    pick(res.data.room_id)
  }

  const Row = ({ roomId, name }: { roomId: string | null; name: string }) => {
    const selected = currentRoomId === roomId
    return (
      <button
        type="button"
        onClick={() => pick(roomId)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-[14px]",
          selected ? "font-semibold" : "font-medium"
        )}
        style={{
          color: "var(--hh-ink)",
          background: selected ? "color-mix(in srgb, var(--hh-teal) 10%, transparent)" : "transparent",
        }}
      >
        {name}
        {selected && <CheckIcon className="size-4" style={{ color: "var(--hh-teal)" }} />}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Room</DialogTitle>
        </DialogHeader>
        <div className="max-h-[45vh] space-y-0.5 overflow-y-auto">
          <Row roomId={null} name="No room" />
          {rooms.map((r) => (
            <Row key={r.room_id} roomId={r.room_id} name={r.name} />
          ))}
        </div>
        <div className="border-t pt-3" style={{ borderColor: "var(--hh-line)" }}>
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate()
              }}
              placeholder="New room, e.g. Garage"
              aria-label="New room name"
            />
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-2 text-[12.5px] font-bold disabled:opacity-50"
              style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}
            >
              {creating ? <Loader2Icon className="size-3.5 animate-spin" /> : <PlusIcon className="size-3.5" />}
              Add
            </button>
          </div>
          {error && (
            <p className="mt-2 text-[12px]" style={{ color: "var(--hh-clay)" }}>
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
