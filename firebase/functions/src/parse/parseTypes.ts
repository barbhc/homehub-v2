/**
 * Parse pipeline types — the frozen state-machine contract from
 * docs/firestore-model.md §8. The worker writes `parse.stage` on every
 * transition; the client watches it via onSnapshot. Because the worker reaches
 * `done` only AFTER the commit, the v1 fire-and-forget empty-review bug is
 * impossible by construction.
 */

export type ParseMode = "commit" | "preview" | "fill_gaps"

export type ParseStage =
  | "queued"
  /** Refused by the AI ceiling, not by anything the user did. The manual is
   *  saved and WILL be parsed — `retryAwaitingCapacity` picks it back up when
   *  capacity frees. Deliberately NOT in enqueueParse's ACTIVE_STAGES: nothing
   *  is running, so it must not consume the in-flight slot that would stop the
   *  user starting a different parse. (The CLIENT's ACTIVE_PARSE_STAGES does
   *  include it, because from the user's side it is pending.) */
  | "awaiting_capacity"
  | "started"
  | "pdf_fetched"
  | "claude_call"
  | "claude_responded"
  | "committing"
  | "done"
  | "error"

export interface ParseConfidence {
  overall: number
  safety: number
  how_to: number
  care: number
  troubleshooting: number
  notes: string
}

/** Shape written under `manuals/{manualId}.parse`. */
export interface ParseState {
  stage: ParseStage
  stageAt: FirebaseFirestore.Timestamp
  requestId: string
  mode: ParseMode
  model: string
  attempt: number
  error: { message: string; stage: ParseStage; at: FirebaseFirestore.Timestamp } | null
  /** Set only while stage is `awaiting_capacity`. `uid` is whose daily quota
   *  the retry must charge — the scheduled job has no caller context, and
   *  charging the wrong person's allowance would be worse than not retrying. */
  awaiting?: { uid: string; since: FirebaseFirestore.Timestamp } | null
  summary: { chunks: number; tasks: number; confidence: ParseConfidence | null } | null
}

/** The validated tool-call output (EXTRACTION_TOOL). Depth stays permissive —
 *  deep validation lives in the normalizers (parseCore). */
export interface ExtractionResult {
  chunks: unknown[]
  tasks: unknown[]
  cleaning_guide?: unknown
  warranty?: unknown
  manufactured_year?: number | null
  confidence?: ParseConfidence | null
}

/** Item fields the parse needs (subset of the item doc). */
export interface ParseItemFacts {
  itemUnitId: string
  item_category?: string | null
  sub_type?: string | null
  display_name?: string | null
  model?: string | null
  accessories?: string[]
}

/** One Claude extraction call. Injectable so the worker core is testable with a
 *  fixture response (no real API / no cost). */
export type CallClaude = (args: {
  model: string
  pdfBase64: string
  prompt: string
  existingTitles?: string[]
}) => Promise<{ content?: Array<{ type: string; name?: string; input?: unknown; text?: string }> }>

/** Fetch the manual PDF as base64. Injectable (Storage in prod, fixture in tests). */
export type FetchPdf = (sourceType: string, sourceRef: string) => Promise<string>
