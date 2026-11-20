/**
 * The review's row model — what a parsed draft becomes on the review screen —
 * and the rails its sections draw with. It lives apart from TaskReviewSheet.tsx
 * so that file exports only its component (react-refresh can't hot-swap a
 * module that also exports values), and so ParsePickupCard can count a draft's
 * rows without the sheet.
 */
import { reviewBucketFor, showsInTasks, type ReviewBucket } from "../../../shared/tasks/reviewBuckets"
import { tierMeetsLevel, type TaskLevel } from "../../../shared/tasks/taskLevel"
import { typicalFilterCadence, type KindInput } from "../../../shared/care/library"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"
import { applyHouseRules, looksLikeSetupStep } from "../../../shared/tasks/houseRules"
import { classifyActorFromText } from "@/lib/taskActor"
import type {
  PreviewChunk, PreviewResult, PreviewTask, PriorityTier, ScheduleType,
} from "@/modules/knowledge/types/previewTypes"

/** HH-35: the three TIER buckets get the app's own tier colour as a rail,
 *  instead of this screen inventing an emoji vocabulary for a system that
 *  already has one (the agenda and item detail both use these).
 *
 *  HH-140: it defined three of the SIX buckets, and that omission is the whole
 *  reason step 1 looked like a different app. Both steps map the same
 *  REVIEW_BUCKET_ORDER over the same REVIEW_BUCKET_COPY, but a section with no
 *  rail falls through to `copy.icon` — so step 2, which only ever renders the
 *  three tiers, got rails, and step 1 got emoji. Six rounds of redesign landed
 *  on the reported screen while the other door kept the pre-round-10 look.
 *
 *  The three added colours reuse the existing palette rather than introducing
 *  one: when-needed can matter as much as anything scheduled (clay), setup is
 *  done once and then over (slate), tips are good to know (teal). */
export const TIER_RAIL: Record<string, string> = {
  essential: "var(--hh-clay)",
  recommended: "var(--hh-teal)",
  optional: "var(--hh-slate)",
}

/**
 * Rails for the four SECTIONS, kept separate from the tier rails above.
 *
 * They used to be one map, which is how HH-140 happened: it held three keys
 * that were both tier names and bucket names, so three of the six sections had
 * a rail and three silently fell back to an emoji. Two maps, two questions —
 * "how much does this matter" and "what kind of work is it" — and neither can
 * answer for the other by accident.
 *
 * Every bucket must appear here. `TaskReviewSheet.sections.test.tsx` fails if
 * one is missing rather than letting it fall through to an icon.
 */
export const SECTION_RAIL: Record<ReviewBucket, string> = {
  maintenance: "var(--hh-clay)",
  cleaning: "var(--hh-teal)",
  usage: "var(--hh-teal)",
  setup: "var(--hh-slate)",
}

/** What actually gets stored — "setup" is expressed through the schedule. */
export type RowKind = "maintenance" | "cleaning" | "usage"

export interface ReviewRow {
  id: string
  riskLevel: string | null
  actor: string
  origin: "task" | "usage"
  title: string
  description: string | null
  justification: string | null
  minutes: number | null
  origSchedule: ScheduleType
  kind: RowKind
  tier: PriorityTier
  schedule: ScheduleType
  /** Needed to label `every_n_days` in human units. */
  intervalDays: number | null
  scheduleSuggested: boolean
  /** null until the user touches the Remind switch — then the tier default no
   *  longer applies to this task, in either direction. */
  remindEnabled: boolean | null
  /** HH-56: "I've been doing this already" — null means anchor on the add date,
   *  which is the behaviour for anyone who just bought the thing. */
  lastDoneOn: string | null
  /** Seasonal only: the task's season — stored, or asked for in the review
   *  when the cadence becomes seasonal and none is known. */
  season: "spring" | "summer" | "fall" | "winter" | null
  included: boolean
  /** D4: this row's cadence is the care library's usual interval, offered in
   *  place of the manual's "when needed" (a forgettable filter). The row says
   *  "Typical for washers" while its cadence is still that offer. */
  typical: { kindLabel: string; schedule: ScheduleType; intervalDays: number | null } | null
  /** D4: started skipped because its tier is below the home's task level. */
  levelSkipped: boolean
  task?: PreviewTask
  chunk?: PreviewChunk
}

/**
 * What a FRESH read's review knows about the home it is for (D4). Both are
 * left out when stored tasks are re-reviewed: nothing there is skipped or
 * re-timed on the home's behalf.
 */
export interface ReviewRowOptions {
  /** The home's chosen task level. Rows headed for Tasks below it start skipped. */
  taskLevel?: TaskLevel
  /** What the item is — the care library's usual intervals are per kind. */
  item?: KindInput
}

/**
 * What the hand-off card promises about this draft: how many rows the review
 * lists, and how many of them sit in its Maintenance section.
 *
 * HH-127's lesson, kept: the card and the sheet must count the SAME rows, so
 * this is derived from the rows the sheet renders — with the same freeze-prep
 * correction (`freezeRiskFalse`) — rather than re-implemented beside it. When a
 * decision exists in two places, the copy that is not on screen is the one
 * that drifts.
 *
 * HH-161 (S2.1, S3.1): "Review 6 upkeep tasks" is the Maintenance section's
 * count; with none, "Review 6 tips & steps" is every row the review lists.
 */
export function draftReviewCounts(data: PreviewResult, freezeRiskFalse: boolean, opts: ReviewRowOptions = {}): { total: number; maintenance: number } {
  const rows = rowsFrom(data, freezeRiskFalse, opts)
  return { total: rows.length, maintenance: rows.filter((r) => bucketOfRow(r) === "maintenance").length }
}

