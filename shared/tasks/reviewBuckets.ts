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

/**
 * A section of the review, and of the item page's Upkeep block. These are KINDS
 * of work, not levels of importance.
 *
 * Round 18 (owner): "categorizing essential recommended and optional is less
 * helpful than categorizing maintenance, cleaning, usage and setup." Her own
 * microwave was the argument — eleven rows across six tier sections, four of
 * them holding two rows or fewer, while six of the eleven were the same kind of
 * job (cleaning) split three ways by importance.
 *
 * Importance did not disappear; it went back to being a field on the row, drawn
 * as the coloured rail. What changed is what the HEADINGS mean.
 */
export type ReviewBucket = "maintenance" | "cleaning" | "usage" | "setup"

/** How much a task matters. Deliberately its OWN type even though three of its
 *  members are spelled like ReviewBucket members — that overlap is what let a
 *  bucket be passed where a tier was meant. See `remindsByDefault`. */
export type PriorityTierName = "essential" | "recommended" | "optional"

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
  /** "safety" risk, or a pro/hazardous actor. Such work is NEVER auto-demoted to a
   *  tip, however the manual phrased its cadence. */
  risk_level?: string | null
  actor?: string | null
  /**
   * Whether this task reminds you — the user's own choice. `null`/absent means
   * they never expressed one, so the tier's default applies (see
   * `remindsByDefault`). Kept nullable rather than backfilled so a default can
   * later change without silently rewriting decisions people actually made.
   */
  remind_enabled?: boolean | null
}

/** Combustion checks, gas leak tests and the like. A per-use cadence must not be
 *  allowed to turn one of these into "just a tip". */
export function isSafetyCritical(t: ReviewTaskLike): boolean {
  return t.risk_level === "safety" || t.actor === "pro" || t.actor === "hazardous"
}

/**
 * Which section of the review screen this task belongs in.
 *
 * Order matters, and two of these rules are safety rules rather than taxonomy:
 *
 *  - A setup step is setup however it was phrased — you do it once, at install.
 *  - An operating step or per-use habit is Usage advice, NOT a scheduled task…
 *    unless it is safety-critical. "Furnace Combustion Cycle Testing" arrived as
 *    after_each_use and was silently filed as a tip on a gas furnace, which is
 *    exactly the failure this product cannot afford. Safety work with no real
 *    cadence now lands in MAINTENANCE, carrying "when needed" — unscheduled, but
 *    at the top of the screen instead of in a section called Tips.
 *
 * Everything else is Maintenance or Cleaning, which is simply its care_type.
 */
export function reviewBucketFor(t: ReviewTaskLike): ReviewBucket {
  const schedule = t.schedule_type ?? "monthly"
  const keepAsTask = t.keep_as_task === true

  // The Usage check comes FIRST, and the order is load-bearing. Choosing Usage
  // on a setup step is the one destructive answer on the screen — it stops the
  // row being a task at all and rewrites it as a manual note. If setup were
  // checked first, that row would keep appearing in the Setup checklist while no
  // longer being a task, which is the exact confusion HH-85 was about.
  if (!keepAsTask && (t.care_type === "operating" || schedule === "after_each_use")) {
    return isSafetyCritical(t) ? "maintenance" : "usage"
  }

  if (schedule === "setup") return "setup"

  return t.care_type === "cleaning" ? "cleaning" : "maintenance"
}

/**
 * Does this task land on the schedule — and so, can it ever notify you?
 *
 * This is the question `isScheduled(bucket)` was really asking. It used to be
 * answerable from the section, because the sections WERE the schedule
 * (essential/recommended/optional on it, setup/whenNeeded/tip off it). Grouping
 * by kind breaks that: a Cleaning row can be weekly or when-needed, and the
 * section no longer knows.
 *
 * So it takes the task. The old bucket-shaped version is deleted rather than
 * kept alongside — leaving it would let a caller keep asking the section a
 * question the section can no longer answer, and it would still compile.
 */
export function isScheduledTask(t: ReviewTaskLike): boolean {
  const schedule = t.schedule_type ?? "monthly"
  const keepAsTask = t.keep_as_task === true
  if (!keepAsTask && (t.care_type === "operating" || schedule === "after_each_use")) return false
  if (schedule === "setup") return false
  return isRecurring(schedule)
}

/**
 * What Homehub SUGGESTS when the user hasn't said otherwise: Essential reminds,
 * everything else stays quiet. A suggestion, not a rule — see `willNotify`.
 *
 * Takes the TIER, and that is load-bearing rather than cosmetic. It used to take
 * a ReviewBucket and return `bucket === "essential"`, which worked only because
 * three tier names and three of the six bucket names happened to be the same
 * words. Its three callers each reached it differently — the review passed a
 * bucket, the task page passed a raw tier, and the server's `remindsWhenDue`
 * passed a converted one — so renaming the buckets (which the kind-first review
 * does) would have made the REVIEW answer "no" for everything while the task
 * page and `sendPush` carried on saying yes and sending.
 *
 * A screen claiming nothing will notify you while the server notifies you is the
 * worst shape this bug could take, and no single-screen test would have caught
 * it: each screen is individually correct. So the parameter is now the thing the
 * decision was always about, and `reviewBuckets.agreement.test.ts` pins that all
 * three callers answer identically for the same task.
 *
 * The parameter is typed `PriorityTierName`, not `string`, and that is the
 * actual guard. A runtime test cannot catch this today — for a scheduled row
 * `reviewBucketFor` RETURNS the tier, so passing a bucket is currently
 * indistinguishable, and the bug only appears the moment the buckets are
 * renamed. The compiler can catch it now: `ReviewBucket` includes "setup",
 * "whenNeeded" and "tip", so it is not assignable here and `tsc -b` fails on
 * any caller that reaches for a bucket.
 */
