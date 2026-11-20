/**
 * The review's row model — what a parsed draft becomes on the review screen —
 * and the rails its sections draw with. It lives apart from TaskReviewSheet.tsx
 * so that file exports only its component (react-refresh can't hot-swap a
 * module that also exports values), and so ParsePickupCard can count a draft's
 * rows without the sheet.
 */
import { reviewBucketFor, showsInTasks, type ReviewBucket } from "../../../shared/tasks/reviewBuckets"
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
  task?: PreviewTask
  chunk?: PreviewChunk
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
export function draftReviewCounts(data: PreviewResult, freezeRiskFalse: boolean): { total: number; maintenance: number } {
  const rows = rowsFrom(data, freezeRiskFalse)
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

export function rowsFrom(data: PreviewResult, freezeRiskFalse = false): ReviewRow[] {
  const taskRows: ReviewRow[] = correctDraft(data.tasks, freezeRiskFalse).map((t, i) => ({
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
    schedule: t.schedule_type,
    intervalDays: t.interval_days ?? null,
    scheduleSuggested: false,
    remindEnabled: t.remind_enabled ?? null,
    lastDoneOn: null,
    season: t.season ?? null,
    included: true,
    task: t,
  }))
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

/** Everything a review lists is one item's upkeep: item-scoped. */
export const ROW_SCOPE = "item_unit"
/** HH-161 (S4.1): on a schedule AND on the agenda — the rows the Tasks page
 *  will list. Item-scoped cleaning is scheduled and still never shows there. */
export const inTasksRow = (r: ReviewRow): boolean =>
  r.included && r.kind !== "usage" && showsInTasks(taskLikeOf(r), ROW_SCOPE)

/**
 * What Save hands to commitReviewedDraft for these rows: the tasks kept, with
 * the review's choices written onto them, and the chunks — the draft's own,
 * plus a tip for every row filed as usage. One function, so the review's Save
 * and the hand-off card's "Keep these" cannot save two different things.
 */
export function savePayloadFrom(rows: ReviewRow[], draftChunks: PreviewChunk[]): { tasks: PreviewTask[]; chunks: PreviewChunk[] } {
  const tasks: PreviewTask[] = []
  const chunks: PreviewChunk[] = draftChunks.filter((c) => !(c.tags ?? []).includes(USAGE_TIP_TAG))
  for (const r of rows) {
    if (!r.included) continue
    if (r.kind === "usage") {
      chunks.push(
        r.chunk ?? {
          chunk_type: "how_to", title: r.title, content: r.description ?? r.title,
          tags: [USAGE_TIP_TAG], source_pages: r.task?.source_page ? [r.task.source_page] : [],
          // An existing task converted to a tip names the task it was, so the
          // save deactivates THAT task — not whichever one shares its title.
          ...(r.task?.template_id ? { template_id: r.task.template_id } : {}),
        },
      )
      continue
    }
    const base: PreviewTask = r.task ?? {
      title: r.title, description: r.description, care_type: "maintenance", priority_tier: r.tier,
      risk_level: "performance", estimated_minutes: r.minutes, schedule_type: r.schedule,
      interval_days: r.intervalDays, instructions_text: null, symptom_tags: [], re_check_triggers: [],
    }
    tasks.push({
      ...base,
      care_type: r.kind === "cleaning" ? "cleaning" : "maintenance",
      priority_tier: r.tier,
      schedule_type: r.schedule,
      interval_days: r.intervalDays,
      season: r.season,
      remind_enabled: r.remindEnabled,
      last_done_on: r.lastDoneOn,
    })
  }
  return { tasks, chunks }
}

/**
 * HH-137, owner 2026-11-19 ("One-tap 'Keep these'"): a first read with nothing
 * for Tasks has no decision in it, so it gets no review — the hand-off card
 * offers to keep what was found in one tap. This says whether a draft is that
 * case, and what it holds, by the review's own rows and rules: no row in the
 * Maintenance section and none the Tasks page would list. Null when it is not
 * (there is maintenance, something would reach Tasks, or nothing was found).
 */
export function keepTheseSummary(
  data: PreviewResult,
  freezeRiskFalse: boolean,
): { cleaning: number; usage: number; setup: number; total: number } | null {
  const rows = rowsFrom(data, freezeRiskFalse)
  if (rows.length === 0) return null
  if (rows.some((r) => bucketOfRow(r) === "maintenance" || inTasksRow(r))) return null
  const count = (b: ReviewBucket) => rows.filter((r) => bucketOfRow(r) === b).length
  return { cleaning: count("cleaning"), usage: count("usage"), setup: count("setup"), total: rows.length }
}
