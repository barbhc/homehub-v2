/**
 * Global graduation (Phase D) — pure aggregation of task-feedback into
 * cross-home patterns that are candidates for parser improvement.
 *
 * Feedback never mutates the shared parse prompt. Instead, when the SAME
 * generalizable feedback (chip + action + a home-independent match) recurs
 * across ≥ N distinct homes, it becomes a *candidate eval case*: a signal for a
 * maintainer to add/strengthen a golden in scripts/parse-eval and tune the
 * prompt through the goldens harness (non-negotiable #5) before any deploy.
 *
 * Shared (client writes the per-event pattern; the scheduled function + the
 * maintainer script aggregate) — hence pure, zero imports beyond the RuleMatch type.
 */
import type { RuleMatch } from "./houseRules.js"

/** Distinct homes that must show the same pattern before it graduates. */
export const GRADUATION_THRESHOLD = 3

/** The home-independent signature of one feedback event. */
export interface FeedbackPattern {
  chip: string
  action: string
  match: RuleMatch | null
  toTier?: string | null
  scheduleType?: string | null
  season?: string | null
}

/**
 * A cross-home-comparable key, or null when the pattern is home-specific
 * (a `template` match names one home's task) or ungeneralizable (no match, e.g.
 * a one-off duplicate) — those never graduate.
 */
export function patternKeyOf(p: FeedbackPattern): string | null {
  const m = p.match
  if (!m || m.by === "template") return null
  const mk = m.by === "symptomTags" ? `tags:${[...m.tags].sort().join("+")}`
    : m.by === "seasonalFamily" ? `fam:${m.family}`
    : `season:${m.season}`
  const param = p.toTier ?? p.scheduleType ?? p.season ?? ""
  return `${p.chip}|${p.action}|${mk}|${param}`
}

/** A short human phrase for the group a pattern covers. */
export function patternLabel(p: FeedbackPattern): string {
  const m = p.match
  if (!m) return "these tasks"
  switch (m.by) {
    case "symptomTags": return `tasks tagged ${[...m.tags].sort().join(", ")}`
    case "seasonalFamily": return m.family === "freeze_prep" ? "winterizing tasks" : "warm-startup tasks"
    case "season": return `${m.season} tasks`
    default: return "these tasks"
  }
}

/** A maintainer-facing suggestion for what to check/change (never auto-applied). */
export function suggestionFor(p: FeedbackPattern, homeCount: number): string {
  const label = patternLabel(p)
  switch (p.action) {
    case "suppress":
    case "archive_duplicate":
      return `${homeCount} homes hid ${label} as not relevant. The parser may be over-generating them — add/strengthen a golden asserting these aren't emitted (or land Optional) for the relevant item types, then tune parsePrompt and re-run the harness.`
    case "tier_remap":
      return `${homeCount} homes re-tiered ${label} to ${p.toTier}. Tier assignment for these may be off in parsePrompt — capture it in a golden and tune.`
    case "cadence":
      return `${homeCount} homes changed ${label} to ${p.scheduleType}. The default cadence may be too aggressive — verify against a golden.`
    case "reschedule_season":
      return `${homeCount} homes moved ${label} to ${p.season}. Season inference may be wrong — check seasonForTask + parsePrompt.`
    default:
      return `${homeCount} homes gave the same feedback on ${label}.`
  }
}

/** One feedback event, flattened for aggregation (homeId derived from the doc path). */
export interface GraduationRow {
  homeId: string
  patternKey: string | null
  pattern: FeedbackPattern
  title: string
  createdAt: string
}

export interface GraduationCandidate {
  patternKey: string
  pattern: FeedbackPattern
  /** Distinct homes exhibiting the pattern — the graduation signal. */
  homeCount: number
  /** Total feedback events (may exceed homeCount if a home repeats). */
  feedbackCount: number
  exampleTitles: string[]
  firstSeen: string
  lastSeen: string
  suggestion: string
}

/**
 * Group feedback rows by pattern, keep those seen across ≥ `threshold` distinct
 * homes, most-homes-first. Home-specific / ungeneralizable rows (null key) are
 * ignored.
 */
export function aggregateGraduation(rows: GraduationRow[], threshold = GRADUATION_THRESHOLD): GraduationCandidate[] {
  const byKey = new Map<string, GraduationRow[]>()
  for (const r of rows) {
    if (!r.patternKey) continue
    const arr = byKey.get(r.patternKey) ?? []
    arr.push(r)
    byKey.set(r.patternKey, arr)
  }

  const out: GraduationCandidate[] = []
  for (const [key, group] of byKey) {
    const homes = new Set(group.map((g) => g.homeId))
    if (homes.size < threshold) continue
    const titles = [...new Set(group.map((g) => g.title).filter(Boolean))].slice(0, 5)
    const dates = group.map((g) => g.createdAt).filter(Boolean).sort()
    out.push({
      patternKey: key,
      pattern: group[0].pattern,
      homeCount: homes.size,
      feedbackCount: group.length,
      exampleTitles: titles,
      firstSeen: dates[0] ?? "",
      lastSeen: dates[dates.length - 1] ?? "",
      suggestion: suggestionFor(group[0].pattern, homes.size),
    })
  }
  return out.sort((a, b) => b.homeCount - a.homeCount || b.feedbackCount - a.feedbackCount)
}
