import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import type { CareNote } from "@/integrations/types"
import { createCareNote, deleteCareNote, getHomeNotes, updateCareNote } from "@/modules/care"
import { getRooms, useCurrentHome } from "@/modules/home"
import { ideasFor, roomNoteCounts, type NoteIdea, type NoteScope } from "@/lib/notes"
import { NoteComposer } from "@/components/notes/NoteComposer"
import { IdeaChips, NoteRows, SharedLine } from "@/components/notes/NoteParts"
import { useNotes } from "@/components/notes/useNotes"

const BG = "var(--hh-bg)", INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)"
const CARD = "rounded-2xl px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"

type Composer = { key: string; note: CareNote | null; idea: NoteIdea | null }

/**
 * House notes (`/inventory/notes`) and a room's notes
 * (`/inventory/rooms/:roomId/notes`) — design/spares-and-notes.md §2.
 * House notes is reached from the top of Items; a room's notes from House
 * notes' "By room" list (owner, 2026-11-21: Items no longer puts a notes link
 * on every room heading).
 */
export default function NotesPage() {
  const { roomId } = useParams<{ roomId?: string }>()
  const navigate = useNavigate()
  const { home } = useCurrentHome()
  const homeId = home?.home_id ?? null
  const scope: NoteScope = roomId ? "room" : "home"

  // A room page needs the room's name — and to know when the room is gone.
  // House notes lists the rooms ("By room"), the way into each room's notes.
  const [rooms, setRooms] = useState<{ room_id: string; name: string }[] | null>(null)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [roomsAttempt, setRoomsAttempt] = useState(0)
  useEffect(() => {
    if (!homeId) return
    let cancelled = false
    void getRooms(homeId).then((res) => {
      if (cancelled) return
      if (res.error) {
        setRoomsError(res.error.message)
      } else {
        setRoomsError(null)
        setRooms(res.data ?? [])
      }
    })
    return () => { cancelled = true }
  }, [homeId, roomId, roomsAttempt])
  const room = roomId && rooms ? rooms.find((r) => r.room_id === roomId) ?? null : null
  const roomGone = !!roomId && rooms !== null && room === null

  const { notes, error, loading, reload } = useNotes(homeId ? `home-notes:${homeId}` : null, () => getHomeNotes(homeId!))
  const mine = (notes ?? []).filter((n) => (scope === "home" ? n.scope === "home" : n.scope === "room" && n.room_id === roomId))
  const ideas = ideasFor(scope, null, mine)
  const roomCounts = roomNoteCounts(notes)
  const [composer, setComposer] = useState<Composer | null>(null)
  const openNew = (idea: NoteIdea | null) => setComposer({ key: `new:${idea?.label ?? ""}:${Date.now()}`, note: null, idea })

  const title = scope === "home" ? "House notes" : room?.name ?? (roomsError ? "Room notes" : "")
  const scopeLabel = scope === "home" ? "House" : room?.name ?? "This room"

  const save = async (text: string): Promise<string | null> => {
    if (!homeId) return "No home selected"
    const note = composer?.note
    const res = note
      ? await updateCareNote(homeId, note.note_id, { content: text, title: null })
      : await createCareNote({ home_id: homeId, scope, room_id: scope === "room" ? roomId! : null, item_unit_id: null, content: text, source: "user" })
    if (res.error) return res.error.message
    reload()
    return null
  }
  const remove = async (): Promise<string | null> => {
    if (!homeId || !composer?.note) return null
    const res = await deleteCareNote(homeId, composer.note.note_id)
    if (res.error) return res.error.message
    reload()
    return null
  }

  return (
    <div className="flex min-h-full flex-col" style={{ background: BG }}>
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex items-center px-3 pb-1.5 pt-1">
          <button type="button" onClick={() => navigate("/inventory")} className="hit-44 inline-flex items-center gap-0.5 py-1.5 text-[1rem] font-semibold" style={{ color: TEAL }}>
            <ChevronLeftIcon className="size-[22px]" strokeWidth={2.4} aria-hidden /> Items
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 pb-10">
          <div>
            <h1 className="min-h-[34px] text-[1.625rem] font-extrabold tracking-[-0.5px]" style={{ color: INK }}>{title}</h1>
            <div className="mt-1"><SharedLine homeName={home?.name ?? null} /></div>
          </div>

          {roomGone ? (
            <div className={`text-[0.84375rem] ${CARD}`} style={{ background: SURFACE, color: SUB }}>This room isn&apos;t in your home anymore.</div>
          ) : (
            <>
              {error ? (
                <div role="alert" className={`flex items-center gap-2 text-[0.8125rem] ${CARD}`} style={{ background: SURFACE, color: CLAY }}>
                  <span className="min-w-0 flex-1">Couldn&apos;t load notes: {error}</span>
                  <button type="button" onClick={reload} className="hit-44 shrink-0 font-bold underline underline-offset-2">Try again</button>
                </div>
              ) : loading ? (
                <div className={`text-[0.8125rem] ${CARD}`} style={{ background: SURFACE, color: FAINT }}>Loading notes…</div>
              ) : mine.length === 0 ? (
                <div className={`flex flex-col gap-0.5 ${CARD}`} style={{ background: SURFACE }}>
                  <span className="text-[0.84375rem] font-semibold" style={{ color: INK }}>Nothing noted yet</span>
                  <span className="text-[0.75rem]" style={{ color: SUB }}>Things you&apos;d otherwise have to remember — start with an idea below.</span>
                </div>
              ) : (
                <NoteRows notes={mine} onEdit={(note) => setComposer({ key: note.note_id, note, idea: null })} />
              )}

              <button
                type="button"
                onClick={() => openNew(null)}
                disabled={!!error}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border-[1.5px] px-4 py-3 text-[0.875rem] font-bold disabled:opacity-50"
                style={{ borderColor: "color-mix(in srgb, var(--hh-teal) 35%, transparent)", background: SURFACE, color: TEAL }}
              >
                <PlusIcon className="size-4" strokeWidth={2.4} aria-hidden />
                Add a note
              </button>
              {!error && <IdeaChips ideas={ideas} onPick={openNew} />}
            </>
          )}

          {scope === "home" && (roomsError || (rooms && rooms.length > 0)) && (
            <section aria-labelledby="notes-by-room" className="mt-2">
              <h2 id="notes-by-room" className="mb-2 pl-0.5 text-xs font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>By room</h2>
              {roomsError ? (
                <div role="alert" className={`flex items-center gap-2 text-[0.8125rem] ${CARD}`} style={{ background: SURFACE, color: CLAY }}>
                  <span className="min-w-0 flex-1">Couldn&apos;t load your rooms: {roomsError}</span>
                  <button type="button" onClick={() => setRoomsAttempt((n) => n + 1)} className="hit-44 shrink-0 font-bold underline underline-offset-2">Try again</button>
                </div>
              ) : (
                <ul className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
                  {rooms!.map((r, i) => {
                    const count = roomCounts.get(r.room_id) ?? 0
                    return (
                      <li key={r.room_id} style={{ borderTop: i === 0 ? "none" : "0.5px solid var(--hh-line)" }}>
                        <Link to={`/inventory/rooms/${r.room_id}/notes`} className="flex min-h-11 items-center gap-3 px-4 py-3">
                          <span className="min-w-0 flex-1 text-[0.90625rem] font-semibold [overflow-wrap:anywhere]" style={{ color: INK }}>{r.name}</span>
                          {count > 0 && (
                            <span className="shrink-0 text-[0.78125rem] font-semibold" style={{ color: SUB }}>
                              {count} {count === 1 ? "note" : "notes"}
                            </span>
                          )}
                          <ChevronRightIcon className="size-[18px] shrink-0 text-[var(--hh-icon-faint)]" aria-hidden />
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>

      {composer && (
        <NoteComposer
          key={composer.key}
          open
          onOpenChange={(open) => { if (!open) setComposer(null) }}
          scopeLabel={scopeLabel}
          homeName={home?.name ?? null}
          ideas={ideas}
          note={composer.note}
          startIdea={composer.idea}
          onSave={save}
          onDelete={composer.note ? remove : undefined}
        />
      )}
    </div>
  )
}
