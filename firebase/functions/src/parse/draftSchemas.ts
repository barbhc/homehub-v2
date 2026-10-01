/**
 * The reviewed draft commitManualDraft receives (H3a).
 *
 * What arrives is the worker's NORMALIZED previewDraft (runParse writes it;
 * src/modules/knowledge/services/parseManualService.ts reads it back), possibly
 * edited in the review sheet, sent back over the wire. So the contract is the
 * normalizer's own output types: enums are the canonical lists (the draft was
 * already coerced to them, and the review sheet only offers those), numbers
 * are numbers, text is text, and null stands in for "none" anywhere the draft
 * writes null. Keys the normalizers don't read (steps, confidence, …) are
 * dropped here, as normalizeChunkRow/normalizeTaskRow drop them anyway.
 *
 * Two deliberate tolerances, each a field the client cannot edit and the
 * parser passes through from the MODEL untouched:
 *  - a chunk's `source_pages` and a task's `diagram_pages` that are not the
 *    declared shape are dropped (read as absent → []), not refused. One model
 *    glitch in page metadata must not cost someone their whole reviewed save.
 *  - `last_done_on` is left to parseLastDone, which degrades a bad date to
 *    "anchor on today" by design (shared/care/lastDone.ts).
 *
 * Caps: 500 rows each — Firestore's per-batch write limit. commitDraft writes
 * the chunk swap and the task reconciliation as single batches, so a longer
 * list could never commit; refusing it up front costs nothing valid.
 */
import { z } from "zod"
import {
  VALID_CARE_TYPES,
  VALID_CHUNK_TYPES,
  VALID_CONTENT_LEVELS,
  VALID_PRIORITY_TIERS,
  VALID_RISK_LEVELS,
  VALID_SCHEDULE_TYPES,
  type ParsedChunk,
  type ParsedTask,
} from "../../../../shared/parse/parseCore.js"
import { DocId } from "../lib/validate.js"

export const MAX_DRAFT_ROWS = 500

/** `null` and absent both mean "none" — the normalizers read `undefined`. */
const opt = <T extends z.ZodType>(schema: T) => schema.nullish().transform((v) => v ?? undefined)
/** A canonical enum value, as the normalizer would have produced it. */
const oneOf = <const T extends readonly [string, ...string[]]>(values: T) => opt(z.enum(values))
/** Model pass-through metadata: kept when it is the declared shape, dropped otherwise. */
const lenient = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

const asTuple = <T extends string>(values: readonly T[]) => values as unknown as readonly [T, ...T[]]

export const DraftChunk = z.object({
  chunk_type: oneOf(asTuple(VALID_CHUNK_TYPES)),
  content_level: oneOf(asTuple(VALID_CONTENT_LEVELS)),
  title: opt(z.string()),
  content: z.string(),
  tags: opt(z.array(z.string())),
  scenarios: opt(z.array(z.object({ condition: z.string(), steps: z.array(z.string()) }))),
  source_pages: lenient(z.array(z.number())),
  diagram_pages: lenient(
    z.array(
      z.object({
        page: z.number(),
        caption: z.string(),
        crop: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(),
      }),
    ),
  ),
  table_data: lenient(
    z.array(
      z.object({
        table_title: z.string().optional(),
        columns: z.array(z.string()).optional(),
        rows: z.array(z.array(z.string())).optional(),
      }),
    ),
  ),
  applies_to: opt(z.array(z.string())),
}) satisfies z.ZodType<ParsedChunk>

export const DraftTask = z.object({
  title: z.string(),
  description: opt(z.string()),
  care_type: oneOf(asTuple(VALID_CARE_TYPES)),
  justification: opt(z.string()),
  priority_tier: oneOf(asTuple(VALID_PRIORITY_TIERS)),
  risk_level: oneOf(asTuple(VALID_RISK_LEVELS)),
  estimated_minutes: opt(z.number()),
  schedule_type: oneOf(asTuple(VALID_SCHEDULE_TYPES)),
  interval_days: opt(z.number()),
  interval_days_min: opt(z.number()),
  interval_days_max: opt(z.number()),
  instructions_text: opt(z.string()),
  source_page: opt(z.number()),
  tags: opt(z.array(z.string())),
  diagram_pages: lenient(z.array(z.object({ page: z.number(), caption: z.string() }))),
  symptom_tags: opt(z.array(z.string())),
  re_check_triggers: opt(
    z.array(z.object({ trigger: opt(z.string()), description: opt(z.string()), severity: opt(z.string()) })),
  ),
  applies_to: opt(z.array(z.string())),
  supplies: opt(
    z.array(
      z.union([
        z.string(),
        z.object({ name: opt(z.string()), category: opt(z.string()), part_number: opt(z.string()) }),
      ]),
    ),
  ),
  // The reviewer's own answers — not parser fields (see commitManualDraft).
  remind_enabled: z.boolean().nullish().transform((v) => v ?? null),
  last_done_on: z.unknown().optional(), // absent on every row the reviewer didn't date
}) satisfies z.ZodType<ParsedTask>

export const CommitManualDraftRequest = z.object({
  homeId: DocId,
  manualId: DocId,
  chunks: z.array(DraftChunk).max(MAX_DRAFT_ROWS),
  tasks: z.array(DraftTask).max(MAX_DRAFT_ROWS),
})
