/**
 * The ONE account of where an item's manual stands — reading, read and waiting
 * for its review, or read and saved.
 *
 * HH-161 (audit 2026-09-29): four readers on the item page disagreed about the
 * same manual. The page's one-time list said nothing was happening, the pickup
 * card's own watch said it was being read, the tray said something else, and
 * "awaiting review" had three definitions — this file, the tray's "done with a
 * draft", and the pickup card's "done and flagged, or done with a draft". They
 * split exactly where it hurts: a manual read AGAIN after it was saved (a
 * rescan ends in the review now) was "ready" to the tray and "nothing waiting"
 * here, so the page offered no hand-off for the draft the tray was pointing at.
 *
 * Every surface now reads the live manual docs (useItemManuals on the item
 * page, useParseTray everywhere) through these functions, so they cannot
 * disagree about a document they both see.
 *
 * HH-141 is still the heart of it: a finished read whose findings are not saved
 * is its own state — neither "has a manual" nor "being read" — and without it
 * the page offered to add the manual it had just read.
 */
import { ACTIVE_PARSE_STAGES, type ParseStage } from "@/modules/knowledge/services/parseManualService"

/** The fields these decisions read. Structural, so a caller can pass a
 *  ManualDocument and a test need not build all of one. */
export interface ManualParseFacts {
  parse_stage: string | null
  parsed_at: string | null
  /** The doc carries a preview draft (`previewDraft`) — what Save would commit. */
  has_preview_draft: boolean
  /** The latest read's mode — "preview" | "commit" | "fill_gaps"; null on docs
   *  from before the worker stamped it. */
  parse_mode: string | null
}

/**
 * Read, and its findings are waiting to be saved.
 *
 * `runParse` writes `previewDraft` ONLY in preview mode, and the review's Save
 * (`commitManualDraft`) clears it in the same write that stamps `parsedAt`. So
 * a finished read that still has a draft is waiting on a person — with one
 * exception: a draft left from an older preview that a COMMIT-mode run (Fill
 * gaps) has since overtaken. That run stamped `parsedAt` and did not touch the
 * draft, so a draft on a saved manual counts only when the latest read was
 * itself a preview.
 *
 *   done + draft + never saved                 → waiting (the first read)
 *   done + draft + saved before + read again   → waiting (a rescan, HH-161)
 *   done + draft + saved by a later commit run → not waiting (stale draft)
 *   done + no draft                            → not waiting (saved)
 */
export function isAwaitingReview(m: ManualParseFacts): boolean {
  if (m.parse_stage !== "done" || !m.has_preview_draft) return false
  return m.parsed_at === null || m.parse_mode === "preview"
}

/** Does this item have a finished read nobody has saved yet? */
export function anyAwaitingReview(manuals: ManualParseFacts[]): boolean {
  return manuals.some(isAwaitingReview)
}

/** A read in progress — including one parked for capacity, which the user was
 *  told is queued and will start on its own (see ACTIVE_PARSE_STAGES). */
export function isReading(m: Pick<ManualParseFacts, "parse_stage">): boolean {
  return !!m.parse_stage && (ACTIVE_PARSE_STAGES as string[]).includes(m.parse_stage)
}

/**
 * Stages at which THIS read has fetched the PDF. The worker writes `pdfPages`
 * once, at `pdf_fetched`, and a new read's enqueue merges over the old `parse`
 * without clearing it — so before this read reaches `pdf_fetched`, the count on
 * the doc belongs to the PREVIOUS read. Showing it then would be a guess.
 */
const PAGES_KNOWN: readonly string[] = ["pdf_fetched", "claude_call", "claude_responded", "committing"]

/**
 * The page count to show while a manual is read: the worker's own count, and
 * only once this read has counted. Never an estimate, and never "page N of M"
 * — the worker reports the total, not its position (HH-135, HH-161 S1.5).
 */
export function readingPages(m: { parse_stage: string | null; parse_pages?: number | null }): number | null {
  if (!m.parse_stage || !PAGES_KNOWN.includes(m.parse_stage)) return null
  return typeof m.parse_pages === "number" && m.parse_pages > 0 ? m.parse_pages : null
}

/** What the item page shows while a manual is read. */
export interface ManualReading {
  stage: ParseStage
  pages: number | null
}

/** Where the item's manuals stand, once, for every surface on the page. */
export interface ItemManualState {
  /** A manual's findings are saved — answers and steps come from it. */
  hasManual: boolean
  /** A read in progress, or null. */
  reading: ManualReading | null
  /** A finished read waiting for its review (HH-141). */
  awaitingReview: boolean
}

type LiveManual = ManualParseFacts & { parse_pages?: number | null }

/**
 * @param starting this page is handing a manual to the reader right now — the
 *   record is being created and the read enqueued, before the worker has
 *   written a stage of its own. The live list shows the new record the moment
 *   it is written, and without this it would sit there, stage-less, reading as
 *   "no upkeep — add the manual" for the second it takes the read to queue.
 */
export function itemManualState(manuals: LiveManual[], starting = false): ItemManualState {
  const live = manuals.find(isReading)
  return {
    hasManual: manuals.some((m) => m.parsed_at !== null),
    reading: live
      ? { stage: live.parse_stage as ParseStage, pages: readingPages(live) }
      : starting ? { stage: "queued", pages: null } : null,
    awaitingReview: anyAwaitingReview(manuals),
  }
}

/**
 * The Ask card's promise, in the page's one account of the manual. It must not
 * say "once the manual is added" under a manual being read (HH-161 S1.4), nor
 * under one read and waiting to be saved (HH-141).
 */
export function askHint(state: ItemManualState): string {
  if (state.hasManual) return "Ask about this item — answers come from your manual"
  if (state.awaitingReview) return "Save what we found and answers come from your manual."
  if (state.reading) return "Works best once we’ve read the manual."
  return "Works best once the manual is added."
}
