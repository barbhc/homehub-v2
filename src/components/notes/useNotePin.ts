import { useState } from "react"
import type { CareNote } from "@/integrations/types"
import { setCareNotePinned } from "@/modules/care"

/**
 * Pin a note to Home's "Pinned by you" (design/home-next.md), from any list of
 * notes: house, room or item. A refusal is said (`error`) and logged; the note
 * stays as it was.
 */
export function useNotePin(homeId: string | null, reload: () => void) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toggle = async (note: CareNote) => {
    if (!homeId || busyId) return
    setBusyId(note.note_id)
    setError(null)
    const res = await setCareNotePinned(homeId, note.note_id, !note.pinned_at)
    setBusyId(null)
    if (res.error) {
      console.warn(`[notes] could not ${note.pinned_at ? "unpin" : "pin"} note ${note.note_id} (home ${homeId}):`, res.error.message)
      setError(note.pinned_at ? "Couldn't unpin that note. Try again." : "Couldn't pin that note. Try again.")
      return
    }
    reload()
  }
  return { busyId, error, toggle: (note: CareNote) => void toggle(note) }
}
