/**
 * Task-cleanup planner — the PURE half of the confirm-first backfill sweep.
 *
 * The taxonomy only runs at parse time, so homes that were parsed before it
 * existed keep their noise (the 2026-07-29 report: operational steps as Essential
 * tasks, wipe-downs in the maintenance schedule, and near-duplicate pairs from
 * rescans that missed a synonym). This planner diffs a home's existing task
 * templates against the taxonomy + a duplicate check and returns PROPOSALS. It
 * writes nothing — the caller renders them for approval and applies what the user
 * confirms.
 *
 * Two proposal classes, with deliberately different default states:
 *
 *   reclassify / retier / to_tip  — reversible field edits (careType, tier, or
 *     "stop being a task"). Default CHECKED: they're the whole point of the sweep
 *     and a mistake costs one toggle.
 *
 *   merge  — soft-deletes a duplicate template. Default UNCHECKED, always. The
 *     evidence forced this: measured on the real dogfooding titles, genuine
 *     duplicates score 0.667–1.000 on titleSimilarity while the false positive
 *     "Clean the Inner Door Panel Edges" vs "Clean the Door Seal" ALSO scores
 *     0.667. No threshold separates them, so a human decides every merge.
 *
 * Duplicate detection is scoped to a single item — "Clean Interior Surfaces"
 * scores 1.000 against "Clean Interior Surfaces and Shelves" on a DIFFERENT
 * appliance, and merging across items would delete real upkeep.
 *
 * Pure + zero imports beyond parseCore's matcher (non-negotiable #1: one
 * matcher), so it's unit-testable and usable from client or Functions.
 */
import { titleSimilarity } from "../parse/parseCore.js"
import {
  classifyTaskKind,
  essentialCandidateReason,
  type EssentialCandidateReason,
  type TaxonomyTaskFields,
} from "./taxonomy.js"

/**
 * Merge threshold, set from measured scores: every true duplicate in the
 * dogfooding corpus scored ≥0.667, and every unrelated pair ≤0.333. 0.6 captures
 * the former and excludes the latter. It still admits look-alikes (see above),
 * which is why merges require explicit approval rather than a better threshold.
 */
export const DEDUPE_THRESHOLD = 0.6

/** An existing task template, as the sweep reads it. */
export interface ExistingTask extends TaxonomyTaskFields {
  taskTemplateId: string
  /** Scope key — duplicates are only ever compared within the same item. */
  itemUnitId: string | null
  scopeType: string
  itemName?: string | null
  /** True when any instance of this template has been completed. */
  hasCompletions: boolean
  /** Set when the user edited careType by hand — the sweep must not overrule it. */
  careTypeOverriddenAt?: string | null
  createdAt?: string | null
}

export type CleanupProposal =
  | {
      kind: "to_tip"
      taskTemplateId: string
      title: string
      itemName: string | null
      /** Operational content that becomes a usage tip instead of a task. */
      reason: "operational"
      /** The surviving advice — what the tip will say once it stops being a task. */
      tipContent: string
      sourcePage: number | null
    }
  | {
      kind: "reclassify"
      taskTemplateId: string
      title: string
      itemName: string | null
      from: string
      /** "cleaning" quiets a wipe-down; "maintenance" rescues real upkeep that was
       *  filed as cleaning and therefore never reached the agenda. */
      to: "cleaning" | "maintenance"
    }
  | {
      kind: "retier"
      taskTemplateId: string
      title: string
      itemName: string | null
      from: string
      to: "recommended"
      /** Why the user might still want it Essential — drives the promote option. */
      candidate: EssentialCandidateReason
    }
  | {
      kind: "merge"
      /** The template that survives (keeps its instances + completion history). */
      keepTaskTemplateId: string
      keepTitle: string
      /** The duplicate to soft-delete. */
      dropTaskTemplateId: string
      dropTitle: string
      itemName: string | null
      similarity: number
    }

export interface CleanupPlan {
  proposals: CleanupProposal[]
  /** Templates the sweep deliberately left alone because the user edited them. */
  skippedUserOverridden: string[]
}

/**
 * What an operational task's tip will say. Mirrors taxonomy.ts's parse-time
 * conversion so a swept home and a freshly-parsed one read identically.
 */
function tipContentFor(t: ExistingTask): string {
  const body = [t.description?.trim(), t.instructions_override?.trim()]
    .filter((s): s is string => !!s && s.length > 0)
    .join(" ")
  return body || t.justification?.trim() || t.title
}

/** Informative-token count — the tie-break for which duplicate is "more specific". */
function tokenCount(title: string): number {
  return (title.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3).length
}

/**
 * Decide which of two duplicates survives. Completion history wins outright (the
 * project invariant: never destroy a task someone has actually done). Then prefer
 * the more specific title, then the older row for stability.
 */
