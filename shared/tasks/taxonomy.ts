/**
 * Task taxonomy — the deterministic backstop that keeps parsed tasks
 * Relevant / Useful / Timely (2026-07-29 dogfooding gate: "Homehub is not
 * ready to share until task noise is fixed").
 *
 * Three kinds, decided here regardless of what the extraction model said:
 *   operational  — how you USE the appliance (consumables, settings). Never a
 *                  task: converted to a "usage tip" so the info survives on the
 *                  item page + in chat, but nothing is scheduled or notified.
 *   cleaning     — appearance/hygiene upkeep (wipe, surfaces, shelves). Stays a
 *                  task but careType=cleaning, which the agenda/alerts exclude.
 *   maintenance  — function/safety-preserving work. The only kind that can be
 *                  Essential.
 *
 * Essential gate (the user's decision, 2026-07-29): Essential requires
 * maintenance/mixed + risk safety|prevent_damage — deterministic floor. A task
 * the model marked essential that fails the floor is demoted to recommended and
 * stamped `essential_candidate` ("hygiene" | "manual_emphasis") so the USER can
 * promote it per-task (promotion re-enables proactive alerts).
 *
 * The extraction prompt carries matching rules (the belt); this module is the
 * suspenders — prompt guidance drifts, these regexes don't. Pure, zero imports,
 * shared client + Functions (same arrangement as houseRules.ts): the parse
 * commit path applies it to fresh rows, and the backfill sweep applies the same
 * logic to existing templates.
 */

export type TaskKind = "operational" | "cleaning" | "maintenance"
export type EssentialCandidateReason = "hygiene" | "manual_emphasis"

/** The task-row fields the taxonomy reads/writes (a subset of NormalizedTaskRow;
 *  the sweep maps template docs into this shape). */
export interface TaxonomyTaskFields {
  title: string
  description?: string | null
  justification?: string | null
  care_type: string
  priority_tier: string
  risk_level: string
  schedule_type: string
  instructions_override?: string | null
  source_page?: number | null
  /** Stamped by the essential gate; persisted so the UI can offer promotion. */
  essential_candidate?: EssentialCandidateReason | null
}

/** A converted operational row — becomes a chunk ("usage tip"), not a task. */
export interface UsageTip {
  title: string
  content: string
  source_pages: number[]
}

/** The tag that marks a chunk as a usage tip — the item page's "Using it well"
 *  section queries on it, and chat can cite it like any other chunk. */
export const USAGE_TIP_TAG = "usage_tip"

/**
 * A usage tip in ParsedChunk shape, ready for `normalizeChunkRow`. how_to +
 * "everyday" is the existing pair for routine-use content (see
 * validateContentLevel), and USAGE_TIP_TAG is what distinguishes a tip from a
 * regular how_to chunk.
 */
export function usageTipToChunk(tip: UsageTip): {
  chunk_type: "how_to"
  content_level: "everyday"
  title: string
  content: string
  tags: string[]
  source_pages: number[]
} {
  return {
    chunk_type: "how_to",
    content_level: "everyday",
    title: tip.title,
    content: tip.content,
    tags: [USAGE_TIP_TAG],
    source_pages: tip.source_pages,
  }
}

export interface TaxonomyResult<T> {
  tasks: T[]
  tips: UsageTip[]
  /** maintenance/mixed rows rewritten to careType cleaning. */
  reclassified: number
  /** essential rows demoted to recommended (each carries essential_candidate). */
  demoted: number
}

// ── Operational detection ─────────────────────────────────────────────────────
// Consumables you top up to RUN the appliance. The filter/cartridge negative is
// what separates "Replace Water in the Tank" (operating a Nespresso) from
// "Replace Water Filter" (genuine maintenance).
const CONSUMABLE_VERB = /\b(add|re-?fill|fill|top[ -]?up|load|insert|pour|replace)\b/i
const CONSUMABLE_OBJECT = /\b(detergent|rinse[ -]?aid|dishwasher salt|(?:fabric )?softener|pods?|capsules?|k[ -]?cups?|beans|grounds|coffee|water)\b/i
// Hardware/parts that make a "replace water …" title genuine maintenance:
// "Replace Water in the Tank" is operating a Nespresso; "Replace water inlet
// hoses" is a real 5-year washer task. Same for filters, valves, heater parts.
const MAINTENANCE_CONSUMABLE = /\b(filters?|cartridges?|purifi\w*|descal\w*|hoses?|lines?|valves?|pumps?|anodes?|heaters?|softener system)\b/i
// One-time config / personalization — using the appliance's settings, not upkeep.
const CONFIG_PATTERN = /\b(wi[- ]?fi|bluetooth|pair(?:ing)?\b|connect (?:to )?(?:the )?app|app setup|presets?|program\w* .*(?:volume|cup|favorite)|set (?:the )?clock|register (?:the|your)\b|adjust\w* .*\bsettings?\b)\b/i