export function remindsByDefault(tier: PriorityTierName | null | undefined): boolean {
  return tier === "essential"
}

/**
 * Does the owner want to hear about a task that is ALREADY scheduled and due?
 * Their own answer if they gave one, else the tier default.
 *
 * This is `willNotify` for the send side, and the difference matters. That one
 * re-derives the review bucket from care_type/schedule_type/keep_as_task, which
 * is right when you are looking at a draft row and asking "will this ever
 * notify?". At send time the question is already settled — a due instance
 * exists — and re-deriving would be actively wrong: stored templates do not
 * carry `keepAsTask`, so a per-use task the owner deliberately promoted to a
 * real schedule would re-bucket as a "tip" and be silenced.
 */
export function remindsWhenDue(
  priorityTier: string | null | undefined,
  remindEnabled: boolean | null | undefined,
): boolean {
  return remindEnabled ?? remindsByDefault(asTier(priorityTier))
}

/** Narrow a stored tier string to the union. Anything unrecognised is
 *  Recommended — the same fallback `reviewBucketFor` applies — which also means
 *  an unknown tier never notifies by default. */
export function asTier(tier: string | null | undefined): PriorityTierName {
  return tier === "essential" || tier === "optional" ? tier : "recommended"
}

/**
 * Whether this task will actually remind you.
 *
 * The reminder is its OWN switch, not a consequence of the tier. Tying the two
 * together reads fine until someone wants a reminder for a Recommended task —
 * "descale the machine" is the owner's real example — and their only way to get
 * one is to inflate its priority to Essential, which corrupts the tier for
 * everything that sorts and filters on it. So priority answers "how much does
 * this matter" and this answers "does it interrupt me", independently.
 *
 * Two invariants hold regardless of the flag:
 *   - Nothing unscheduled can remind you. There is no due date for it to fire
 *     on, so a reminder there is a promise we cannot keep.
 *   - An explicit choice always wins over the default, in both directions.
 */
export function willNotify(t: ReviewTaskLike): boolean {
  if (!isScheduledTask(t)) return false
  return t.remind_enabled ?? remindsByDefault(asTier(t.priority_tier))
}

/**
 * Display order of the sections, top to bottom.
 *
 * Maintenance leads because it is the only kind that can ever interrupt you, so
 * it is the one worth deciding while attention is still fresh. Setup sits LAST,
 * below Usage — owner, round 18. Install steps for an appliance someone has
 * usually owned for months must never outrank the work they will live with, and
 * once it is installed they are the least relevant rows on the screen.
 */
export const REVIEW_BUCKET_ORDER: ReviewBucket[] = ["maintenance", "cleaning", "usage", "setup"]

/** Copy for each section. The subtitle states the CONSEQUENCE, because that is
 *  what the user is agreeing to by leaving a task where it sits.
 *
 *  Note what these no longer claim. The tier sections used to promise a
 *  notification in their sub-lines ("with a reminder when each comes due"),
 *  which was never true of a whole section — the switch is per task. That
 *  promise now lives on the row that makes it, and in the summary above. */
export const REVIEW_BUCKET_COPY: Record<ReviewBucket, { icon: string; title: string; sub: string; empty?: string }> = {
  maintenance: { icon: "🔧", title: "Maintenance", sub: "Keeps it working. Turn a notification on for any of these." },
  cleaning:    { icon: "🧽", title: "Cleaning",    sub: "Keeps it nice. Lives on the item page." },
  usage:       { icon: "💡", title: "Usage",       sub: "Good to know. Never scheduled." },
  setup:       { icon: "🧰", title: "Setup",       sub: "Once, when you install it." },
}

/**
 * Sort inside a section: rows with a cadence first, then by how much they
 * matter.
 *
 * Every section now mixes both — a Cleaning section holds weekly jobs and
 * when-needed ones — so the old rule ("only sort the unscheduled sections")
 * has nothing left to key on. Dated work leads because it is what the user is
 * actually agreeing to a schedule for; within each half, importance decides,
 * which is the reason the old code sorted unscheduled sections by tier at all
 * (Nespresso descaling is essential but triggered by a light, not a calendar).
 */
export function sortWithinBucket<T extends ReviewTaskLike>(_bucket: ReviewBucket, rows: T[]): T[] {
  const rank: Record<string, number> = { essential: 0, recommended: 1, optional: 2 }
  return [...rows].sort((a, b) => {
    const sa = isScheduledTask(a) ? 0 : 1
    const sb = isScheduledTask(b) ? 0 : 1
    if (sa !== sb) return sa - sb
    return (rank[a.priority_tier ?? ""] ?? 3) - (rank[b.priority_tier ?? ""] ?? 3)
  })
}

/**
 * Counts for the summary line and the primary button.
 *
 * `scheduled` and `notifying` are the two facts the screen states separately,
 * and keeping them apart is the whole point of round 18: a task on a schedule
 * SHOWS UP IN TASKS when it is due whatever you do, and only some of those also
 * send a push. The owner: "there are items that are scheduled to be reminded
 * within the app even if there's no notification."
 */
export function summarize(rows: ReviewTaskLike[]): {
  scheduled: number; unscheduled: number; tips: number; notifying: number; total: number
} {
  let scheduled = 0, unscheduled = 0, tips = 0, notifying = 0
  for (const r of rows) {
    if (reviewBucketFor(r) === "usage") tips++
    else if (isScheduledTask(r)) scheduled++
    else unscheduled++
    if (willNotify(r)) notifying++
  }
  return { scheduled, unscheduled, tips, notifying, total: rows.length }
}
