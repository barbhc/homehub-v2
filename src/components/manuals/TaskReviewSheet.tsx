import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Loader2Icon, BellRingIcon, BellOffIcon, CalendarCheckIcon, XIcon, Undo2Icon } from "lucide-react"
import {
  reviewBucketFor,
  isScheduledTask,
  willNotify,
  remindsByDefault,
  asTier,
  sortWithinBucket,
  summarize,
  isRecurring,
  REVIEW_BUCKET_ORDER,
  REVIEW_BUCKET_COPY,
  type ReviewBucket,
} from "../../../shared/tasks/reviewBuckets"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"
import { cadenceLabel } from "../../../shared/tasks/cadenceLabel"
import { splitInterval, toDays, type IntervalUnit } from "../../../shared/care/interval"
import { earliestLastDone } from "../../../shared/care/lastDone"

/** HH-35: the three TIER buckets get the app's own tier colour as a rail,
 *  instead of this screen inventing an emoji vocabulary for a system that
 *  already has one (TierBadge, the agenda, item detail all use these).
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
import { isThinManual, thinManualWarning } from "../../../shared/parse/pdfShape"
import { classifyActorFromText } from "@/lib/taskActor"
import { isFirstReview, markFirstReviewSeen } from "@/lib/firstReview"
import type {
  PreviewChunk, PreviewResult, PreviewTask, PriorityTier, ScheduleType,
} from "@/modules/knowledge/types/previewTypes"
import { TaskReviewFeedback, type ReviewEdit, type ReviewEditSummary } from "./TaskReviewFeedback"

/**
 * The post-parse review — where a manual's extracted tasks become the user's
 * schedule, or don't.
 *
 * Two steps, because they are two different decisions: **what each task is**
 * (and whether it belongs at all), then **how often** the ones that survive
 * should repeat. Sections come from reviewBuckets — schedule first, priority
 * second — and each section header states its consequence, since leaving a task
 * where it sits IS the agreement to be notified about it.
 *
 * Principle in play (CLAUDE.md, "Suggest, never assume"): every value we chose is
 * visible and changeable, skipping is explicit and reversible, nothing is
 * scheduled without the user seeing that it will be, and "these don't look right"
 * is always one tap away.
 */

/**
 * The four answers to "what is it?".
 *
 * "Setup" is here because without it a one-time install step had NO correct
 * answer. The owner hit ten of them in one dryer manual — "Connect Gas Supply",
 * "Level the Dryer", "Reverse the Door" — and reasonably picked Tip, which is
 * the one choice that stops it being a task at all and rewrites it as a manual
 * note. The system was already routing these correctly off `schedule_type`;
 * the screen just never offered the word.
 *
 * Setup is a SCHEDULE fact rather than a kind of work, so picking it sets
 * `schedule = "setup"` and leaves care_type alone. `displayKind` reads that back
 * so the tiles always reflect where the row is actually going.
 */
const KINDS = [
  { id: "maintenance", icon: "🔧", label: "Maintenance", hint: "keeps it working" },
  { id: "cleaning", icon: "🧽", label: "Cleaning", hint: "keeps it nice" },
  { id: "usage", icon: "💡", label: "Usage", hint: "good to know" },
  { id: "setup", icon: "🧰", label: "Setup", hint: "once, at install" },
] as const
type KindChoice = (typeof KINDS)[number]["id"]
/** What actually gets stored — "setup" is expressed through the schedule. */
type RowKind = "maintenance" | "cleaning" | "usage"

// Priority answers "how much does this matter" only. Whether it interrupts you
// is the separate Remind switch below, so these hints must not promise anything
// about reminders.
const TIERS: { id: PriorityTier; label: string; onSched: string; offSched: string }[] = [
  { id: "essential", label: "Essential", onSched: "don't skip", offSched: "act promptly" },
  { id: "recommended", label: "Recommended", onSched: "worth doing", offSched: "worth doing" },
  { id: "optional", label: "Optional", onSched: "if you like", offSched: "if you like" },
]

/**
 * For a one-time install step, "how important?" barely means anything — of
 * course connecting the gas matters. The owner: "If you're setting up an item,
 * theoretically, most of the tasks will be essential."
 *
 * The real distinction in the data is narrower: some install steps must happen
 * before you can use the thing, and some are optional extras. Her own dryer had
 * both — "Connect Gas Supply" against "Install side vent kit (Optional)". So
 * setup rows get that question instead, in two answers.
 *
 * These map onto the SAME priority_tier field (essential / optional), so nothing
 * downstream needs to know: it is the question that changes, not the storage.
 */
const SETUP_LEVELS: { id: PriorityTier; label: string; hint: string }[] = [
  { id: "essential", label: "Required", hint: "before first use" },
  { id: "optional", label: "Optional", hint: "an extra" },
]
/** Anything not explicitly Optional reads as Required — a setup step left at
 *  "recommended" by the parser is one you still have to do. */
const setupLevelOf = (tier: PriorityTier): PriorityTier => (tier === "optional" ? "optional" : "essential")

/**
 * Every cadence the DATA MODEL supports, because a picker that can't express
 * what the manual says forces a wrong answer. A tester's air-fryer manual said
 * "clean after each use"; this list offered Monthly or nothing, so the only
 * ways out were to accept a monthly lie or drop the task off schedule — and he
 * reported exactly that. `after_each_use` and `every_n_days` were supported by
 * the parser, the store, and the item-page editor the whole time; only this
 * sheet, the one place the user is actually DECIDING, left them out.
 */
const CADENCES: { id: ScheduleType; label: string }[] = [
  { id: "after_each_use", label: "After each use" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "quarterly", label: "Quarterly" },
  { id: "semiannual", label: "Twice a year" },
  { id: "annual", label: "Yearly" },
  { id: "seasonal", label: "Seasonal" },
  { id: "as_needed", label: "As needed" },
  // HH-100: the escape hatch sits AFTER the presets it escapes from — wedged
  // mid-list it read as one more cadence rather than the custom door.
  { id: "every_n_days", label: "Something else…" },
]

/** Default for "Every N days" — 14 covers the every-two-weeks request that has
 *  no preset, and is a sane starting point to edit from. */
