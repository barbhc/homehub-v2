import { useRef, useState } from "react"
import { LightbulbIcon, Loader2Icon, MapPinIcon } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import type { CareNote } from "@/integrations/types"
import { isBlankNote, type NoteIdea } from "@/lib/notes"
import { IdeaChips, SharedLine } from "./NoteParts"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", TEAL = "var(--hh-teal)", CLAY = "var(--hh-clay)"

/**
 * Writing or editing one note — a bottom sheet.
 *
 * The scope says where it lives (House / Kitchen / the item), ideas start the
 * text with a one-line hint, and the sheet says plainly that everyone in the
 * home can read it. A failed save or delete keeps the sheet open with the text
 * and the error: a note that silently vanished is the worst outcome here.
 *
 * The parent keys this component by the note (or the idea) it opens with, so
 * a different note always starts from its own text — no syncing effects.
 */
export function NoteComposer({
  open, onOpenChange, scopeLabel, homeName, ideas, note, startIdea, onSave, onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scopeLabel: string
  homeName: string | null
  /** Offered only while writing a new note. */
  ideas: NoteIdea[]
  /** The note being edited; null writes a new one. */
  note: CareNote | null
  /** The idea the new note starts from, when one was tapped to open this. */
  startIdea?: NoteIdea | null
  /** Resolves to an error message, or null when saved. */
  onSave: (text: string) => Promise<string | null>
  onDelete?: () => Promise<string | null>
}) {
  const [text, setText] = useState(note?.content ?? startIdea?.seed ?? "")
  const [picked, setPicked] = useState<NoteIdea | null>(startIdea ?? null)
  const [busy, setBusy] = useState<"save" | "delete" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const pick = (idea: NoteIdea) => {
    setPicked(idea)
    setText(idea.seed)
    requestAnimationFrame(() => {
      const el = area.current
      if (!el) return
      el.focus()
      el.setSelectionRange(idea.seed.length, idea.seed.length)
    })
  }

  const run = async (kind: "save" | "delete", act: () => Promise<string | null>) => {
    setBusy(kind)
    setError(null)
    const failure = await act()
    setBusy(null)
    if (failure) { setError(failure); return }
    onOpenChange(false)
  }

  const blank = isBlankNote(text)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-lg gap-0 rounded-t-3xl border-0 p-0">
        <div className="flex flex-col gap-3.5 px-5 pb-7 pt-2.5">
          <span className="h-[5px] w-9 self-center rounded-full" style={{ background: "var(--hh-line2)" }} aria-hidden />
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <SheetTitle className="text-[18px] font-extrabold tracking-[-0.3px]" style={{ color: INK }}>
              {note ? "Edit note" : "New note"}
            </SheetTitle>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold" style={{ background: "var(--hh-teal-wash)", color: TEAL }}>
              <MapPinIcon className="size-3" aria-hidden />
              {scopeLabel}
            </span>
          </div>
          <SheetDescription className="sr-only">
            {note ? `Edit this note about ${scopeLabel}.` : `Write a note about ${scopeLabel}.`}
          </SheetDescription>

          <textarea
            ref={area}
            // Opening the sheet IS the intent to write.
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            aria-label="Note"
            placeholder="Anything you'd otherwise have to remember."
            className="min-h-[128px] w-full resize-none rounded-xl border-[1.5px] px-3.5 py-3 text-[15px] leading-[1.5] outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--hh-teal)_14%,transparent)] placeholder:text-[var(--hh-faint)]"
            style={{ borderColor: TEAL, background: "var(--hh-surface)", color: INK }}
          />
          {picked && (
            <div className="-mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: SUB }}>
              <LightbulbIcon className="mt-px size-3.5 shrink-0" style={{ color: TEAL }} aria-hidden />
              <span>{picked.hint}</span>
            </div>
          )}

          {!note && <IdeaChips ideas={ideas} selected={picked?.label ?? null} onPick={pick} />}

          <SharedLine homeName={homeName} compact />
          {error && <div role="alert" className="text-[13px]" style={{ color: CLAY }}>{error}</div>}

          <div className="flex items-center gap-3">
            {note && onDelete && (
              <button
                type="button"
                onClick={() => void run("delete", onDelete)}
                disabled={busy !== null}
                className="rounded-xl px-2 py-3 text-[14px] font-semibold disabled:opacity-50"
                style={{ color: CLAY }}
              >
                {busy === "delete" ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="button"
              onClick={() => void run("save", () => onSave(text.trim()))}
              disabled={blank || busy !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3.5 text-[16px] font-bold text-white disabled:opacity-50"
              style={{ background: TEAL }}
            >
              {busy === "save" && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
              {note ? "Save" : "Save note"}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
