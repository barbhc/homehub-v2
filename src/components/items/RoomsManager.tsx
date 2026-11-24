/**
 * The home's rooms: rename, add, delete (Items → Edit rooms, at
 * /inventory/rooms). Moved out of Settings unchanged in behaviour
 * (design/settings-your-home.md): the list is read by one function and lands
 * through one apply, a late answer for a home already left lands nowhere, and
 * every write the server refuses leaves its editor open and says so.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { PencilIcon, PlusIcon, Trash2 } from "lucide-react"
import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { Room } from "@/integrations/types"
import { useDepsChanged } from "@/hooks/useDepsChanged"
import { useIsCurrent } from "@/hooks/useIsCurrent"
import { InlineError, SectionCard } from "@/components/layout"
import { CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getRooms, createRoom, renameRoom, deleteRoom } from "@/modules/home"

type RoomsRead =
  | { rooms: Room[]; counts: Record<string, number>; error: null }
  | { rooms: Room[] | null; counts: null; error: unknown }

/**
 * One read of the home's rooms and how many items each holds. A room list
 * that arrived before the counts failed is still handed back.
 *
 * The two queries go out together. They used to run one after the other, and
 * the second, sent once the first had answered, was the read that stalled
 * under WebKit against the emulator (a read issued after the page's first
 * burst can wait there indefinitely). Same answers, one round trip.
 */
async function readRooms(homeId: string): Promise<RoomsRead> {
  const [roomsRes, countsRes] = await Promise.allSettled([
    getRooms(homeId),
    getDocs(query(collection(db, `homes/${homeId}/items`), where("deletedAt", "==", null))),
  ])
  // Not swallowed: each failure is handed back to be logged and said (applyRooms).
  if (roomsRes.status === "rejected") return { rooms: null, counts: null, error: roomsRes.reason }
  if (roomsRes.value.error) return { rooms: null, counts: null, error: new Error(roomsRes.value.error.message) }
  const rooms = roomsRes.value.data ?? []
  if (countsRes.status === "rejected") return { rooms, counts: null, error: countsRes.reason }

  const countMap: Record<string, number> = {}
  for (const d of countsRes.value.docs) {
    const roomId: unknown = d.data().roomId
    if (typeof roomId === "string" && roomId) {
      countMap[roomId] = (countMap[roomId] ?? 0) + 1
    }
  }
  return { rooms, counts: countMap, error: null }
}