const DEFAULT_INTERVAL_DAYS = 14
/** Per-ROW label, so an every_n_days task can say "Every 5 years" rather than
 *  the enum name or "Every 1825 days". */
const cadOf = (r: { schedule: ScheduleType; intervalDays: number | null }) =>
  cadenceLabel(r.schedule, r.intervalDays)
const originOf = (r: { origSchedule: ScheduleType; intervalDays: number | null }) =>
  cadenceLabel(r.origSchedule, r.intervalDays).toLowerCase()

interface ReviewRow {
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
  included: boolean
  task?: PreviewTask
  chunk?: PreviewChunk
}

/**
 * How many things in this draft would the maintenance review actually ask
 * about?
 *
 * HH-127. ParsePickupCard had its OWN answer to this — "not cleaning and not
 * after_each_use" — and that counted SETUP tasks as maintenance. This sheet
 * does not: a setup task is not on a schedule, so `nothingToSchedule` ignores
 * it. The two definitions disagreed on exactly one case, and that case is a
 * manual full of cleaning advice plus a couple of install checks. The gate
 * opened the sheet; the sheet then said "Nothing here needs a reminder."
 *
 * So there is one definition now, derived from the same rows the sheet renders
 * rather than re-implemented beside it. This is the HH-119 lesson again: when a
 * decision exists in two places, the copy that is not on screen is the one that
 * drifts.
 */
export function draftMaintenanceCount(data: PreviewResult): number {
  return rowsFrom(data).filter(
    (r) => r.included && isScheduledTask(taskLikeOf(r)) && r.kind === "maintenance",
  ).length
}

function rowsFrom(data: PreviewResult): ReviewRow[] {
  const taskRows: ReviewRow[] = data.tasks.map((t, i) => ({
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
      included: true,
      chunk: c,
    }))
  return [...taskRows, ...tipRows]
}

const taskLikeOf = (r: ReviewRow) => ({
  care_type: r.kind === "usage" ? "operating" : r.kind,
  priority_tier: r.tier,
  schedule_type: r.schedule,
  keep_as_task: r.kind !== "usage",
  risk_level: r.riskLevel,
  actor: r.actor,
  remind_enabled: r.remindEnabled,
})
const bucketOfRow = (r: ReviewRow): ReviewBucket => reviewBucketFor(taskLikeOf(r))
/** The tile to light up: a row on the setup schedule reads as Setup, whatever
 *  its care_type happens to be. */
const displayKind = (r: ReviewRow): KindChoice =>
  r.kind === "usage" ? "usage" : r.schedule === "setup" ? "setup" : r.kind
/** Single source of truth for the bell — the same function the item page uses. */
const remindsOfRow = (r: ReviewRow): boolean => willNotify(taskLikeOf(r))

interface TaskReviewSheetProps {
  /**
   * Round 11 (owner): "Why is this pulling up from the bottom? Can the review
   * tasks view look like it's part of the page — unless the user comes back
   * later, and this is from the bottom drawer."
   *
   * In the flow it is a section: same header, same bottom bar, nothing to
   * dismiss — which also removes HH-108's tiny close target from this path
   * entirely, because there is nothing to close. Out of the flow, someone is
   * already somewhere on the item page and sliding this over that IS a detour,
   * so it stays a drawer and looks like one.
   */
  presentation?: "sheet" | "inline"
  /**
   * Are these rows ALREADY written to the item, or is this an uncommitted
   * preview that only exists because the user has not pressed Save yet?
   *
   * HH-134. Both callers pass `previewData`, so nothing here could tell the
   * difference — and the copy assumed the wrong one. `runParse` is explicit:
   * "Preview NEVER commits — it writes previewDraft only", and `commitDraft` is
   * what writes chunks, templates and instances. So for a fresh parse this
   * screen was saying "They're saved to this item" about eleven things that did
   * not exist yet, above the button that creates them.
   *
   * Defaults to FALSE — treat rows as unsaved unless a caller says otherwise.
   * The two mistakes are not symmetric: overstating what Save does costs a word,
   * while claiming things are already saved invites someone to close the sheet
   * and lose the whole parse.
   */
  alreadySaved?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  previewData: PreviewResult
  /** `edits` is the structured diff of every correction made in this review —
   *  the caller records it as parse feedback on save, so feedback capture does
   *  not depend on the user also tapping "these don't look right". */
  onSave: (tasks: PreviewTask[], chunks: PreviewChunk[], edits: ReviewEditSummary) => Promise<string | null>
  saving: boolean
  /** Fires when the user says the parse looks wrong. Carries their corrections. */
  onFeedback?: (payload: { reasons: string[]; note: string; edits: ReviewEditSummary; rescan: boolean }) => void
  /** "maintenance" reviews only the upkeep that needs a decision and saves the
   *  rest untouched. "all" (the default) is the full two-step sheet, still used
   *  by the item page's own "Review tasks" button. */
  /**
   * HH-119. This defaulted to "all" — the pre-round-10 full review — and only
   * ONE of three callers passed "maintenance", so the consolidated design the
   * owner approved reached one door out of three. Attaching a manual from the
   * item page had never had it.
   *
   * The SAFE value is now the default: everyone gets the approved review, and
   * the full one is what you opt into. A fourth caller added later inherits the
   * design instead of silently escaping it.
   */
  focus?: "maintenance" | "all"
}

