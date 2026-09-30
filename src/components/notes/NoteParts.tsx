import type { ReactNode } from "react"
import { PencilIcon, PlusIcon, UsersIcon } from "lucide-react"
import type { CareNote } from "@/integrations/types"
import { displayBody, noteDate, splitNote, type NoteIdea } from "@/lib/notes"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"
const SURFACE = "var(--hh-surface)", LINE = "var(--hh-line)"

/** The item page's section heading: bold label, hairline, one action. */
export function NotesHeading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <h2 className="text-[17px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>{children}</h2>
      <span className="h-px flex-1" style={{ background: LINE }} aria-hidden />
      {action}
    </div>
  )
}

/** The notes as one card of rows — heading, text, date, and a pencil. */
export function NoteRows({ notes, onEdit }: { notes: CareNote[]; onEdit: (note: CareNote) => void }) {
  return (
    <ul className="overflow-hidden rounded-2xl shadow-[0_1px_2px_rgba(15,23,42,0.05)]" style={{ background: SURFACE }}>
      {notes.map((note, i) => {
        const { heading, body } = splitNote(note.content, note.title)
        const date = noteDate(note.updated_at || note.created_at)
        const name = heading ?? body.slice(0, 40)
        return (
          <li
            key={note.note_id}
            data-testid="note-row"
            className="flex items-start gap-2.5 px-4 py-3.5"
            style={{ borderBottom: i === notes.length - 1 ? "none" : `0.5px solid ${LINE}` }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {heading && <span className="text-[14.5px] font-bold tracking-[-0.2px]" style={{ color: INK }}>{heading}</span>}
              {body && (
                <span className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45]" style={{ color: heading ? SUB : INK }}>
                  {displayBody(body, !!heading)}
                </span>
              )}
              {date && <span className="mt-1 text-[11.5px]" style={{ color: FAINT }}>{date}</span>}
            </div>
            <button
              type="button"
              onClick={() => onEdit(note)}
              aria-label={`Edit note: ${name}`}
              className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full"
            >
              <PencilIcon className="size-3.5" style={{ color: FAINT }} aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Ideas as chips — each one starts a note; none is a field. */
export function IdeaChips({ ideas, selected, onPick, label = "Ideas" }: {
  ideas: NoteIdea[]
  selected?: string | null
  onPick: (idea: NoteIdea) => void
  label?: string | null
}) {
  if (ideas.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-[11px] font-bold uppercase tracking-[0.5px]" style={{ color: SUB }}>{label}</span>}
      <div className="flex flex-wrap gap-2">
        {ideas.map((idea) => {
          const on = idea.label === selected
          return (
            <button
              key={idea.label}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(idea)}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold"
              style={{
                borderColor: on ? TEAL : "color-mix(in srgb, var(--hh-teal) 40%, transparent)",
                background: on ? "var(--hh-teal-wash)" : SURFACE,
                color: TEAL,
              }}
            >
              <PlusIcon className="size-3.5" strokeWidth={2.4} aria-hidden />
              {idea.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Notes are shared with everyone in the home — said where it matters. */
export function SharedLine({ homeName, compact = false }: { homeName: string | null; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${compact ? "text-[12px]" : "text-[13px]"}`} style={{ color: SUB }}>
      <UsersIcon className="size-3.5 shrink-0" aria-hidden />
      {homeName ? `Shared with everyone in ${homeName}` : "Shared with everyone in this home"}
    </span>
  )
}
