/**
 * House-rule matching + application — SHARED between the client (feedback sweep,
 * Settings ledger) and Cloud Functions (apply learned rules during a parse).
 *
 * Pure, zero imports, so both the Vite build (`../../shared/...`) and the
 * Functions build (`../../../../shared/...`) can consume it — the same
 * arrangement as shared/parse/parseCore.ts. The client wrapper
 * (src/lib/taskSimilarity.ts) re-exports these and adds display-only helpers.
 */

export type Season = "spring" | "summer" | "fall" | "winter"

/** Minimal task shape the matcher reads (a subset of a TaskTemplate / parsed row). */
export interface TaskLike {
  taskTemplateId: string
  title: string
  symptomTags: string[]
  scheduleType: string | null
  season: Season | null
}

/** A machine-applicable predicate stored on a houseRule (and used for the sweep). */
export type RuleMatch =
  | { by: "symptomTags"; tags: string[] }
  | { by: "seasonalFamily"; family: string }
  | { by: "season"; season: Season }
  | { by: "template"; taskTemplateId: string }

/**
 * Seasonal "family" of a task, inferred from its title — the signal that groups
 * winterize/freeze tasks the symptom taxonomy can't (those tags are problem
 * types, not seasons). Mirrors the season inference in the server's
 * schedule/cadence.ts `seasonForTask`; keep the keyword families in sync.
 */
export function seasonalFamily(title: string): string | null {
  const t = title.toLowerCase()
  // Check the warm-season / de-winterize family FIRST: "de-winterize" contains
  // "winteri", so the freeze_prep test below would otherwise swallow it.
  if (/de[- ]?winteri[sz]|summeri[sz]|spring (?:prep|start|open|startup)|cooling season/.test(t)) return "warm_startup"
  if (/winteri[sz]|cold[- ]?storage|freeze[- ]?protect|frost[- ]?protect|before winter|pre[- ]?winter/.test(t)) return "freeze_prep"
  return null
}

/**
 * The best available match predicate for a task, most-specific first:
 *   seasonalFamily (winterize kin) › season › the single template (nothing
 *   groupable — feedback still applies to it alone).
 *
 * symptomTags are deliberately NOT used to group the sweep. They're
 * troubleshooting tags — which PROBLEM a task addresses (e.g. "performance_drop"
 * lands on a quarter of all tasks) — so matching on a shared generic tag pulled
 * dozens of unrelated tasks across every appliance into one "similar" set. The
 * sweep now groups only on title-specific (winterize) / schedule (season)
 * signals. (`matchesRule` still honors any pre-existing symptomTags rule.)
 */
export function ruleMatchFor(task: TaskLike): RuleMatch {
  const fam = seasonalFamily(task.title)
  if (fam) return { by: "seasonalFamily", family: fam }
  if (task.scheduleType === "seasonal" && task.season) return { by: "season", season: task.season }
  return { by: "template", taskTemplateId: task.taskTemplateId }
}

/** Does `task` satisfy `match`? (A `template` match is intentionally self-only.) */
export function matchesRule(match: RuleMatch, task: TaskLike): boolean {
  switch (match.by) {
    case "symptomTags":
      return task.symptomTags.some((t) => match.tags.includes(t))
    case "seasonalFamily":
      return seasonalFamily(task.title) === match.family
    case "season":
      return task.scheduleType === "seasonal" && task.season === match.season
    case "template":
      return task.taskTemplateId === match.taskTemplateId
  }
}

// ── Rule application (parse-commit path, Phase B) ────────────────────────────

export type HouseRuleKind = "suppress" | "tier_remap" | "cadence" | "season"

/** The subset of a houseRule doc the applier needs (camelCase on disk). */
export interface HouseRuleLike {
  kind: HouseRuleKind
  match: RuleMatch
  toTier?: string | null
  scheduleType?: string | null
  intervalDays?: number | null
  season?: Season | null
}