function pickSurvivor(a: ExistingTask, b: ExistingTask): [keep: ExistingTask, drop: ExistingTask] {
  if (a.hasCompletions !== b.hasCompletions) return a.hasCompletions ? [a, b] : [b, a]
  const ta = tokenCount(a.title)
  const tb = tokenCount(b.title)
  if (ta !== tb) return ta > tb ? [a, b] : [b, a]
  const ca = a.createdAt ?? ""
  const cb = b.createdAt ?? ""
  if (ca !== cb) return ca <= cb ? [a, b] : [b, a]
  // Fully tied — order by id so the plan is deterministic across runs.
  return a.taskTemplateId <= b.taskTemplateId ? [a, b] : [b, a]
}

/**
 * Build the cleanup plan for a home's existing task templates. Pure: no reads,
 * no writes, deterministic for a given input ordering.
 */
export function planTaskCleanup(tasks: ExistingTask[]): CleanupPlan {
  const proposals: CleanupProposal[] = []
  const skippedUserOverridden: string[] = []

  // ── Per-task taxonomy proposals ────────────────────────────────────────────
  for (const t of tasks) {
    const kind = classifyTaskKind(t)

    // A hand-edited careType is a user decision; the sweep never overrules it.
    // (Tier proposals still apply — the override is specifically about care type.)
    const careLocked = !!t.careTypeOverriddenAt

    if (kind === "operational") {
      // Operational rows are the loudest noise, but converting one removes a task
      // the user may have been completing — respect that history and leave it.
      if (t.hasCompletions) {
        skippedUserOverridden.push(t.taskTemplateId)
      } else {
        proposals.push({
          kind: "to_tip",
          taskTemplateId: t.taskTemplateId,
          title: t.title,
          itemName: t.itemName ?? null,
          reason: "operational",
          tipContent: tipContentFor(t),
          sourcePage: t.source_page ?? null,
        })
      }
      continue
    }

    // Care-type corrections run BOTH ways: a wipe-down mislabeled maintenance is
    // agenda noise, and functional upkeep mislabeled cleaning is hidden upkeep.
    const careMismatch =
      (kind === "cleaning" && t.care_type !== "cleaning") ||
      (kind === "maintenance" && t.care_type === "cleaning")
    if (careMismatch) {
      if (careLocked) skippedUserOverridden.push(t.taskTemplateId)
      else {
        proposals.push({
          kind: "reclassify",
          taskTemplateId: t.taskTemplateId,
          title: t.title,
          itemName: t.itemName ?? null,
          from: t.care_type,
          to: kind === "cleaning" ? "cleaning" : "maintenance",
        })
      }
    }

    // Essential gate — evaluated against the care type the task WILL have.
    const effectiveCare = careMismatch && !careLocked ? (kind === "cleaning" ? "cleaning" : "maintenance") : t.care_type
    if (t.priority_tier === "essential") {
      const kindOk = effectiveCare === "maintenance" || effectiveCare === "mixed"
      const riskOk = t.risk_level === "safety" || t.risk_level === "prevent_damage"
      if (!kindOk || !riskOk) {
        proposals.push({
          kind: "retier",
          taskTemplateId: t.taskTemplateId,
          title: t.title,
          itemName: t.itemName ?? null,
          from: t.priority_tier,
          to: "recommended",
          candidate: essentialCandidateReason(t),
        })
      }
    }
  }

  // ── Duplicate pairs, within one item only ──────────────────────────────────
  // Rows already proposed for removal (operational → tip) are excluded so the
  // user never sees "merge these two" AND "delete one of them".
  const removing = new Set(
    proposals.filter((p) => p.kind === "to_tip").map((p) => p.taskTemplateId),
  )
  const byScope = new Map<string, ExistingTask[]>()
  for (const t of tasks) {
    if (removing.has(t.taskTemplateId)) continue
    const key = `${t.scopeType}:${t.itemUnitId ?? "home"}`
    const list = byScope.get(key)
    if (list) list.push(t)
    else byScope.set(key, [t])
  }

  for (const group of byScope.values()) {
    // A template appears in at most ONE merge proposal. Without this, a chain
    // (A~B, A~C) produced "keep A, remove B" alongside "keep C, remove A" — the
    // same row presented as both survivor and casualty, which no reviewer can
    // reason about. One proposal per row keeps every checkbox independent.
    const involved = new Set<string>()
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]
        const b = group[j]
        if (involved.has(a.taskTemplateId) || involved.has(b.taskTemplateId)) continue
        const similarity = titleSimilarity(a.title, b.title)
        if (similarity < DEDUPE_THRESHOLD) continue
        const [keep, drop] = pickSurvivor(a, b)
        // Never propose destroying completion history.
        if (drop.hasCompletions) continue
        involved.add(keep.taskTemplateId)
        involved.add(drop.taskTemplateId)
        proposals.push({
          kind: "merge",
          keepTaskTemplateId: keep.taskTemplateId,
          keepTitle: keep.title,
          dropTaskTemplateId: drop.taskTemplateId,
          dropTitle: drop.title,
          itemName: keep.itemName ?? null,
          similarity: Number(similarity.toFixed(3)),
        })
      }
    }
  }

  return { proposals, skippedUserOverridden }
}

/** Proposal kinds that are safe to pre-check in the review UI. */
export function isDefaultChecked(p: CleanupProposal): boolean {
  return p.kind !== "merge"
}
