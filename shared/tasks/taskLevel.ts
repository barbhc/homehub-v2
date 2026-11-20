/**
 * The home's task level — D4, design/demo-feedback-2026-11-18.md.
 *
 * Owner, 2026-11-18: friends at the demo "would not want a ton of tasks to
 * manage", and "editing/deleting tasks after they've been added can be
 * tedious". So a home says how much of a manual's upkeep it wants in Tasks,
 * once, and two things follow from that one answer:
 *
 *   1. THE REVIEW AFTER A SCAN starts the rows below the level skipped
 *      (reviewRows.rowsFrom). Skipped is the review's own, visible, reversible
 *      state — the arrow brings a row back before anything is saved.
 *   2. CHANGING THE LEVEL in Settings marks the home's below-level tasks hidden
 *      (planLevelChange), and Home and Tasks leave hidden tasks out. Nothing is
 *      deleted: raising the level clears the mark.
 *
 * What the level never touches, because each is something a person chose by
 * hand rather than a default they inherited:
 *   - a task they typed in or added from a suggestion (source !== "manual"),
 *   - a task whose reminder they switched on,
 *   - a task that was showing BELOW the old level — the only way it got there
 *     was a row brought back in a review, so it is marked kept for good.
 *
 * Pure on purpose: the same rules run in the review, in Settings and in tests.
 */

export type TaskLevel = "essential" | "recommended" | "everything"

/** Least to most — the order the Settings card lists them in. */
export const TASK_LEVELS: readonly TaskLevel[] = ["essential", "recommended", "everything"]

/** Owner, 2026-11-18: "I'd start with Recommended too". */
export const NEW_HOME_TASK_LEVEL: TaskLevel = "recommended"

export const TASK_LEVEL_COPY: Record<TaskLevel, { label: string; hint: string }> = {
  // Not "Just the essentials": the Interface card's Simple option already says
  // that about something else (mock, screen 2).
  essential: { label: "Essential only", hint: "Safety and preventing damage" },
  recommended: { label: "Recommended too", hint: "Adds upkeep that makes things last" },
  everything: { label: "Everything", hint: "All the upkeep your manuals list" },
}

/**
 * The level a stored home is on. A home with nothing stored predates the
 * setting and keeps behaving exactly as it did — every tier shows — until
 * someone picks another level (owner: existing homes see no change).
 */
export function taskLevelOf(raw: unknown): TaskLevel {
  return raw === "essential" || raw === "recommended" || raw === "everything" ? raw : "everything"
}

const TIER_RANK: Record<string, number> = { essential: 3, recommended: 2, optional: 1 }
const LEVEL_FLOOR: Record<TaskLevel, number> = { essential: 3, recommended: 2, everything: 1 }

/**
 * Does a task of this tier belong at this level?
 *
 * An unknown or missing tier MEETS every level: a task is never hidden or
 * skipped on a guess about how much it matters.
 */
export function tierMeetsLevel(tier: string | null | undefined, level: TaskLevel): boolean {
  const rank = tier ? TIER_RANK[tier] : undefined
  return rank === undefined || rank >= LEVEL_FLOOR[level]
}

/** What a level change needs to know about one stored task. */
export interface LevelTemplate {
  id: string
  priorityTier: string | null
  /** "manual" (read from a manual), "user" (typed in) or "cho_generated" (added from a suggestion). */
  source: string | null
  remindEnabled: boolean | null
  hiddenByLevel: boolean
  levelKept: boolean
}

export interface LevelPlan {
  /** Tasks to mark hidden: below the new level and not chosen by hand. */
  hide: string[]
  /** Tasks whose hidden mark comes off: they meet the new level. */
  unhide: string[]
  /** Tasks that were showing below the OLD level — kept by hand, marked so for good. */
  keep: string[]
}

/** Chosen by hand — the level never hides it. `from` is the level being left. */
function chosenByHand(t: LevelTemplate, from: TaskLevel): boolean {
  if (t.levelKept) return true
  if (t.source !== "manual") return true
  if (t.remindEnabled === true) return true
  // Showing below the old level: only a row brought back in a review does that.
  return !t.hiddenByLevel && !tierMeetsLevel(t.priorityTier, from)
}

/**
 * The writes one level change makes. Idempotent: planning the same change over
 * its own result yields nothing, so a retry after a failed save is safe.
 */
export function planLevelChange(templates: readonly LevelTemplate[], from: TaskLevel, to: TaskLevel): LevelPlan {
  const plan: LevelPlan = { hide: [], unhide: [], keep: [] }
  for (const t of templates) {
    const byHand = chosenByHand(t, from)
    if (byHand && !t.levelKept && t.source === "manual" && t.remindEnabled !== true) plan.keep.push(t.id)
    const shouldHide = !byHand && !tierMeetsLevel(t.priorityTier, to)
    if (shouldHide && !t.hiddenByLevel) plan.hide.push(t.id)
    // A hand-chosen task is never left hidden either (a reminder switched on
    // after the level was lowered brings it back at the next change).
    if (!shouldHide && t.hiddenByLevel) plan.unhide.push(t.id)
  }
  return plan
}
