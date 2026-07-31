/**
 * Review bucketing — where a task lands on the review screen, and why.
 *
 * The organizing question is NOT what kind of task it is, but **whether it
 * belongs on a schedule at all**. A one-time gas hookup and a monthly duct check
 * are both "essential maintenance", yet only one of them should ever notify you.
 * Measured on the owner's real home (2026-07-31): of 210 active tasks, 138 were
 * setup steps, condition-triggered work, or per-use habits — and 52 of those were
 * marked ESSENTIAL, including "Remove Protective Shipping Film" and "Connect Gas
 * Supply". Priority alone could not separate them; schedule type could.
 *
 * So: schedule first, priority second.
 *
 *   on a schedule   → essential | recommended | optional   (priority means something)
 *   not scheduled   → setup | whenNeeded | tip             (priority still shown,
 *                                                           but nothing fires)
 *
 * Pure and dependency-free so the client, the Functions parse path, and tests all
 * share one definition (same arrangement as parseCore/houseRules/taxonomy).
 */

export type ReviewBucket = "essential" | "recommended" | "optional" | "setup" | "whenNeeded" | "tip"

/** Cadences that actually repeat — the ones that can produce a due date. */
export const RECURRING_SCHEDULES = [
  "weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "every_n_days",
] as const
const RECURRING = new Set<string>(RECURRING_SCHEDULES)

export function isRecurring(scheduleType: string | null | undefined): boolean {
  return !!scheduleType && RECURRING.has(scheduleType)
}

/** The fields bucketing reads. A superset of what both the draft rows and the
 *  stored templates can supply. */
export interface ReviewTaskLike {
  care_type?: string | null
  priority_tier?: string | null
  schedule_type?: string | null
  /** Set when the user explicitly chose to keep an operating step as a real task. */
  keep_as_task?: boolean | null
}

/**
 * Which section of the review screen this task belongs in.
 *
 * Order matters: a per-use habit is a tip even if the manual called it essential
 * (you do it at the machine, a Tuesday reminder is noise), and a setup step is
 * setup even if it's safety-critical — you do it once, at install.
 */
export function reviewBucketFor(t: ReviewTaskLike): ReviewBucket {
  const schedule = t.schedule_type ?? "monthly"
  const keepAsTask = t.keep_as_task === true

  // Operating steps and per-use habits are tips unless the user overrode it.
  if (!keepAsTask && (t.care_type === "operating" || schedule === "after_each_use")) return "tip"
  if (schedule === "setup") return "setup"
  if (!isRecurring(schedule)) return "whenNeeded"

  const tier = t.priority_tier
  return tier === "essential" || tier === "optional" ? tier : "recommended"
}

/** True when this task will actually be scheduled (and so can notify). */
export function isScheduled(bucket: ReviewBucket): boolean {
  return bucket === "essential" || bucket === "recommended" || bucket === "optional"
}

/** Only Essential, and only when scheduled, ever produces a proactive notification.
 *  Anything else is silent — the review UI states this per group. */
export function willNotify(t: ReviewTaskLike): boolean {
  return reviewBucketFor(t) === "essential"
}

/** Display order of the sections, top to bottom. */
export const REVIEW_BUCKET_ORDER: ReviewBucket[] = [
  "essential", "recommended", "optional", "setup", "whenNeeded", "tip",
]

/** Copy for each section. The subtitle states the CONSEQUENCE, because that is
 *  what the user is agreeing to by leaving a task where it sits. */
export const REVIEW_BUCKET_COPY: Record<ReviewBucket, { icon: string; title: string; sub: string; empty?: string }> = {
  essential:   { icon: "🔔", title: "Essential",        sub: "We'll remind you when these come due.", empty: "None — nothing here will notify you." },
  recommended: { icon: "📆", title: "Recommended",      sub: "On your schedule. No reminders." },
  optional:    { icon: "🗒",  title: "Optional",         sub: "On your schedule, quietly." },
  setup:       { icon: "🧰", title: "First-time setup", sub: "Do these once when you set it up. Never repeats." },
  whenNeeded:  { icon: "🔎", title: "When needed",      sub: "No fixed timing. Some matter a lot — do them when the machine or the season says so." },
  tip:         { icon: "💡", title: "Tips",             sub: "Saved to the item page. Never scheduled." },
}

/** Sort inside a section: unscheduled sections lead with what matters most,
 *  since there's no due date to convey urgency (e.g. Nespresso descaling, which
 *  is essential but triggered by an alert light rather than a calendar). */
export function sortWithinBucket<T extends ReviewTaskLike>(bucket: ReviewBucket, rows: T[]): T[] {
  if (isScheduled(bucket)) return rows
  const rank: Record<string, number> = { essential: 0, recommended: 1, optional: 2 }
  return [...rows].sort((a, b) => (rank[a.priority_tier ?? ""] ?? 3) - (rank[b.priority_tier ?? ""] ?? 3))
}

/** Counts for the lead-in line and the primary button. */
export function summarize(rows: ReviewTaskLike[]): { scheduled: number; unscheduled: number; tips: number; total: number } {
  let scheduled = 0, unscheduled = 0, tips = 0
  for (const r of rows) {
    const b = reviewBucketFor(r)
    if (b === "tip") tips++
    else if (isScheduled(b)) scheduled++
    else unscheduled++
  }
  return { scheduled, unscheduled, tips, total: rows.length }
}