/** The task-row fields house rules can rewrite (a subset of NormalizedTaskRow). */
export interface RuleTaskFields {
  title: string
  symptom_tags: string[]
  schedule_type: string
  interval_days: number | null
  priority_tier: string
  /** Not on NormalizedTaskRow by default; a season rule sets it, and
   *  seasonForTask() reads an explicit season ahead of its title inference. */
  season?: Season | null
}

export interface ApplyResult<T> {
  kept: T[]
  suppressed: string[]
  retiered: number
  recadenced: number
  reseasoned: number
}

function toTaskLike(row: RuleTaskFields): TaskLike {
  return {
    taskTemplateId: "",
    title: row.title,
    symptomTags: row.symptom_tags,
    scheduleType: row.schedule_type,
    season: row.season ?? null,
  }
}

/**
 * Apply a home's learned rules to freshly-extracted task rows, BEFORE they're
 * reconciled/committed. Suppressed rows are dropped (title recorded); tier /
 * cadence / season rules rewrite fields in place. Pure — returns new row objects.
 *
 * `opts.freezeRiskFalse`: a home marked freeze-free suppresses the whole
 * freeze_prep family even without an explicit suppress rule (the climate loop).
 */
export function applyHouseRules<T extends RuleTaskFields>(
  rows: T[],
  rules: HouseRuleLike[],
  opts?: { freezeRiskFalse?: boolean },
): ApplyResult<T> {
  const active = rules.filter((r) => !!r.match)
  const suppressRules = active.filter((r) => r.kind === "suppress")
  const tierRules = active.filter((r) => r.kind === "tier_remap")
  const cadenceRules = active.filter((r) => r.kind === "cadence")
  const seasonRules = active.filter((r) => r.kind === "season")

  const kept: T[] = []
  const suppressed: string[] = []
  let retiered = 0, recadenced = 0, reseasoned = 0

  for (const row of rows) {
    const like = toTaskLike(row)

    const climateSuppressed = opts?.freezeRiskFalse === true && seasonalFamily(row.title) === "freeze_prep"
    if (climateSuppressed || suppressRules.some((r) => matchesRule(r.match, like))) {
      suppressed.push(row.title)
      continue
    }

    const next: T = { ...row }
    const tier = tierRules.find((r) => matchesRule(r.match, like))
    if (tier?.toTier) { next.priority_tier = tier.toTier; retiered++ }
    const cad = cadenceRules.find((r) => matchesRule(r.match, like))
    if (cad?.scheduleType) { next.schedule_type = cad.scheduleType; next.interval_days = cad.intervalDays ?? null; recadenced++ }
    const sea = seasonRules.find((r) => matchesRule(r.match, like))
    if (sea?.season) { next.season = sea.season; reseasoned++ }

    kept.push(next)
  }

  return { kept, suppressed, retiered, recadenced, reseasoned }
}

/**
 * Does this read as a one-time setup step rather than recurring upkeep?
 *
 * The owner's Bosch review listed "Purge Hot Water Lines Before First Use"
 * under Maintenance. The grouping was right and its input was wrong: the parser
 * gave it a schedule of `as_needed`, and "before first use" is the definition
 * of setup — a thing you do once, when the appliance is new, and never again.
 *
 * Deterministic on purpose. The alternative was strengthening the extraction
 * prompt, which cannot ship without beating the goldens harness, and which
 * would still leave every manual already parsed misfiled. A phrase this
 * unambiguous is better handled as a rule than as a hope.
 *
 * Conservative by design: it fires only on wording that means the FIRST time,
 * never on "after each use" or "before each wash", which are recurring and are
 * the exact strings a looser pattern would swallow.
 */
export function looksLikeSetupStep(text: string): boolean {
  const t = text.toLowerCase()
  if (/\b(each|every|before every|after every)\b/.test(t)) return false
  return /\bbefore (the )?first use\b|\bprior to first use\b|\bfirst use\b|\bbefore using .* for the first time\b|\binitial (setup|installation|start[- ]?up)\b|\bwhen (first )?installing\b|\bat installation\b/.test(t)
}
