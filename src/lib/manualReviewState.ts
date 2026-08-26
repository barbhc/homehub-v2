/**
 * HH-141 — the item page's missing third state.
 *
 * The page knew two things about a manual: it is being read (`parse_stage` in
 * ACTIVE_PARSE_STAGES) or it has been read (`parsed_at` set). A parse that has
 * FINISHED but whose results were never saved is neither, so the page fell
 * through to its no-manual state and offered to add the manual it had just
 * read — directly under ParsePickupCard saying it had read it.
 *
 * The signal is exact rather than heuristic. `parsedAt` is stamped by
 * `commitDraft` and by nothing else, so:
 *
 *   stage "done" + parsed_at null  ⟺  read, results not saved
 *
 * Preview parses take that branch by design ("Preview NEVER commits — it
 * writes previewDraft only"), and `commitManualDraft` — the review sheet's
 * Save — goes through `commitDraft`, so saving clears this state in the same
 * write that clears the draft. An errored parse is stage "error", and a
 * pre-parse-era doc has no stage at all; neither is caught here.
 */

/** The two fields this decision reads. Kept structural so callers can pass a
 *  ManualDocument, and so the test does not need the whole 15-field type. */
export interface ManualParseFacts {
  parse_stage: string | null
  parsed_at: string | null
}

/** A manual that has been read, whose findings are still waiting to be saved. */
export function isAwaitingReview(m: ManualParseFacts): boolean {
  return m.parse_stage === "done" && m.parsed_at === null
}

/** Does this item have a finished parse nobody has saved yet? */
export function anyAwaitingReview(manuals: ManualParseFacts[]): boolean {
  return manuals.some(isAwaitingReview)
}
