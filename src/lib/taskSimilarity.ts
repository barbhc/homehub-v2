/**
 * Client wrapper over the SHARED house-rule matcher (`shared/tasks/houseRules`).
 *
 * The pure matching primitives now live in shared/ so Cloud Functions can apply
 * the same rules during a parse (Phase B). This file re-exports them and adds
 * the client-only pieces: the feedback-sheet sweep (`findSimilar`) and the
 * human provenance label (`matchLabel`, which needs the symptom taxonomy).
 */
export {
  seasonalFamily,
  ruleMatchFor,
  matchesRule,
  type Season,
  type RuleMatch,
  type TaskLike,
} from "../../shared/tasks/houseRules"

import { ruleMatchFor, matchesRule, type RuleMatch, type TaskLike } from "../../shared/tasks/houseRules"
import { symptomLabel } from "@/lib/symptomTaxonomy"

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
