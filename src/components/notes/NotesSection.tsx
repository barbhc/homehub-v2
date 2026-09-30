import { useMemo, useState } from "react"
import type { CareNote, ItemUnit } from "@/integrations/types"
import {
  clearLegacyItemNote, createCareNote, deleteCareNote, getCareNotesByItem, promoteLegacyItemNote, updateCareNote,
} from "@/modules/care"
import { useCurrentHome } from "@/modules/home"
import { ideasFor, isLegacyNote, legacyItemNote, type NoteIdea } from "@/lib/notes"
import { NoteComposer } from "./NoteComposer"
import { IdeaChips, NoteRows, NotesHeading } from "./NoteParts"
import { useNotes } from "./useNotes"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"
const SURFACE = "var(--hh-surface)"
const CARD = "rounded-2xl px-4 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"

type Composer = { key: string; note: CareNote | null; idea: NoteIdea | null }

/**
 * The item page's Notes — what you'd otherwise have to remember about THIS
 * item (design/spares-and-notes.md §2). Sits between the Ask card and Details
 * & records on the phone, in the rail on desktop.
 *
 * The item's old single `notes` field shows here as an ordinary note: 4 of 17
 * items in the owner's home held text there, invisible since its card was
 * orphaned. Editing it moves it into careNotes; deleting clears the field.
 */
export function NotesSection({ homeId, item, onItemUpdate }: {
  homeId: string
  item: ItemUnit
  /** Told when the legacy field clears, so the page's copy of the item agrees. */
  onItemUpdate?: (item: ItemUnit) => void
}) {
  const { home } = useCurrentHome()
  const { notes, error, loading, reload } = useNotes(
    `item-notes:${homeId}:${item.item_unit_id}`,
    () => getCareNotesByItem(homeId, item.item_unit_id),
  )
  const [composer, setComposer] = useState<Composer | null>(null)

  const all = useMemo(() => {
    const legacy = legacyItemNote(item)
    return [...(legacy ? [legacy] : []), ...(notes ?? [])]
      .sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at))
  }, [item, notes])
  // item_category is the group ("system"); item.category is the fine type
  // ("furnace") — the ideas are keyed by the group. The e2e walk on seeded
  // data caught this when a fixture that used "system" for `category` passed.
  const ideas = ideasFor("item_unit", item.item_category ?? null, all)

  const openNew = (idea: NoteIdea | null) => setComposer({ key: `new:${idea?.label ?? ""}:${Date.now()}`, note: null, idea })

  const save = async (text: string): Promise<string | null> => {
    const note = composer?.note ?? null
    if (!note) {
      const res = await createCareNote({ home_id: homeId, scope: "item_unit", item_unit_id: item.item_unit_id, room_id: null, content: text, source: "user" })
      if (res.error) return res.error.message
    } else if (isLegacyNote(note.note_id)) {
      const res = await promoteLegacyItemNote(homeId, item.item_unit_id, text)
      if (res.error) return res.error.message
      onItemUpdate?.({ ...item, notes: null })
    } else {
      // title → null: after an edit, the text she typed IS the note.
      const res = await updateCareNote(homeId, note.note_id, { content: text, title: null })
      if (res.error) return res.error.message
    }
    reload()
    return null
  }

  const remove = async (): Promise<string | null> => {
    const note = composer?.note
    if (!note) return null
    const legacy = isLegacyNote(note.note_id)
    const res = legacy ? await clearLegacyItemNote(homeId, item.item_unit_id) : await deleteCareNote(homeId, note.note_id)
    if (res.error) return res.error.message
    if (legacy) onItemUpdate?.({ ...item, notes: null })
    reload()
    return null
  }

  return (
    <section className="flex flex-col gap-[17px]" aria-label="Notes" data-testid="item-notes">
      <NotesHeading
        action={
          <button
            type="button"
            onClick={() => openNew(null)}
            aria-label="Add a note"
            className="shrink-0 rounded-full border px-3 py-1 text-[12.5px] font-bold"
            style={{ borderColor: "var(--hh-line2)", color: TEAL }}
          >
            Add
          </button>
        }
      >
        Notes
      </NotesHeading>

      {error ? (
        <div role="alert" className={`flex items-center gap-2 text-[13px] ${CARD}`} style={{ background: SURFACE, color: CLAY }}>
          <span className="min-w-0 flex-1">Couldn&apos;t load notes: {error}</span>
          <button type="button" onClick={reload} className="shrink-0 font-bold underline underline-offset-2">Try again</button>
        </div>
      ) : loading ? (
        <div className={`text-[13px] ${CARD}`} style={{ background: SURFACE, color: FAINT }}>Loading notes…</div>
      ) : all.length === 0 ? (
        <div className={`flex flex-col gap-3 ${CARD}`} style={{ background: SURFACE }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-[13.5px] font-semibold" style={{ color: INK }}>Nothing noted yet</span>
            <span className="text-[12px]" style={{ color: SUB }}>Things you&apos;d otherwise have to remember.</span>
          </div>
          <IdeaChips ideas={ideas} onPick={openNew} label={null} />
        </div>
      ) : (
        <NoteRows notes={all} onEdit={(note) => setComposer({ key: note.note_id, note, idea: null })} />
      )}

      {composer && (
        <NoteComposer
          key={composer.key}
          open
          onOpenChange={(open) => { if (!open) setComposer(null) }}
          scopeLabel={item.display_name}
          homeName={home?.name ?? null}
          ideas={ideas}
          note={composer.note}
          startIdea={composer.idea}
          onSave={save}
          onDelete={composer.note ? remove : undefined}
        />
      )}
    </section>
  )
}
