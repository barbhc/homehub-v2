/**
 * Pure half of scripts/ops/migrate-whole-home-faq.ts: which saved Ask answers
 * move, and the House note each one becomes. No Firestore here — the CLI reads
 * the docs and hands in plain values — so the rule is unit-tested on its own
 * (wholeHomeFaqMigration.test.ts).
 *
 * WHY: an answer saved from Ask with the dialog's "Home (not item-specific)"
 * choice (`chatFaqs` with no itemUnitId) was listed by ONE screen, the Care
 * Guide page at /faq. The dead-code sweep deleted that page (audit 2026-09-29,
 * D5), so those answers have no screen. Item-scoped answers are unaffected —
 * the item page shows them.
 *
 * WHERE THEY GO: a House note — `homes/{homeId}/careNotes` with scope "home",
 * the store the Notes feature reads (design/spares-and-notes.md §2; Items →
 * House notes, and Ask reads house notes as "Your notes"). A note is just text
 * with `title: null`; its heading is derived at render by splitNote. So the
 * question is the first line and the answer follows it: a short first line
 * over more lines IS the heading, and the note editor (which edits `content`
 * only) can change every word of it.
 *
 * WHAT IS KEPT: the source answer is never deleted. Each note records where it
 * came from — `source: "faq-migration"` and `faqId: <the chatFaqs id>` — and
 * its id is derived from that id (`faq-<faqId>`), so running the migration
 * twice finds the note already there and writes nothing.
 */

export const MIGRATION_SOURCE = "faq-migration"
export const NOTE_ID_PREFIX = "faq-"

/** The careNotes doc id for one saved answer — deterministic, so reruns are no-ops. */
export const noteIdForFaq = (faqId: string): string => `${NOTE_ID_PREFIX}${faqId}`

/** What the planner needs from one chatFaqs doc. */
export interface FaqFacts {
  id: string
  itemUnitId: unknown
  question: unknown
  answer: unknown
}

/** A saved answer is whole-home when it names no item — the dialog wrote null. */
export function isWholeHomeFaq(itemUnitId: unknown): boolean {
  return itemUnitId == null || (typeof itemUnitId === "string" && itemUnitId.trim() === "")
}

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "")

/** The note's text: the question as its first line (the heading), the answer beneath. */
export function noteContentFor(question: string, answer: string): string {
  const q = question.trim()
  const a = answer.trim()
  if (!q) return a
  if (!a) return q
  return `${q}\n${a}`
}

export type PlanRow =
  | { faqId: string; action: "create"; noteId: string; content: string }
  | { faqId: string; action: "already-migrated"; noteId: string }
  | { faqId: string; action: "skip-empty" }

/**
 * One row per WHOLE-HOME answer (item-scoped answers are not this migration's
 * business and are not listed). `existingNoteIds` is every careNotes id the
 * home already has — a note at `faq-<id>` means a previous run moved it.
 */
export function planMigration(faqs: FaqFacts[], existingNoteIds: ReadonlySet<string>): PlanRow[] {
  return faqs
    .filter((f) => isWholeHomeFaq(f.itemUnitId))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f): PlanRow => {
      const noteId = noteIdForFaq(f.id)
      if (existingNoteIds.has(noteId)) return { faqId: f.id, action: "already-migrated", noteId }
      const content = noteContentFor(text(f.question), text(f.answer))
      if (!content) return { faqId: f.id, action: "skip-empty" }
      return { faqId: f.id, action: "create", noteId, content }
    })
}

/**
 * The careNotes document for one planned row — the exact field set
 * careNoteService.createCareNote writes, plus the provenance pair. Timestamps
 * are handed in (the CLI passes Firestore values), so this stays pure.
 */
export function noteDocFor<T>(
  row: Extract<PlanRow, { action: "create" }>,
  stamps: { createdAt: T; updatedAt: T; migratedAt: T },
): Record<string, unknown> {
  return {
    roomId: null,
    itemUnitId: null,
    scope: "home",
    category: null,
    chunkType: "care",
    title: null,
    content: row.content,
    source: MIGRATION_SOURCE,
    sourceUrl: null,
    taskTemplateId: null,
    faqId: row.faqId,
    createdAt: stamps.createdAt,
    updatedAt: stamps.updatedAt,
    migratedAt: stamps.migratedAt,
    deletedAt: null,
  }
}
