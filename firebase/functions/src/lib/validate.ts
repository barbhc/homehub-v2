/**
 * Input validation at the door (H3a, 2026-09-30).
 *
 * The owner's rule: every request body, uploaded file and external response is
 * validated with a schema at the point of entry, and an `as` cast on external
 * data — or trusting a typed `request.data` — is a review-blocking defect. A
 * callable's TypeScript type says nothing about what actually arrives: any
 * signed-in client can send any JSON.
 *
 * So every onCall / onRequest / onTaskDispatched handler parses its input with
 * a zod schema straight after its auth check, before any read, charge or
 * write. A failure:
 *
 *  - in a callable throws HttpsError("invalid-argument", <one calm line>) — the
 *    schema's own message when it wrote one for the failing field (so existing
 *    user-facing wording survives), otherwise the handler's fallback;
 *  - in an HTTP handler answers 400 { error: <the same line> };
 *  - in the parse worker drops the task: a retry cannot fix a malformed payload.
 *
 * Each is logged as `invalid input` with the function name and the issue PATHS
 * and codes — never the values, which are the caller's data.
 */
import { z } from "zod"
import { HttpsError } from "firebase-functions/v2/https"
import * as logger from "firebase-functions/logger"

/**
 * A Firestore document id usable as ONE path segment. Ids are interpolated
 * into paths (`homes/${homeId}/members/${uid}`), so a slash would address a
 * different document — `homeId: "A/manuals/M"` made the membership check read
 * `homes/A/manuals/M/members/{uid}`, a doc a member of A can write themselves.
 * `.`, `..` and `__x__` are ids Firestore itself refuses. The 200-character cap
 * is the one enqueueParse and the parse worker already used; real ids (auto
 * ids, uids, seeded ids) are far shorter.
 */
export function isDocIdSegment(s: string): boolean {
  return s.length > 0 && s.length <= 200 && !s.includes("/") && s !== "." && s !== ".." && !/^__.*__$/.test(s)
}
export const DocId = z.string().refine(isDocIdSegment)

/** What gets logged about a rejected input: where, and what kind of problem. */
export interface InputIssue {
  path: string
  code: string
}

/** Paths and codes only, capped — a payload with a thousand bad rows logs ten. */
export function inputIssues(error: z.ZodError): InputIssue[] {
  return error.issues.slice(0, 10).map((i) => ({
    path: i.path.length > 0 ? i.path.map((p) => String(p)).join(".") : "(root)",
    code: i.code,
  }))
}

/**
 * Marks an issue the schema wrote no message for. zod applies a schema's own
 * message ahead of this per-parse one, so anything else is author-written.
 */
const NO_AUTHORED_MESSAGE = "\u0000"

export type CheckedInput<T> =
  | { ok: true; data: T }
  | { ok: false; message: string | null; issues: InputIssue[] }

/**
 * Pure: parse `data`. On failure, `message` is the schema's own wording for
 * the FIRST failing field, or null when it has none (the caller supplies a
 * fallback) — the first, because that is the field the old hand checks
 * reported, and a later field's message would describe the wrong problem.
 */
export function checkInput<S extends z.ZodType>(schema: S, data: unknown): CheckedInput<z.output<S>> {
  const result = schema.safeParse(data, { error: () => NO_AUTHORED_MESSAGE })
  if (result.success) return { ok: true, data: result.data }
  const first = result.error.issues[0]
  return {
    ok: false,
    message: first && first.message !== NO_AUTHORED_MESSAGE ? first.message : null,
    issues: inputIssues(result.error),
  }
}

export function logInvalidInput(fn: string, issues: InputIssue[]): void {
  logger.warn("invalid input", { fn, issues })
}

/** A callable's input, or HttpsError("invalid-argument") — logged, never echoed. */
export function parseCallableInput<S extends z.ZodType>(fn: string, schema: S, data: unknown, fallback: string): z.output<S> {
  const checked = checkInput(schema, data)
  if (checked.ok) return checked.data
  logInvalidInput(fn, checked.issues)
  throw new HttpsError("invalid-argument", checked.message ?? fallback)
}

/** An HTTP handler's input, or the 400 it should answer (logged). */
export function parseHttpInput<S extends z.ZodType>(
  fn: string,
  schema: S,
  data: unknown,
  fallback: string,
): { ok: true; data: z.output<S> } | { ok: false; status: 400; error: string } {
  const checked = checkInput(schema, data)
  if (checked.ok) return checked
  logInvalidInput(fn, checked.issues)
  return { ok: false, status: 400, error: checked.message ?? fallback }
}

/**
 * A stored document's fields, checked instead of cast (H3a §3) — for reads
 * that drive a write or a charge. Returns null (logged, with the doc path and
 * the issue paths) when the stored shape is wrong; the caller decides what a
 * malformed doc means, and says so where it decides.
 */
export function readStored<S extends z.ZodType>(fn: string, docPath: string, schema: S, data: unknown): z.output<S> | null {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  logger.warn("malformed stored document", { fn, docPath, issues: inputIssues(result.error) })
  return null
}

/** A finite, non-negative number, or undefined — for counters read from a doc. */
export function storedCount(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined
}

/** A string, or null — for optional text read from a doc. */
export function storedText(v: unknown): string | null {
  return typeof v === "string" ? v : null
}

