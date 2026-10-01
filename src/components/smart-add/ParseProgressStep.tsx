/**
 * ParseProgressStep — the wizard's animated "Reading your manual" screen — is
 * RETIRED. #161 made the wizard two screens and handed the running parse to
 * the item page (one line and a rail, HH-135), and nothing has rendered this
 * component since; the dead-code sweep (audit 2026-09-29) deleted it.
 *
 * Only its progress type survives here, because
 * modules/knowledge/services/parseManualService.ts (toUiStage) imports it from
 * this path and that file belongs to a concurrent package (E2) this round.
 * Follow-up: move the type next to toUiStage and delete this file.
 */

/**
 * UI stages for the parse trust arc (fix B). Maps from the worker's Firestore
 * `parse.stage` via `toUiStage` in parseManualService: started/pdf_fetched →
 * reading, claude_* → extracting, committing → saving.
 */
export type ParseProgressState =
  | "idle"
  | "uploading"
  | "queued"
  | "reading"
  | "extracting"
  | "saving"
  | "done"
  | "error"
