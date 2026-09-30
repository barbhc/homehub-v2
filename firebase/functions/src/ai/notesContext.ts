/**
 * The household's own notes in Ask (design/spares-and-notes.md §2, PR 3).
 *
 * Notes hold what the manual never will — where the water shutoff is, which
 * paint is on the kitchen walls, that the furnace clicks twice and the tech
 * says that's normal. chatQuery fed only manual chunks, so "where's the water
 * shutoff?" could not be answered from the note she wrote down.
 *
 * Only notes that MATCH the question go in, and only their scopes are cited —
 * a chip for a note the answer didn't need would be a claim we can't back.
 */
import { splitNote } from "../../../../shared/notes/splitNote.js"
import { queryTerms, scoreChunk } from "./chunkRanking.js"

export type NoteScopeKind = "home" | "room" | "item_unit"

/** One note as Ask sees it: text plus the scope it belongs to, by name. */
export interface NoteInput {
  scope: NoteScopeKind
  /** "House", a room's name, or an item's name. */
  scopeLabel: string
  title: string | null
  content: string
}

export interface PickedNote extends NoteInput {
  heading: string | null
  body: string
}

/** The notes worth reading for this question, best match first, at most `limit`. */
export function pickNotes(question: string, notes: NoteInput[], limit = 8): PickedNote[] {
  const terms = queryTerms(question)
  if (terms.length === 0) return []
  return notes
    .map((n, i) => {
      const { heading, body } = splitNote(n.content, n.title)
      const score = scoreChunk(terms, {
        strong: `${n.scopeLabel} ${heading ?? ""}`.toLowerCase(),
        body: body.toLowerCase(),
      })
      return { note: { ...n, heading, body }, score, i }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.note)
}

/** The block the model reads; "" when nothing matched. */
export function formatNotesBlock(notes: PickedNote[]): string {
  if (notes.length === 0) return ""
  const parts = ["---", "## Your notes (what the household wrote down)"]
  for (const n of notes) {
    const text = n.heading ? `${n.heading}: ${n.body}` : n.body
    parts.push(`- [${n.scopeLabel}] ${text.replace(/\s*\n\s*/g, " ")}`)
  }
  parts.push("---")
  return parts.join("\n")
}

/** One source per scope actually used, in the order first used. */
export function noteSources(notes: PickedNote[]): { title: string; item_name: string; source_type: "note" }[] {
  const seen = new Set<string>()
  const out: { title: string; item_name: string; source_type: "note" }[] = []
  for (const n of notes) {
    if (seen.has(n.scopeLabel)) continue
    seen.add(n.scopeLabel)
    out.push({ title: "Your note", item_name: n.scopeLabel, source_type: "note" })
  }
  return out
}