// ── Cleaning reclassification ────────────────────────────────────────────────
// Appearance/hygiene surfaces. The functional negative keeps "Clean the Filter
// System" / "Vacuum refrigerator coils" / "Clean Surface Burner Caps" as
// maintenance — cleaning a functional part IS function-preserving work.
const CLEANING_VERB = /\b(clean|wipe|polish|dust|vacuum|scrub)\b/i
const APPEARANCE_OBJECT = /\b(exterior|outside|outer|surfaces?|shelv(?:es|ing)|drawers?|bins?|stainless(?: steel)?|control panel|door panels?|door (?:glass|window)|glass|interior|racks?|touchscreen|display)\b/i
const FUNCTIONAL_OBJECT = /\b(filters?|coils?|pumps?|drains?|vents?|ducts?|traps?|hoses?|sensors?|probes?|burners?|igniters?|elements?|condensers?|compressors?|spray arms?|impellers?|anodes?|valves?|nozzles?|jets?)\b/i

// ── Essential candidates ─────────────────────────────────────────────────────
const HYGIENE_SIGNAL = /\b(mold|mildew|bacteri\w*|hygien\w*|saniti[sz]\w*|food[- ]saf\w*|contaminat\w*|odors?|smells?)\b/i

function textOf(t: TaxonomyTaskFields): string {
  return [t.title, t.description ?? "", t.justification ?? ""].join(" ")
}

/** Kind of a single task row — deterministic, title/description driven. */
export function classifyTaskKind(t: TaxonomyTaskFields): TaskKind {
  const title = t.title
  // Operational: consumable top-ups (unless it's a maintenance consumable like a
  // filter) and one-time configuration/personalization.
  const consumable =
    CONSUMABLE_VERB.test(title) && CONSUMABLE_OBJECT.test(title) && !MAINTENANCE_CONSUMABLE.test(title)
  if (consumable || CONFIG_PATTERN.test(title)) return "operational"

  // Cleaning: an appearance surface with no functional part in play. Applies to
  // rows the model labeled maintenance/mixed too — mislabeled wipe-downs are
  // exactly the agenda noise this exists to stop.
  if (t.care_type === "cleaning") return "cleaning"
  if (CLEANING_VERB.test(title) && APPEARANCE_OBJECT.test(title) && !FUNCTIONAL_OBJECT.test(title)) {
    return "cleaning"
  }

  return "maintenance"
}

/** Why a demoted task might still deserve Essential — the user decides. */
export function essentialCandidateReason(t: TaxonomyTaskFields): EssentialCandidateReason {
  return HYGIENE_SIGNAL.test(textOf(t)) ? "hygiene" : "manual_emphasis"
}

/** Build the surviving tip from an operational row (description + how-to). */
function toUsageTip(t: TaxonomyTaskFields): UsageTip {
  const content = [t.description?.trim(), t.instructions_override?.trim()]
    .filter((s): s is string => !!s && s.length > 0)
    .join(" ")
  return {
    title: t.title,
    content: content || (t.justification?.trim() || t.title),
    source_pages: typeof t.source_page === "number" ? [t.source_page] : [],
  }
}

/**
 * Apply the taxonomy to freshly-extracted (or existing) task rows:
 *   1. operational rows → removed from tasks, returned as usage tips
 *   2. appearance wipe-downs → care_type rewritten to "cleaning"
 *   3. essential gate → demote + stamp essential_candidate when the floor
 *      (maintenance/mixed + safety|prevent_damage) isn't met
 * Pure — returns new row objects; input rows are never mutated.
 */
export function applyTaskTaxonomy<T extends TaxonomyTaskFields>(rows: T[]): TaxonomyResult<T> {
  const tasks: T[] = []
  const tips: UsageTip[] = []
  let reclassified = 0
  let demoted = 0

  for (const row of rows) {
    const kind = classifyTaskKind(row)

    if (kind === "operational") {
      tips.push(toUsageTip(row))
      continue
    }

    const next: T = { ...row }
    if (kind === "cleaning" && next.care_type !== "cleaning") {
      next.care_type = "cleaning"
      reclassified++
    }

    if (next.priority_tier === "essential") {
      const kindOk = next.care_type === "maintenance" || next.care_type === "mixed"
      const riskOk = next.risk_level === "safety" || next.risk_level === "prevent_damage"
      if (!kindOk || !riskOk) {
        next.priority_tier = "recommended"
        next.essential_candidate = essentialCandidateReason(next)
        demoted++
      }
    }

    tasks.push(next)
  }

  return { tasks, tips, reclassified, demoted }
}