export function TaskReviewSheet({
  open, onOpenChange, itemName, previewData, onSave, saving, onFeedback, focus = "maintenance",
  presentation = "sheet",
  alreadySaved = false,
}: TaskReviewSheetProps) {
  const initial = useMemo(() => rowsFrom(previewData), [previewData])
  const [rows, setRows] = useState<ReviewRow[]>(initial)
  /**
   * "maintenance" opens straight on the schedule screen, listing only the
   * upkeep the user has to decide about. Cleaning, setup steps and tips are
   * still saved — they just appear on the item page in their own sections
   * instead of being three more things to answer before anything works.
   *
   * The full sheet is one tap away ("Review everything"), so nothing becomes
   * unreachable; it stops being compulsory.
   */
  // Round 18: there is no step 2. The review is ONE screen, grouped by kind,
  // and every row carries its own cadence and bell — which is what step 2
  // existed to collect. `focus` survives only to decide what the summary counts.
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [guideIndex, setGuideIndex] = useState<number | null>(null)
  const [walked, setWalked] = useState(false)
  /** Round 18: the first review a person ever opens explains what Save does,
   *  against rows they can see. Read once on mount so dismissing it does not
   *  depend on a write having landed. */
  const [showFirstRun, setShowFirstRun] = useState(() => isFirstReview())
  /** HH-85: the setup section starts tucked away; one tap reveals it. */
  const [setupOpen, setSetupOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setRows(initial)
    setExpandedId(null); setGuideIndex(null); setWalked(false); setSaveError(null)
  }, [initial, focus])

  const patch = useCallback((id: string, next: Partial<ReviewRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...next } : r)))
  }, [])

  const counts = useMemo(() => {
    const s = summarize(rows.filter((r) => r.included).map((r) => ({
      care_type: r.kind === "usage" ? "operating" : r.kind,
      priority_tier: r.tier, schedule_type: r.schedule, keep_as_task: r.kind !== "usage",
    })))
    return { ...s, tasks: rows.filter((r) => r.included && r.kind !== "usage").length }
  }, [rows])


  const edits: ReviewEditSummary = useMemo(() => {
    const base = new Map(initial.map((r) => [r.id, r]))
    let tier = 0, kind = 0, schedule = 0, skipped = 0
    const details: ReviewEdit[] = []
    for (const r of rows) {
      const b = base.get(r.id); if (!b) continue
      if (r.tier !== b.tier) { tier++; details.push({ title: r.title, field: "tier", from: b.tier, to: r.tier }) }
      if (r.kind !== b.kind) { kind++; details.push({ title: r.title, field: "kind", from: b.kind, to: r.kind }) }
      if (r.schedule !== b.schedule) { schedule++; details.push({ title: r.title, field: "schedule", from: b.schedule, to: r.schedule }) }
      if (!r.included) { skipped++; details.push({ title: r.title, field: "skip", from: "kept", to: "skipped" }) }
    }
    return { tier, kind, schedule, skipped, total: tier + kind + schedule + skipped, details }
  }, [rows, initial])

  /** Filing something under maintenance/cleaning is asking for it to repeat — if
   *  it arrived without a cadence, suggest one so step 2 can't silently skip it. */
  const setKind = (r: ReviewRow, choice: KindChoice) => {
    // Setup: keep it a task, move it onto the one-time schedule.
    if (choice === "setup") {
      patch(r.id, {
        kind: r.kind === "usage" ? "maintenance" : r.kind,
        schedule: "setup",
        scheduleSuggested: false,
      })
      return
    }
    const next: Partial<ReviewRow> = { kind: choice }
    // Leaving Setup for Maintenance/Cleaning means it now needs a cadence, or it
    // would silently fall into "when needed" with no timing at all.
    if (choice !== "usage" && r.schedule === "setup") {
      next.schedule = "monthly"; next.scheduleSuggested = true
    }
    if (choice !== "usage" && !isRecurring(r.schedule) && r.schedule !== "setup" && r.origSchedule === "after_each_use") {
      next.schedule = "monthly"; next.scheduleSuggested = true
    }
    patch(r.id, next)
  }

  const toggleSchedule = (r: ReviewRow) => {
    if (isScheduledTask(taskLikeOf(r))) patch(r.id, { schedule: "as_needed", scheduleSuggested: false })
    else patch(r.id, { schedule: "monthly", scheduleSuggested: true })
  }

  /** Expanding must not throw the reader to the top — hold the card where the
   *  finger left it, then pull the taller card into view if it overflows. */
  const expandAnchored = (id: string, el: HTMLElement | null) => {
    const root = scrollRef.current
    if (!root || !el) { setExpandedId(id); return }
    const before = el.getBoundingClientRect().top - root.getBoundingClientRect().top
    setExpandedId(id)
    requestAnimationFrame(() => {
      const now = root.querySelector<HTMLElement>("[data-expanded='true']")
      if (!now) return
      const rr = root.getBoundingClientRect()
      root.scrollTop += now.getBoundingClientRect().top - rr.top - before
      const over = now.getBoundingClientRect().bottom - rr.bottom
      if (over > 0) root.scrollTop += over + 10
    })
  }

  const handleSave = async () => {
    setSaveError(null)
    const keptTasks: PreviewTask[] = []
    const keptChunks: PreviewChunk[] = previewData.chunks.filter((c) => !(c.tags ?? []).includes(USAGE_TIP_TAG))
    for (const r of rows) {
      if (!r.included) continue
      if (r.kind === "usage") {
        keptChunks.push(
          r.chunk ?? {
            chunk_type: "how_to", title: r.title, content: r.description ?? r.title,
            tags: [USAGE_TIP_TAG], source_pages: r.task?.source_page ? [r.task.source_page] : [],
          },
        )
        continue
      }
      const base: PreviewTask = r.task ?? {
        title: r.title, description: r.description, care_type: "maintenance", priority_tier: r.tier,
        risk_level: "performance", estimated_minutes: r.minutes, schedule_type: r.schedule,
        interval_days: r.intervalDays, instructions_text: null, symptom_tags: [], re_check_triggers: [],
      }
      keptTasks.push({
        ...base,
        care_type: r.kind === "cleaning" ? "cleaning" : "maintenance",
        priority_tier: r.tier,
        schedule_type: r.schedule,
        interval_days: r.intervalDays,
        remind_enabled: r.remindEnabled,
        last_done_on: r.lastDoneOn,
      })
    }
    const err = await onSave(keptTasks, keptChunks, edits)
    if (err) setSaveError(err)
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  const guideRow = guideIndex != null ? rows[guideIndex] : null

  const expandedCard = (r: ReviewRow, opts?: { onNext?: () => void }) => {
    const onSched = isScheduledTask(taskLikeOf(r))
    return (
      <div data-expanded="true" className="rounded-2xl border-[1.5px] p-4 mb-2 bg-card" style={{ borderColor: "var(--hh-teal, #1B6B5A)" }}>
        <div className="flex items-start gap-2">
          <div className="flex-1 text-[17px] font-extrabold tracking-[-0.02em] leading-tight text-balance">{r.title}</div>
        </div>
        {/* Badges the rest of the app already shows. Without them this screen asked
            "what is it?" while withholding the two facts that answer it. */}
        {(r.riskLevel === "safety" || r.actor !== "diy") && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {r.riskLevel === "safety" && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }}>Safety</span>
            )}
            {(r.actor === "pro" || r.actor === "hazardous") && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ background: "var(--hh-slate-soft)", color: "var(--hh-slate)" }}>Pro</span>
            )}
          </div>
        )}
        {/* The WHY. Previously only `justification` rendered, so any task carrying
            only a description showed no explanation at all — which is precisely
            when the user can't tell how to categorise it. */}
        {(r.justification || r.description) && (
          <div className="text-[13px] text-muted-foreground mt-2 leading-snug">{r.justification || r.description}</div>
        )}
        <div className="text-[11.5px] text-muted-foreground mt-2">
          From the manual · {originOf(r)}{r.minutes ? ` · about ${r.minutes} min` : ""}
        </div>

        {/* Where this row actually ends up, live. The wizard asks two questions
            that combine into one of six sections, and until now it never showed
            the answer — so a one-time setup step could be filed as a Tip (which
            deletes the task and rewrites it as a manual note) with nothing on
            screen saying so. "Every default visible and reversible." */}
        <div
          className="mt-3 flex items-center gap-2 rounded-xl px-2.5 py-2 text-[11.5px]"
          style={{ background: "var(--hh-teal-wash)", color: "var(--hh-teal)" }}
        >
          <span className="font-semibold">Goes to</span>
          <b className="font-extrabold">{REVIEW_BUCKET_COPY[bucketOfRow(r)].title}</b>
          {remindsOfRow(r) && <BellRingIcon className="size-[13px] shrink-0" aria-label="will remind you" />}
        </div>

        {/* The one destructive choice on this screen, stated only when it applies. */}
        {r.kind === "usage" && r.origin === "task" && r.origSchedule === "setup" && (
          <div className="mt-2 rounded-xl px-2.5 py-2 text-[11.5px]" style={{ background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }}>
            The manual lists this as a <b>one-time setup step</b>. Saving it as a tip removes it from
            your setup checklist and keeps it as a note instead.
          </div>
        )}

        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">What is it?</div>
        <div className="grid grid-cols-2 gap-1.5">
          {KINDS.map((k) => (
            <button key={k.id} type="button" aria-pressed={displayKind(r) === k.id}
              onClick={() => setKind(r, k.id)}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2.5 text-left transition-colors ${
                displayKind(r) === k.id ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background text-muted-foreground"}`}>
              <span className="text-[17px] leading-none shrink-0">{k.icon}</span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[12.5px] font-bold">{k.label}</span>
                <span className="block text-[10.5px] font-semibold text-muted-foreground">{k.hint}</span>
              </span>
            </button>
          ))}
        </div>

        {r.kind === "usage" ? (
          <div className="mt-3 rounded-xl bg-violet-50 dark:bg-violet-950/40 px-2.5 py-2 text-[11.5px] text-violet-700 dark:text-violet-300">
            <b>Saved as a tip</b> — on the item page, never scheduled.
          </div>
        ) : (
          <>
            {/* HH-84: "the schedule section of this page is buried and it's
                one of the most important things." It was an 11.5px strip
                wedged between two big labelled sections. It is now the third
                labelled section, peer to WHAT IS IT? and HOW IMPORTANT?, with
                the answer at reading size. */}
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">On a schedule?</div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
              <span className="text-[13px] leading-snug">
                {onSched
                  ? <>Repeats <b className="font-bold">{cadOf(r).toLowerCase()}</b> — adjust it on the next step</>
                  : <><b className="font-bold">Not scheduled</b> — {r.schedule === "setup" ? "a one-time step" : "you'll do it when needed"}</>}
              </span>
              <button type="button" onClick={() => toggleSchedule(r)}
                className="ml-auto rounded-full border border-primary px-2.5 py-1.5 text-[11.5px] font-semibold text-primary whitespace-nowrap">
                {onSched ? "Take off schedule" : "Put on a schedule"}
              </button>
            </div>
            {displayKind(r) === "setup" ? (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">Is it required?</div>
                <div className="flex gap-1.5">
                  {SETUP_LEVELS.map((lv) => {
                    const on = setupLevelOf(r.tier) === lv.id
                    return (
                      <button key={lv.id} type="button" aria-pressed={on}
                        onClick={() => patch(r.id, { tier: lv.id })}
                        className={`flex flex-1 flex-col items-center justify-start gap-1 rounded-xl border px-1.5 py-2.5 text-center leading-tight transition-colors ${
                          on
                            ? lv.id === "essential" ? "border-[#C2410C] bg-[#C2410C]/10 text-foreground" : "border-primary bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground"}`}>
                        <span className="text-[12px] font-bold">{lv.label}</span>
                        <span className="text-[10.5px] font-semibold text-muted-foreground">{lv.hint}</span>
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">How important?</div>
                <div className="flex gap-1.5">
                  {TIERS.map((tier) => (
                    <button key={tier.id} type="button" aria-pressed={r.tier === tier.id}
                      onClick={() => patch(r.id, { tier: tier.id })}
                      className={`flex flex-1 flex-col items-center justify-start gap-1 rounded-xl border px-1.5 py-2.5 text-center leading-tight transition-colors ${
                        r.tier === tier.id
                          ? tier.id === "essential" ? "border-[#C2410C] bg-[#C2410C]/10 text-foreground" : "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground"}`}>
                      <PriorityDot tier={tier.id} />
                      <span className="text-[12px] font-bold">{tier.label}</span>
                      <span className="text-[10.5px] font-semibold text-muted-foreground">{onSched ? tier.onSched : tier.offSched}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* HOW OFTEN. This lived in step 2 until round 18; deleting that screen
                without moving it would have left the review with no cadence
                editor at all. It sits directly above the reminder because they
                are one decision — "how does this task behave?" — and because the
                cadence is what decides whether the reminder can be offered. */}
            {r.schedule !== "setup" && (
              <>
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mt-4 mb-2">How often?</div>
                <div className="flex flex-wrap gap-1.5">
                  {CADENCES.map((c) => (
                    <button key={c.id} type="button" aria-pressed={r.schedule === c.id}
                      onClick={() => patch(r.id, {
                        schedule: c.id,
                        scheduleSuggested: false,
                        intervalDays: c.id === "every_n_days" ? r.intervalDays ?? DEFAULT_INTERVAL_DAYS : null,
                      })}
                      className={`rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors ${
                        r.schedule === c.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-muted-foreground"}`}>
                      {c.id === "every_n_days" && r.schedule === c.id
                        ? cadenceLabel(r.schedule, r.intervalDays)
                        : c.label}
                    </button>
                  ))}
                </div>
                {/* HH-100's escape hatch. It lived inside step 2's cadence
                    popover; moving the picker without it would have left
                    "Something else…" setting a silent 14 days with no way to
                    change the number. */}
                {r.schedule === "every_n_days" && (() => {
                  const cur = splitInterval(r.intervalDays ?? DEFAULT_INTERVAL_DAYS)
                  return (
                    <div className="mt-2.5 flex items-center gap-2">
                      <label htmlFor={`interval-${r.id}`} className="text-[11.5px] text-muted-foreground">Every</label>
                      <input
                        id={`interval-${r.id}`}
                        type="number" inputMode="numeric" min={1} max={999}
                        value={cur.n}
                        onChange={(e) => {
                          const n = Number(e.target.value)
                          patch(r.id, { intervalDays: toDays(Number.isFinite(n) && n > 0 ? n : 1, cur.unit) })
                        }}
                        className="w-16 rounded-md border border-border bg-background px-2 py-1 text-[13px]"
                      />
                      <select
                        aria-label="Unit"
                        value={cur.unit}
                        onChange={(e) => patch(r.id, { intervalDays: toDays(cur.n, e.target.value as IntervalUnit) })}
                        className="rounded-md border border-border bg-background px-2 py-1 text-[13px]"
                      >
                        <option value="days">days</option>
                        <option value="weeks">weeks</option>
                        <option value="months">months</option>
                        <option value="years">years</option>
                      </select>
                    </div>
                  )
                })()}
              </>
            )}

            {/* "When did you last do this?" also lived only in step 2. It sits
                under the cadence because it is the same conversation: the
                cadence says how often, this says from when. */}
            {onSched && <LastDoneControl row={r} patch={patch} />}

            {/* The reminder, asked separately from priority. Only offered when the
                task is actually scheduled — off the schedule there is no due date
                to remind against, and offering the switch would promise a
                notification that can never fire. Round 18 draws the ABSENCE
                rather than a disabled switch: a control you cannot use, with an
                excuse next to it, is worse than a sentence saying why. */}
            {!onSched && r.schedule !== "setup" && (
              <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-border bg-background px-2.5 py-2.5">
                <BellOffIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">No notification</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Nothing to notify about until it has a date. Give it a cadence above and the switch appears.
                  </span>
                </span>
              </div>
            )}
            {onSched && (
              <label className="mt-3 flex cursor-pointer items-center gap-2.5 rounded-xl border border-border bg-background px-2.5 py-2.5">
                <input
                  type="checkbox"
                  checked={remindsOfRow(r)}
                  onChange={(e) => patch(r.id, { remindEnabled: e.target.checked })}
                  className="size-[18px] shrink-0 accent-[var(--hh-teal,#1B6B5A)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] font-semibold">Remind me when it&apos;s due</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {r.remindEnabled == null
                      // The TIER, not the bucket — see remindsByDefault. Passing
                      // a bucket here is what would have silently switched every
                      // on-screen bell off once the buckets were renamed.
                      ? remindsByDefault(asTier(r.tier))
                        ? "On by default for Essential — you can turn it off"
                        : "Off by default — turn it on if you want one"
                      : remindsOfRow(r) ? "You turned this on" : "You turned this off"}
                  </span>
                </span>
                {remindsOfRow(r) && <BellRingIcon className="size-4 shrink-0" style={{ color: "var(--hh-teal, #1B6B5A)" }} />}
              </label>
            )}
          </>
        )}

        <div className="flex gap-2 mt-3.5">
          <button type="button" onClick={() => { patch(r.id, { included: false }); opts?.onNext ? opts.onNext() : setExpandedId(null) }}
            className="flex-1 rounded-xl border border-border py-2.5 text-[12.5px] font-bold text-muted-foreground">Skip ✕</button>
          <button type="button" onClick={() => { patch(r.id, { included: true }); opts?.onNext ? opts.onNext() : setExpandedId(null) }}
            className="flex-[2] rounded-xl bg-primary py-2.5 text-[12.5px] font-bold text-primary-foreground">
            {opts?.onNext ? "Keep →" : "Done"}
          </button>
        </div>
      </div>
    )
  }

  /**
   * One row, in step 2's clothes.
   *
   * HH-140: this used to open with the kind as an EMOJI and close with a
   * priority dot next to a bare ✕ — "◦ ×" in the owner's screenshot, which is
   * a hollow Optional dot beside a glyph with no hit area. Step 2's row opens
   * with a coloured rail and closes with real, labelled controls, and both
   * screens list the same rows.
   *
   * The row rail carries the TIER, exactly as step 2's does. Inside the three
   * tier sections that is the section's own colour, so the two agree; inside
   * "When needed" and "First-time setup" it is the row's own, which is the
   * signal `sortWithinBucket` exists to order ("some matter a lot", and no due
   * date is there to say so). A tip has no meaningful tier, so it takes its
   * section's rail.
   *
   * This replaced a priority DOT beside the rail. The first render of this fix
   * showed why: a "When needed" row had a clay rail from its bucket and a teal
   * dot from its tier — two colours, two meanings, one row. Step 2 has neither
   * problem because its row rail has always been the tier.
   *
   * The KIND is a word, and only where the section has not already said it:
   * inside Setup and Tips every row is one.
   */
  const collapsedRow = (r: ReviewRow) => {
    const b = bucketOfRow(r)
    const kind = KINDS.find((k) => k.id === r.kind)
    // The kind is only worth a pill where the section has not already said it.
    const kindSaysSomething = b !== "setup" && b !== "usage" && !!kind
    const rail = r.kind === "usage" ? SECTION_RAIL[b] : TIER_RAIL[r.tier] ?? SECTION_RAIL[b]
    const scheduled = isScheduledTask(taskLikeOf(r))
    const reminds = r.included && remindsOfRow(r)
    return (
      <button key={r.id} type="button"
        onClick={(e) => expandAnchored(r.id, e.currentTarget)}
        className={`w-full text-left rounded-xl border px-3 py-2.5 mb-1.5 flex items-center gap-2 transition-colors hover:border-primary ${
          r.included ? "bg-card border-border" : "border-dashed border-border opacity-50"}`}>
        <span aria-hidden="true" className="w-[3px] self-stretch min-h-[26px] shrink-0 rounded-full"
          style={{ background: r.included ? rail ?? "transparent" : "transparent" }} />
        <span className={`flex-1 min-w-0 text-[14px] font-semibold tracking-[-0.005em] ${r.included ? "" : "line-through text-muted-foreground"}`}>{r.title}</span>

        {r.included && kindSaysSomething && (
          <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground whitespace-nowrap">
            {kind.label}
          </span>
        )}

        {/* ONE cadence chip, identical on every scheduled row.
            Owner, round 18: "I like to have the cadence be standardized, and
            then I would like a bell … to just show that notifications are on."
            An earlier draft coloured the chip itself when a row notified, which
            made cadences incomparable down the column — the one thing a column
            of cadences is for. So the chip never changes, and the bell beside
            it is the only thing that does.

            Unscheduled rows get the same slot without a box: there is no
            cadence to line up with, and "when needed" is the reason, not a
            value. Usage and Setup rows get nothing at all — no timing to
            state. */}
        {r.included && (scheduled ? (
          <span className="shrink-0 rounded-lg border border-border bg-background px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground whitespace-nowrap tabular-nums">
            {cadOf(r)}
          </span>
        ) : b === "maintenance" || b === "cleaning" ? (
          <span className="shrink-0 text-[11px] font-mono italic text-muted-foreground/75 whitespace-nowrap">
            when needed
          </span>
        ) : null)}

        {/* The notification marker sits BESIDE the chip, never inside it. Its
            absence is as meaningful as its presence, so this column is the
            answer to "which of these will buzz me" in one glance. */}
        {reminds && (
          <BellRingIcon className="size-[14px] shrink-0" style={{ color: "var(--hh-teal, #1B6B5A)" }} aria-label="Notifies you" />
        )}

        <span role="button" tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); patch(r.id, { included: !r.included }) }}
          aria-label={r.included ? `Skip ${r.title}` : `Bring back ${r.title}`}
          className="shrink-0 grid place-items-center size-[26px] rounded-full border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          {r.included ? <XIcon className="size-[13px]" aria-hidden /> : <Undo2Icon className="size-[13px]" aria-hidden />}
        </span>
      </button>
    )
  }


  const inline = presentation === "inline"
  const Frame = inline ? InlineFrame : SheetFrame
  const Head = inline ? InlineHeader : SheetHeader
  const Title = inline ? InlineTitle : SheetTitle

  if (inline && !open) return null

  return (
    <Frame open={open} onOpenChange={onOpenChange}>
        <Head className={inline ? "pb-2 border-b" : "px-4 pt-3 pb-2 border-b"}>
          <Title className="text-[17px] font-extrabold tracking-[-0.02em]">{itemName}</Title>
          {/* HH-35: was 10.5px mono. Mono is right for serials/counts/dates
              (design/README.md) but this is a sentence, and at 10.5px it was
              under the readable floor for secondary text. */}
          <div className="text-[12.5px] text-muted-foreground">
            {/* One screen, so there is no step to number. It says WHAT is here,
                and the summary below says what will happen to it. `alreadySaved`
                is the only fork: "review tasks" on the item page is looking at
                live rows, not a proposal. */}
            {guideRow
              ? `Deciding each task · ${(guideIndex ?? 0) + 1} of ${rows.length}`
              : alreadySaved
                ? `${rows.length} task${rows.length === 1 ? "" : "s"} on this item`
                : `${rows.length} thing${rows.length === 1 ? "" : "s"} from the manual`}
          </div>
        </Head>

        {/* HH-35: px-3 put body copy 12px from the edge while the rows inside
            sat further in — which is what read as "text too close to the sides".
            One inset for the sheet and its contents. */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
          {/* Shown before ANY step, because it changes what the whole review
              means: a tester downloaded only the cover page, we accepted it in
              silence, and the generic tasks we produced were indistinguishable
              from manual-derived ones. Only appears when we actually counted
              the pages — an unreadable page tree says nothing rather than
              crying wolf on a real manual. */}
          {isThinManual(previewData.pdfPages) && (
            <div className="mb-3 rounded-xl border px-3.5 py-3 text-[12.5px]"
              style={{ borderColor: "var(--hh-clay)", background: "var(--hh-clay-soft)", color: "var(--hh-clay)" }}>
              {thinManualWarning(previewData.pdfPages!)}
            </div>
          )}
          {guideRow ? (
            <>
              {/* Back, because the walkthrough was one-way: "There's no way to go
                  back and review a previous task you can only move forward."
                  A decision you cannot revisit is a decision you have to get
                  right first time, which is the opposite of what a review is. */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={guideIndex === 0}
                  onClick={() => {
                    setGuideIndex(Math.max(0, guideIndex! - 1))
                    scrollRef.current?.scrollTo?.({ top: 0 })
                  }}
                  className="text-[12.5px] font-semibold text-muted-foreground px-1.5 py-1 disabled:opacity-40"
                >
                  ‹ Previous
                </button>
                <button type="button" onClick={() => { setGuideIndex(null); setWalked(true) }}
                  className="text-[12.5px] font-semibold text-muted-foreground px-1.5 py-1">✕ Exit</button>
              </div>
              <div className="text-center text-[10.5px] font-mono font-bold text-muted-foreground tracking-wider mb-1.5">
                {guideIndex! + 1} of {rows.length}
              </div>
              <div className="h-1 bg-muted rounded mb-3 overflow-hidden">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${(guideIndex! / rows.length) * 100}%` }} />
              </div>
              {expandedCard(guideRow, {
                onNext: () => {
                  const next = guideIndex! + 1
                  if (next >= rows.length) { setGuideIndex(null); setWalked(true) } else setGuideIndex(next)
                  scrollRef.current?.scrollTo?.({ top: 0 })
                },
              })}
            </>
          ) : (
            <>
              {/* FIRST REVIEW ONLY. The three sentences a person needs before
                  they press a button that changes what their phone does — shown
                  against real rows rather than in a tour bubble on an empty
                  account, and never shown again.

                  It is a block, not a modal: they opened this screen to do
                  something, and interrupting that to explain the screen is the
                  pattern HH-121 was about. */}
              {showFirstRun && !alreadySaved && (
                <div className="mb-3.5 flex flex-col gap-2 rounded-xl border-[1.5px] px-3 py-2.5"
                  style={{ borderColor: "var(--hh-teal)", background: "var(--hh-teal-wash, rgba(27,107,90,.07))" }}>
                  <span className="text-[12.5px] font-extrabold" style={{ color: "var(--hh-teal)" }}>
                    Here&rsquo;s what saving these does
                  </span>
                  <span className="flex items-start gap-2 text-[11.5px] leading-snug">
                    <CalendarCheckIcon className="mt-[2px] size-[13px] shrink-0" style={{ color: "var(--hh-teal)" }} />
                    <span><b className="font-bold">Anything with a cadence shows up in Tasks</b> on its due date &mdash; that happens whatever you do next.</span>
                  </span>
                  <span className="flex items-start gap-2 text-[11.5px] leading-snug">
                    <BellRingIcon className="mt-[2px] size-[13px] shrink-0" style={{ color: "var(--hh-teal)" }} />
                    <span><b className="font-bold">A bell means it will also notify you.</b> Tap any row to add or remove one.</span>
                  </span>
                  <span className="flex items-start gap-2 text-[11.5px] leading-snug">
                    <BellOffIcon className="mt-[2px] size-[13px] shrink-0 text-muted-foreground" />
                    <span>Cleaning, usage and setup are saved to the item page and never chase you.</span>
                  </span>
                  <button type="button"
                    onClick={() => { markFirstReviewSeen(); setShowFirstRun(false) }}
                    className="self-start rounded-full border-[1.5px] px-3 py-1 text-[11px] font-extrabold"
                    style={{ borderColor: "var(--hh-teal)", color: "var(--hh-teal)" }}>
                    Got it
                  </button>
                </div>
              )}

              {/* THE SUMMARY — round 18, and the owner's correction that produced it.
                  It used to say "nothing here will remind you" over three rows
                  showing a weekly cadence, which is a contradiction: those three
                  DO come back, they just don't buzz. Her words: "there are items
                  that are scheduled to be reminded within the app even if there's
                  no notification."

                  So it states the two channels separately. The first is always
                  on and needs no permission; the second is opt-in, Essential by
                  default, and is the only one that reaches the phone.

                  HH-134 still governs the last line: until Save has run, nothing
                  here is saved, and the screen may not imply otherwise. */}
              <div className="mb-3.5 flex flex-col gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5">
                <div className="flex items-start gap-2 text-[12.5px]">
                  <CalendarCheckIcon className="mt-[3px] size-[13px] shrink-0 text-muted-foreground" />
                  <span>
                    {counts.scheduled === 0
                      ? <>Nothing here goes on a schedule.</>
                      : <><b className="font-bold">{counts.scheduled}</b> show{counts.scheduled === 1 ? "s" : ""} up in Tasks when {counts.scheduled === 1 ? "it’s" : "they’re"} due.</>}
                  </span>
                </div>
                <div className="flex items-start gap-2 text-[12.5px]">
                  {counts.notifying > 0
                    ? <BellRingIcon className="mt-[3px] size-[13px] shrink-0" style={{ color: "var(--hh-teal, #1B6B5A)" }} />
                    : <BellOffIcon className="mt-[3px] size-[13px] shrink-0 text-muted-foreground" />}
                  <span style={counts.notifying > 0 ? { color: "var(--hh-teal, #1B6B5A)" } : undefined}>
                    {counts.notifying === 0
                      ? <>None will notify your phone.</>
                      : <><b className="font-bold">{counts.notifying}</b> of those will also notify your phone.</>}
                  </span>
                </div>
                <span className="text-[11.5px] text-muted-foreground">
                  {alreadySaved
                    ? "Tap any one to change how it’s filed, how often, or whether it notifies you."
                    : "Nothing is saved until you press Save."}
                </span>
              </div>

              {/* HH-140: outlined, not filled — the walkthrough is the slower
                  alternative to the list already on screen, and the footer owns
                  the one filled button. */}
              <div className="mb-3.5">
                <button type="button" onClick={() => { setGuideIndex(0); scrollRef.current?.scrollTo?.({ top: 0 }) }}
                  className="rounded-xl border border-border bg-background px-3.5 py-2.5 text-[12.5px] font-bold text-foreground hover:border-primary transition-colors">
                  Go through them one by one{walked ? " again" : ""} →
                </button>
              </div>

              {REVIEW_BUCKET_ORDER.map((bucket) => {
                const copy = REVIEW_BUCKET_COPY[bucket]
                const items = sortWithinBucket(bucket, rows.filter((r) => bucketOfRow(r) === bucket) as never) as ReviewRow[]
                if (!items.length && !copy.empty) return null
                return (
                  <div key={bucket}>
                    {/* HH-140: the "On your schedule" / "Not scheduled" bands are
                        gone. Every section's own sub-line already says whether it
                        is scheduled ("On your schedule, quietly", "Never
                        scheduled"), so the band restated the next two lines in a
                        third typeface — and it is the one structural device step
                        2 does not have. */}
                    <div className="mt-3.5 mb-2">
                      <div className="flex items-center gap-2.5 text-[15px] font-extrabold tracking-[-0.015em]">
                        <span aria-hidden="true" className="h-[15px] w-[3px] shrink-0 rounded-full" style={{ background: SECTION_RAIL[bucket] }} />
                        {copy.title}
                        {/* HH-85: setup opens on demand. "Already set up" is the
                            honest default for an appliance owned for months —
                            same call the item page's band made — and six open
                            install rows pushed the real upkeep off the screen.
                            The rows still save either way; they file onto the
                            item page, never onto the schedule. */}
                        {bucket === "setup" && items.length > 0 && (
                          // HH-101: the pair was inverted for the default state —
                          // the section ARRIVES hidden, so the visible button must
                          // offer SHOW; "Already set up? Hide them" only makes
                          // sense on the open state it describes.
                          <button type="button" onClick={() => setSetupOpen((v) => !v)} aria-expanded={setupOpen}
                            className="rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground">
                            {setupOpen ? "Already set up? Hide them" : `Show ${items.length} setup step${items.length === 1 ? "" : "s"}`}
                          </button>
                        )}
                        <span className="ml-auto text-[12.5px] font-mono font-bold text-muted-foreground tabular-nums">{items.length}</span>
                      </div>
                      <div className="text-[12px] text-muted-foreground mt-0.5 pl-[13px]">{copy.sub}</div>
                    </div>
                    {bucket === "setup" && !setupOpen && items.length > 0 ? (
                      <div className="text-[11.5px] text-muted-foreground pl-6 pb-1">
                        Tucked away — they&rsquo;ll be on the item page if you ever need them.
                      </div>
                    ) : items.length === 0
                      ? <div className="text-[11.5px] text-muted-foreground pl-6 pb-1">{copy.empty}</div>
                      : items.map((r) => (expandedId === r.id ? <div key={r.id}>{expandedCard(r)}</div> : collapsedRow(r)))}
                  </div>
                )
              })}

              <TaskReviewFeedback edits={edits} onSubmit={(p) => onFeedback?.(p)} />
            </>
          )}
          {saveError && <p className="text-sm text-destructive mt-3">{saveError}</p>}
        </div>

        <div className="border-t px-4 py-3 pb-5 flex items-center gap-2.5">
          {/* HH-83: while the walkthrough is open there is NO finish button.
              "Next: schedule 3 tasks" sat under card 1 of 11 and reads as the
              walkthrough's own next step — but it jumps to scheduling with ten
              tasks unvisited at their defaults. The owner's ask was an exit
              that doesn't accept-and-finish: that is the ✕ Exit above, which
              returns to the list with every decision kept and NOTHING saved
              (commit only happens at step 2's Save). The footer now says that
              instead of competing with it. */}
          {guideRow ? (
            <p className="flex-1 text-center text-[12px] text-muted-foreground">
              {guideIndex ?? 0} of {rows.length} decided · nothing is saved until the end
            </p>
          ) : (
          <>
          {/* One screen, so one button. There is no "Next" any more — the
              cadence and the reminder are decided on the rows themselves, which
              is what step 2 existed to collect.

              HH-134 still governs the wording: for a fresh parse this button is
              the ONLY thing that writes these rows, so it never disappears, and
              it never claims they are already saved. "Done" appears only when
              Save genuinely has nothing left to do. */}
          <Button className="flex-1 font-bold" disabled={saving} onClick={() => { void handleSave() }}>
            {saving && <Loader2Icon className="size-4 mr-2 animate-spin" />}
            {alreadySaved && edits.total === 0
              ? "Done"
              : alreadySaved
                ? "Save changes"
                // "Save all 1" reads like a bug. One thing gets a sentence.
                : counts.total === 1
                  ? "Save it"
                  : `Save all ${counts.total}`}
          </Button>
          </>
          )}
        </div>
    </Frame>
  )
}

/** The drawer, for someone who left and came back. */
function SheetFrame({
  open, onOpenChange, children,
}: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[92dvh] flex flex-col p-0 gap-0">
        {children}
      </SheetContent>
    </Sheet>
  )
}

/** The in-flow version: a section of the item's own page. No overlay, no close
 *  button, no dismissal — it is simply what the page says next. */
function InlineFrame({ children }: { children: React.ReactNode }) {
  return <section className="flex flex-col gap-0">{children}</section>
}

function InlineHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <header className={cn("flex flex-col gap-1.5", className)}>{children}</header>
}

function InlineTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h2 className={cn("text-foreground", className)}>{children}</h2>
}

function PriorityDot({ tier }: { tier: PriorityTier }) {
  const cls = tier === "essential" ? "size-[11px] bg-[#C2410C]"
    : tier === "recommended" ? "size-[10px] bg-primary"
    : "size-[10px] border-2 border-slate-400"
  return <span className={`inline-block rounded-full shrink-0 ${cls}`} aria-label={tier} />
}

function LastDoneControl({ row, patch }: { row: ReviewRow; patch: (id: string, next: Partial<ReviewRow>) => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const open = row.lastDoneOn !== null
  return (
    // HH-99: this was a bare checkbox and a naked date input — the one control
    // on the sheet wearing none of its clothes. It now speaks the sheet's own
    // language: a pressable chip like the cadence chips above it, and the date
    // in a bordered pill at the sheet's text size.
    <div className="mt-2.5">
      <button
        type="button"
        aria-pressed={open}
        onClick={() => patch(row.id, { lastDoneOn: open ? null : today })}
        className={`rounded-full border px-2.5 py-1.5 text-[11px] font-semibold ${
          open ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground"}`}
      >
        {open ? "✓ " : ""}I&rsquo;ve been doing this already
      </button>
      {open && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor={`lastdone-${row.id}`} className="text-[11.5px] text-muted-foreground">Last done</label>
          <input
            id={`lastdone-${row.id}`}
            type="date"
            value={row.lastDoneOn ?? today}
            // Bounds match shared/care/lastDone exactly, so the picker cannot
            // offer a value the server would silently drop.
            min={earliestLastDone(today)}
            max={today}
            onChange={(e) => patch(row.id, { lastDoneOn: e.target.value || today })}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-[12.5px] font-semibold"
          />
        </div>
      )}
    </div>
  )
}