/**
 * The draft, corrected before anyone is asked to judge it.
 *
 * Two things the review used to show that it already knew were wrong:
 *
 * FREEZE PREP in a freeze-free home. The house rules suppress the whole
 * freeze_prep family when a home is marked freeze-free, and they work — but
 * they run inside commitDraft, which is the moment Save is pressed. So the
 * owner, whose home is set to a mild climate, was shown "Winterize the
 * Dishwasher", asked whether to keep it, and would then have saved four
 * maintenance tasks where the screen promised five. Suppressing here means the
 * review shows what saving will actually produce. commitDraft still applies the
 * rules server-side; this is not a replacement for that, it is the same
 * decision made early enough to be honest about.
 *
 * SETUP STEPS misfiled as upkeep. "Purge Hot Water Lines Before First Use"
 * arrived with schedule `as_needed`, so kind-first grouping filed it under
 * Maintenance — correctly, from wrong input. Rewriting the schedule to `setup`
 * here puts it in the Setup section AND carries the correction into what gets
 * saved, because the rows are what onSave hands back.
 */
function correctDraft(tasks: PreviewResult["tasks"], freezeRiskFalse: boolean): PreviewResult["tasks"] {
  const kept = freezeRiskFalse ? applyHouseRules(tasks, [], { freezeRiskFalse }).kept : tasks
  return kept.map((t) =>
    t.schedule_type !== "setup" &&
    looksLikeSetupStep([t.title, t.description ?? "", t.instructions_text ?? ""].join(" "))
      ? { ...t, schedule_type: "setup" as const }
      : t,
  )
}

export function rowsFrom(data: PreviewResult, freezeRiskFalse = false, opts: ReviewRowOptions = {}): ReviewRow[] {
  const taskRows: ReviewRow[] = correctDraft(data.tasks, freezeRiskFalse).map((t, i) => {
    // D4: a filter the manual leaves "when needed" gets the library's usual
    // interval for this kind of appliance — the manual's own cadence, when it
    // names one, is never touched (typicalFilterCadence).
    const usual = opts.item ? typicalFilterCadence(opts.item, { title: t.title, scheduleType: t.schedule_type }) : null
    const typical = usual
      ? { kindLabel: usual.kindLabel, schedule: usual.entry.scheduleType as ScheduleType, intervalDays: usual.entry.intervalDays ?? null }
      : null
    const row: ReviewRow = {
    id: `t${i}:${t.title}`,
    origin: "task",
    title: t.title,
    description: t.description,
    justification: t.justification ?? null,
    minutes: t.estimated_minutes,
    origSchedule: t.schedule_type,
    riskLevel: t.risk_level ?? null,
    actor: classifyActorFromText([t.title, t.description ?? "", t.instructions_text ?? ""].join(" ")),
    // A per-use habit is a tip: you do it at the machine, and a calendar reminder
    // for it is noise — unless it's safety work, which never auto-demotes.
    kind:
      t.schedule_type === "after_each_use" &&
      t.risk_level !== "safety" &&
      classifyActorFromText([t.title, t.description ?? "", t.instructions_text ?? ""].join(" ")) === "diy"
        ? "usage"
        : t.care_type === "cleaning" ? "cleaning" : "maintenance",
    tier: t.priority_tier,
    schedule: typical ? typical.schedule : t.schedule_type,
    intervalDays: typical ? typical.intervalDays : t.interval_days ?? null,
    scheduleSuggested: false,
    remindEnabled: t.remind_enabled ?? null,
    lastDoneOn: null,
    season: t.season ?? null,
    included: true,
    typical,
    levelSkipped: false,
    task: t,
    }
    // D4: below the home's task level AND headed for Tasks starts skipped —
    // visibly, with the arrow to bring it back. A row that only ever lives on
    // the item page (cleaning, when-needed, setup) is not what the level is
    // about, and skipping it would drop it without it ever being seen.
    if (
      opts.taskLevel && row.kind !== "usage" &&
      !tierMeetsLevel(row.tier, opts.taskLevel) &&
      showsInTasks(taskLikeOf(row), "item_unit")
    ) {
      row.included = false
      row.levelSkipped = true
    }
    return row
  })
  const tipRows: ReviewRow[] = data.chunks
    .filter((c) => (c.tags ?? []).includes(USAGE_TIP_TAG))
    .map((c, i) => ({
      id: `c${i}:${c.title ?? ""}`,
      origin: "usage",
      title: c.title ?? "Tip",
      description: c.content,
      justification: null,
      minutes: null,
      origSchedule: "after_each_use" as ScheduleType,
      riskLevel: null,
      actor: "diy",
      kind: "usage" as RowKind,
      tier: "optional" as PriorityTier,
      schedule: "after_each_use" as ScheduleType,
      intervalDays: null,
      scheduleSuggested: false,
      remindEnabled: null,
      lastDoneOn: null,
      season: null,
      included: true,
      typical: null,
      levelSkipped: false,
      chunk: c,
    }))
  return [...taskRows, ...tipRows]
}

export const taskLikeOf = (r: ReviewRow) => ({
  care_type: r.kind === "usage" ? "operating" : r.kind,
  priority_tier: r.tier,
  schedule_type: r.schedule,
  keep_as_task: r.kind !== "usage",
  risk_level: r.riskLevel,
  actor: r.actor,
  remind_enabled: r.remindEnabled,
})
export const bucketOfRow = (r: ReviewRow): ReviewBucket => reviewBucketFor(taskLikeOf(r))