export function RoomsManager({ homeId }: { homeId: string }) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [roomItemCounts, setRoomItemCounts] = useState<Record<string, number>>({})
  const [roomsLoading, setRoomsLoading] = useState(true)
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [addingRoom, setAddingRoom] = useState(false)
  const [newRoomName, setNewRoomName] = useState("")
  const [savingRoom, setSavingRoom] = useState(false)
  const [deleteConfirmRoom, setDeleteConfirmRoom] = useState<Room | null>(null)
  const [deletingRoom, setDeletingRoom] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const renamingRef = useRef(false)
  /** The rename that just failed — leaving the field does not send it again. */
  const failedRenameRef = useRef<{ roomId: string; name: string } | null>(null)

  // The list says when its read or a write failed (audit H6): a list that
  // never loaded is not an empty list, and a rename, add or delete the server
  // refused does not close its editor as if it had worked.
  const [roomsLoadFailed, setRoomsLoadFailed] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)

  // Rooms are read by ONE function (readRooms) and land through ONE apply,
  // whether the read is the first, a home switch or Try again.
  const applyRooms = useCallback((res: RoomsRead) => {
    if (res.rooms) setRooms(res.rooms)
    if (res.counts !== null) {
      setRoomItemCounts(res.counts)
      setRoomsLoadFailed(false)
    } else {
      console.warn(`[rooms] could not load rooms for home ${homeId}:`, res.error instanceof Error ? res.error.message : res.error)
      setRoomsLoadFailed(true)
    }
    setRoomsLoading(false)
  }, [homeId])

  // The list lands only while its home is still the one on screen (H4): home
  // A's read answering after a switch to B used to replace B's list with A's.
  // A Try again held from before the switch does not start at all — it would
  // put a spinner on B's list, then have its answer dropped.
  const isCurrentHome = useIsCurrent(homeId)

  const loadRooms = useCallback(async () => {
    if (!isCurrentHome(homeId)) return
    setRoomsLoading(true)
    const res = await readRooms(homeId)
    if (isCurrentHome(homeId)) applyRooms(res)
  }, [homeId, applyRooms, isCurrentHome])

  // The first read and a home switch: the spinner starts in the render that
  // switches (it starts on for the first), and the effect only reads.
  if (useDepsChanged([homeId])) setRoomsLoading(true)
  useEffect(() => {
    void readRooms(homeId).then((res) => {
      if (isCurrentHome(homeId)) applyRooms(res)
    })
  }, [homeId, applyRooms, isCurrentHome])

  const handleStartEditRoom = useCallback((room: Room) => {
    failedRenameRef.current = null
    setEditingRoomId(room.room_id)
    setEditingName(room.name)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }, [])

  /** `via` is how the save was asked for: Enter in the field, or leaving it. */
  const handleSaveRename = useCallback(async (via: "enter" | "blur") => {
    if (!editingRoomId || !editingName.trim()) {
      setEditingRoomId(null)
      return
    }
    // The room this save is for. The editor can move on while the save is in
    // flight — "Rename" on another room opens that room's editor — so all that
    // follows the await is about THIS room, not whichever editor is open then.
    const roomId = editingRoomId
    const name = editingName.trim()
    const existingRoom = rooms.find((r) => r.room_id === roomId)
    if (existingRoom && existingRoom.name === name) {
      setEditingRoomId(null)
      return
    }
    if (renamingRef.current) return
    // Leaving the field never re-sends the rename that just failed. The editor
    // stays open after a failure, so every tap elsewhere would write, and fail,
    // again. Enter, or a changed name, tries again.
    const failed = failedRenameRef.current
    if (via === "blur" && failed?.roomId === roomId && failed.name === name) return
    // One rename at a time: the editor disabling itself mid-save can blur it,
    // and blur saves — that must not start a second write.
    renamingRef.current = true
    setSavingRoom(true)
    setRoomsError(null)
    const res = await renameRoom(homeId, roomId, name)
    renamingRef.current = false
    setSavingRoom(false)
    if (res.error || !res.data) {
      // The editor stays open with what was typed (as Add room's form does),
      // and the list says why — Enter tries again, Escape keeps the old name.
      console.warn(`[rooms] could not rename room ${roomId} (home ${homeId}):`, res.error?.message)
      setRoomsError("Couldn't rename that room. Check your connection and try again.")
      failedRenameRef.current = { roomId, name }
      // Focus goes back only after Enter, when the person was still in the
      // field. A save that ran because they LEFT it must not pull them back:
      // each attempt to leave would save, fail and refocus again, with Escape
      // the only way out.
      if (via === "enter") setTimeout(() => editInputRef.current?.focus(), 0)
      return
    }
    failedRenameRef.current = null
    const renamed = res.data
    setRooms((prev) => prev.map((r) => (r.room_id === roomId ? renamed : r)))
    // Closes THIS room's editor only. Leaving room X's field for "Rename Y"
    // saves X on the blur, and Y's editor opened while that save was in flight
    // used to be closed by it landing.
    setEditingRoomId((open) => (open === roomId ? null : open))
  }, [homeId, editingRoomId, editingName, rooms])

  const handleAddRoom = useCallback(async () => {
    if (!newRoomName.trim()) return
    setSavingRoom(true)
    setRoomsError(null)
    const res = await createRoom({ home_id: homeId, name: newRoomName.trim() })
    setSavingRoom(false)
    if (res.error || !res.data) {
      // The form stays open with the name typed, ready to try again.
      // Ids and lengths only — what someone typed stays out of the logs.
      console.warn(`[rooms] could not add a room (${newRoomName.trim().length}-char name, home ${homeId}):`, res.error?.message)
      setRoomsError("Couldn't add that room. Check your connection and try again.")
      return
    }
    const created = res.data
    setRooms((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
    setNewRoomName("")
    setAddingRoom(false)
  }, [homeId, newRoomName])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmRoom) return
    setDeletingRoom(true)
    setRoomsError(null)
    const res = await deleteRoom(homeId, deleteConfirmRoom.room_id)
    setDeletingRoom(false)
    setDeleteConfirmRoom(null)
    if (res.error || !res.data) {
      // The room is still there — the list says so rather than looking deleted.
      console.warn(`[rooms] could not delete room ${deleteConfirmRoom.room_id} (home ${homeId}):`, res.error?.message)
      setRoomsError(`Couldn't delete ${deleteConfirmRoom.name}. Check your connection and try again.`)
      return
    }
    setRooms((prev) => prev.filter((r) => r.room_id !== deleteConfirmRoom.room_id))
    setRoomItemCounts((prev) => {
      const next = { ...prev }
      delete next[deleteConfirmRoom.room_id]
      return next
    })
  }, [deleteConfirmRoom, homeId])

  return (
    <>
      <SectionCard data-testid="rooms-manager">
        <CardContent className="p-4">
          {roomsLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : (
            <>
              {roomsLoadFailed && (
                <InlineError className="mb-4" onRetry={() => void loadRooms()}>
                  Couldn&apos;t load your rooms.
                </InlineError>
              )}
              {roomsError && <InlineError className="mb-3">{roomsError}</InlineError>}
              <div className="space-y-1 mb-4">
                {rooms.map((room) => (
                  <div
                    key={room.room_id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 group"
                  >
                    {editingRoomId === room.room_id ? (
                      <Input
                        ref={editInputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => void handleSaveRename("blur")}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleSaveRename("enter")
                          if (e.key === "Escape") setEditingRoomId(null)
                        }}
                        disabled={savingRoom}
                        aria-label={`New name for ${room.name}`}
                        className="max-w-[200px]"
                      />
                    ) : (
                      <button
                        type="button"
                        className="hit-44 font-medium text-sm text-left hover:text-primary transition-colors"
                        onClick={() => handleStartEditRoom(room)}
                      >
                        {room.name}
                      </button>
                    )}
                    {/* gap-3 on a touch iPad: at md+ the icon buttons are 32px,
                        and 8px apart their 44pt taps (hit-44) would overlap. */}
                    <div className="flex items-center gap-2 md:pointer-coarse:gap-3">
                      {(roomItemCounts[room.room_id] ?? 0) > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {roomItemCounts[room.room_id]} item{roomItemCounts[room.room_id] !== 1 ? "s" : ""}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:focus-visible:opacity-100 hover:text-primary transition-opacity"
                        onClick={() => handleStartEditRoom(room)}
                        aria-label={`Rename ${room.name}`}
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground sm:pointer-fine:opacity-0 sm:pointer-fine:group-hover:opacity-100 sm:pointer-fine:focus-visible:opacity-100 hover:text-destructive transition-opacity"
                        onClick={() => setDeleteConfirmRoom(room)}
                        aria-label={`Delete ${room.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {addingRoom ? (
                <div className="flex items-center gap-2">
                  <Input
                    ref={addInputRef}
                    placeholder="Room name"
                    aria-label="Room name"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleAddRoom()
                      if (e.key === "Escape") {
                        setAddingRoom(false)
                        setNewRoomName("")
                      }
                    }}
                    disabled={savingRoom}
                    className="max-w-[200px]"
                    autoFocus
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newRoomName.trim() || savingRoom}
                    onClick={() => void handleAddRoom()}
                  >
                    {savingRoom ? "Adding..." : "Add"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingRoom(false)
                      setNewRoomName("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setAddingRoom(true)
                    setTimeout(() => addInputRef.current?.focus(), 0)
                  }}
                >
                  <PlusIcon className="size-4 mr-1.5" />
                  Add room
                </Button>
              )}
            </>
          )}
        </CardContent>
      </SectionCard>

      {/* Delete room confirmation dialog */}
      <Dialog open={!!deleteConfirmRoom} onOpenChange={(open) => !open && setDeleteConfirmRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmRoom?.name}?</DialogTitle>
            <DialogDescription>
              Items in this room will be moved to "No room." This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmRoom(null)} disabled={deletingRoom}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirmDelete()} disabled={deletingRoom}>
              {deletingRoom ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
