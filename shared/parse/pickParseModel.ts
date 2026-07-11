/**
 * Manual-parse model selection — ported VERBATIM from v1
 * `supabase/functions/_shared/mod.ts` (see _v1-mod-reference.ts.txt).
 * Invariant 4 (docs/homehub-v2-implementation-plan.md): Sonnet 4.6 default,
 * escalate to Opus 4.8 for combustion/gas/safety-critical items. Any drift from
 * v1 is a review-blocker until v1 is archived.
 */

/**
 * Default parsing model. Sonnet 4.6 replaced Haiku 4.5 after the model eval:
 * Haiku was the most run-to-run inconsistent (count drift, same-task
 * reclassification, confidence swings) and weakest on edge judgment. Sonnet is
 * the steady baseline that handles the vast majority of manuals correctly.
 */
export const PARSE_MODEL_DEFAULT = "claude-sonnet-4-6"
/**
 * Escalation model for combustion / gas / safety-critical manuals. Opus 4.8
 * showed the best edge judgment in the eval (setup vs recurring, off-enum
 * cadences, refusing to write hazardous homeowner DIY steps) — worth its
 * ~1.67× cost only on these manuals, which are a small slice of the catalog.
 */
export const PARSE_MODEL_ESCALATED = "claude-opus-4-8"

/** Categories whose manuals are inherently combustion/safety-critical (HVAC,
 *  furnace, boiler, water heater, etc. all live under `system`). */
const ESCALATE_CATEGORIES = new Set(["system"])
/** Gas/combustion/safety signals in free-text item fields that escalate an
 *  otherwise-default item (e.g. a gas range or gas dryer under
 *  `major_appliance`). Word-boundaried to avoid matching "glass", "elpaso", … */
const ESCALATE_SIGNAL_RE =
  /\b(gas|propane|lp|combustion|furnace|boiler|burner|flame|water[ -]?heater|hvac|fireplace|generator|woodstove|pellet)\b/i

/**
 * Choose the parsing model for an item. Defaults to Sonnet 4.6; escalates to
 * Opus 4.8 for combustion/gas/safety-critical items — identified by item
 * category (`system`) or a gas/combustion signal in any free-text field
 * (sub_type / display_name / model). Everything else parses fine, and cheaper,
 * on Sonnet, so the blended cost stays close to Sonnet-only.
 */
export function pickParseModel(item: {
  item_category?: string | null
  sub_type?: string | null
  display_name?: string | null
  model?: string | null
}): string {
  if (item.item_category && ESCALATE_CATEGORIES.has(item.item_category)) {
    return PARSE_MODEL_ESCALATED
  }
  const haystack = [item.sub_type, item.display_name, item.model]
    .filter((s): s is string => typeof s === "string" && s.length > 0)
    .join(" ")
  if (haystack && ESCALATE_SIGNAL_RE.test(haystack)) {
    return PARSE_MODEL_ESCALATED
  }
  return PARSE_MODEL_DEFAULT
}
