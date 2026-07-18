/**
 * Pure task-similarity + rule-matching for the task-feedback loop (Phase A).
 *
 * When a homeowner gives feedback on a task ("not relevant", "wrong priority",
 * …) we (a) offer to sweep visibly-similar tasks and (b) record a machine-
 * applicable `houseRule` whose `match` predicate can re-apply the decision to
 * future parses (Phase B). Both need ONE deterministic notion of "similar".
 *
 * No AI; the only import is a pure label helper — so this is unit-testable and
 * shared by the feedback service + the feedback sheet.
 */
import type { Season } from "@/integrations/types"
import { symptomLabel } from "@/lib/symptomTaxonomy"

/** Minimal task shape the matcher reads (a subset of a TaskTemplate on disk). */
export interface TaskLike {
  taskTemplateId: string
  title: string
  symptomTags: string[]
  scheduleType: string | null
  season: Season | null
}

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

/** A machine-applicable predicate stored on a houseRule (and used for the sweep). */
export type RuleMatch =
  | { by: "symptomTags"; tags: string[] }
  | { by: "seasonalFamily"; family: string }
  | { by: "season"; season: Season }
  | { by: "template"; taskTemplateId: string }

/**
 * The best available match predicate for a task, most-general first:
 *   symptomTags (problem family) › seasonalFamily (winterize kin) › season ›
 *   the single template (nothing groupable — feedback still applies to it alone).
 */
export function ruleMatchFor(task: TaskLike): RuleMatch {
  if (task.symptomTags.length > 0) return { by: "symptomTags", tags: [...task.symptomTags] }
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

/**
 * Tasks visibly similar to `primary` (excluding itself) — the confirm-first
 * sweep candidates. Empty when the primary is only self-matchable.
 */
export function findSimilar(primary: TaskLike, all: TaskLike[]): TaskLike[] {
  const match = ruleMatchFor(primary)
  if (match.by === "template") return []
  return all.filter((t) => t.taskTemplateId !== primary.taskTemplateId && matchesRule(match, t))
}

/** Human phrase for the group a rule matches, for the provenance sentence. */
export function matchLabel(match: RuleMatch): string {
  switch (match.by) {
    case "symptomTags":
      return `tasks about ${match.tags.map(symptomLabel).join(", ").toLowerCase()}`
    case "seasonalFamily":
      return match.family === "freeze_prep"
        ? "winterizing / freeze-protection tasks"
        : "spring / warm-season startup tasks"
    case "season":
      return `${match.season} tasks`
    case "template":
      return "this task"
  }
}
