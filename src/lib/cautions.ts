/**
 * Shared caution/warning extraction.
 *
 * Manual instructions routinely bake "do not…" safety warnings into step prose.
 * Rendered as numbered steps they read as nonsense ("5. Do NOT use steel wool").
 * These belong in a distinct ⚠ callout, not the step list. This helper is used
 * by every surface that renders task/clean steps so the behavior is consistent.
 */
export const CAUTION_PATTERN = /\b(do\s*not|don'?t|never|avoid|caution|warning|must not)\b/i

/**
 * A line is a *standalone* caution only when it LEADS with a warning directive
 * ("Do not…", "Never…", "Avoid…", "Caution:…", "Warning:…"). A warning buried
 * inside an actionable step — e.g. "Wash heads with a plastic brush (never
 * steel wool)" — stays a step, so the action isn't lost to the callout.
 */
const LEADING_CAUTION = /^\s*(?:⚠\s*)?(?:do\s*not|don'?t|never|avoid|must\s*not|caution|warning)\b/i

export interface SplitSteps {
  /** Actionable steps, with caution-style lines removed. */
  steps: string[]
  /** Warnings / "do not" statements to render as a ⚠ callout. */
  cautions: string[]
}

/**
 * Splits parsed instruction lines into actionable steps vs. cautions.
 * `extra` holds cautions from a structured source (e.g. a `cautions` column);
 * they're unioned with the heuristically-detected ones and de-duplicated.
 */
export function splitCautions(lines: string[], extra: string[] = []): SplitSteps {
  const steps: string[] = []
  const found: string[] = []
  for (const line of lines) {
    if (LEADING_CAUTION.test(line)) found.push(line)
    else steps.push(line)
  }
  const cautions = Array.from(
    new Set(
      [...extra, ...found].map((c) =>
        String(c).replace(/^(?:⚠\s*)?(?:caution|warning)[:\s]+/i, "").trim()
      )
    )
  ).filter(Boolean)
  return { steps, cautions }
}
