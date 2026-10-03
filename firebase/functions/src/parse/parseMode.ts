/**
 * The three parse modes, and the one rule for a mode that arrives from
 * outside — a request body, or a manual doc a member can write (H3a).
 */
import { z } from "zod"
import type { ParseMode } from "./parseTypes.js"

export const PARSE_MODES = ["commit", "preview", "fill_gaps"] as const satisfies readonly ParseMode[]
export const ParseModeSchema = z.enum(PARSE_MODES)

/**
 * FAIL SAFE, not fail destructive. enqueueParse once defaulted to "commit", so
 * a request that omitted or misspelled the mode wrote tasks straight into
 * someone's home. "preview" only writes a draft the user must accept, so the
 * worst a malformed or stale mode can do is prepare something and wait.
 * `recognised` is false only for a value that was present and wrong.
 */
export function parseModeOrPreview(raw: unknown): { mode: ParseMode; recognised: boolean } {
  const parsed = ParseModeSchema.safeParse(raw)
  return parsed.success ? { mode: parsed.data, recognised: true } : { mode: "preview", recognised: raw === undefined }
}
