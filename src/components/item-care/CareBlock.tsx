/**
 * CareBlock — everything you might do to this item, in four collapsible bands:
 *
 *   On a schedule    — recurring, due-dated, tracked
 *   When needed      — no fixed timing (condition-triggered, per-use, safety)
 *   Tips             — usage advice; never scheduled
 *   First-time setup — one-time install steps, last because after install
 *                      they're the least relevant thing on the page
 *
 * Routing is `reviewBucketFor` from shared/tasks/reviewBuckets — the SAME
 * function the review wizard groups by. That matters: someone files a task into
 * "When needed" in the wizard and then looks for it on the item page, and if the
 * two used different rules it would appear somewhere else. Cleaning is no longer
 * its own band (the owner, 2026-07-30: "it probably actually doesn't matter
 * whether it's cleaning or maintenance").
 *
 * Pass `m` for mobile spacing.
 */
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import {
  AlertTriangle, BellRingIcon, CheckCircle2, ChevronDownIcon, ChevronUpIcon,
  Circle, GitBranchIcon, RotateCcw, SlidersHorizontalIcon,
} from "lucide-react"
import type { ItemUnit, KnowledgeChunk, Json } from "@/integrations/types"
import { getTaskInstances, type TaskInstanceWithDetails, type TaskSupplyEmbed, type TaskTemplateWithSchedule } from "@/modules/care"
import { dueKindOf, windowPhrase } from "@/lib/dueWindow"
import { reviewBucketFor, isScheduledTask, willNotify, type ReviewBucket } from "../../../shared/tasks/reviewBuckets"
import { cadenceLabel } from "../../../shared/tasks/cadenceLabel"
import { getTaskGuidance } from "@/pages/item-detail/utils"
import { classifyTaskActor } from "@/lib/taskActor"
import { StepList, InfoBlurb, ManualBlurb } from "@/components/tasks/TaskHowTo"
import { ProTaskNotice } from "@/components/tasks/ProTaskNotice"
import { CautionCallout } from "@/components/tasks/CautionCallout"
import { useSetupCompletion } from "@/pages/item-detail/useSetupCompletion"
import { SYMPTOM_TAGS, type ReCheckTrigger } from "@/lib/symptomTaxonomy"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"
import { isAgendaEligible } from "../../../shared/tasks/agendaEligibility"
import { updateItemUnit } from "@/modules/items/services/itemService"
import { SupplyRows } from "./SupplyRows"
import type { TemplateSupply } from "@/integrations/types"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"
const TEALD = "var(--hh-teal-deep)", TEAL_WASH = "var(--hh-teal-wash)", CLAY = "var(--hh-clay)"
const CLAY_SOFT = "var(--hh-clay-soft)", SLATE = "var(--hh-slate)", SLATE_SOFT = "var(--hh-slate-soft)"
const LINE = "var(--hh-line)"

function scheduleTypeOf(t: TaskTemplateWithSchedule): string {
  return t.schedule_rule?.[0]?.schedule_type ?? "as_needed"
}
/**
 * Adapt a stored template to the shape reviewBuckets reads.
 *
 * `keep_as_task` is true for anything the user has effectively confirmed is a
 * task. The review wizard and the cleanup sweep both file a kept row as
 * maintenance or cleaning, so a per-use row still stored under one of those is
 * one somebody deliberately kept — re-demoting it to a tip here would silently
 * undo that.
 *
 * "operating" is the exception, and it is deliberately compared as a string:
 * CareType doesn't include it (the taxonomy turns operating rows into chunks
 * before they ever persist), but the Firestore read casts `careType` unchecked,
 * so a document written before that rule can still carry it. Those belong in
 * Tips, and the type system can't see them.
 */
function taskLikeOf(t: TaskTemplateWithSchedule) {
  return {
    care_type: t.care_type,
    priority_tier: t.priority_tier,
    schedule_type: scheduleTypeOf(t),
    keep_as_task: (t.care_type as string) !== "operating",
    risk_level: t.risk_level,
    actor: classifyTaskActor(t),
    remind_enabled: t.remind_enabled ?? null,
  }
}
const bucketOf = (t: TaskTemplateWithSchedule): ReviewBucket => reviewBucketFor(taskLikeOf(t))
/** Friendly cadence label. `after_each_use` is spelled out because a per-use
 *  habit shares the "When needed" band with condition-triggered work and its
 *  trigger is the one distinguishing fact; `as_needed` needs no label there
 *  since the band header already says it. */
function freqLabel(t: TaskTemplateWithSchedule): string {
  const st = t.schedule_rule?.[0]?.schedule_type
  if (!st || st === "as_needed" || st === "setup") return ""
  return cadenceLabel(st, t.schedule_rule?.[0]?.interval_days)
}
function manualPageOf(t: TaskTemplateWithSchedule): number | null {
  const meta = (t as unknown as { metadata?: { diagram_pages?: { page: number }[] } }).metadata
  return meta?.diagram_pages?.[0]?.page ?? null
}
/**
 * What a row says about WHEN, in the app's one vocabulary.
 *
 * HH-150 (owner, 2026-09-05): the row printed "Tue, Sep 22" while the task page
 * for the SAME task said "Sep-ish · Window: Sep 15–29". A recurring task has no
 * deadline — printing its stored date invents a promise it never made
 * (design/due-windows.md). Only a real deadline keeps a date, and it reads
 * "By Sep 30". This is the third surface to get the fix: Home and Your week
 * were done days earlier and this one was not swept.
 */
function duePhraseOf(t: TaskTemplateWithSchedule, due: string): string {
  const scheduleType = t.schedule_rule?.[0]?.schedule_type ?? null
  const kind = dueKindOf({ title: t.title, scheduleType, careType: t.care_type ?? null })
  return windowPhrase(due, scheduleType, { today: new Date().toISOString().slice(0, 10), kind })
}
function dueDays(dateStr: string): number {
  const today = new Date().toISOString().slice(0, 10)
  return Math.round((new Date(dateStr + "T12:00:00").getTime() - new Date(today + "T12:00:00").getTime()) / 86400000)
}
function dueStatusColor(days: number): string {
  if (days < 0) return CLAY
  if (days <= 7) return "var(--hh-gold, #8A6D1E)"
  return FAINT
}
function parseTriggers(raw: Json): ReCheckTrigger[] {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[]).filter(
    (i): i is ReCheckTrigger =>
      typeof i === "object" && i !== null &&
      typeof (i as Record<string, unknown>).trigger === "string" &&
      typeof (i as Record<string, unknown>).description === "string",
  )
}

// ── Variant filtering (Q6) ────────────────────────────────────────────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ")
const appliesOf = (t: TaskTemplateWithSchedule): string[] => (t as { applies_to?: string[] }).applies_to ?? []
/** A row is visible unless a variant is set, Show-all is off, the row is tagged,
 *  and the row's tag doesn't include the chosen variant. */
function variantVisible(t: TaskTemplateWithSchedule, variant: string | null, showAll: boolean): boolean {
  const a = appliesOf(t)
  return !variant || showAll || a.length === 0 || a.includes(variant)
}
/** "{Variant} only" pill — shown only when nothing is filtering it out yet
 *  (unknown state or Show-all), never on the user's own variant rows. */
function variantTagFor(t: TaskTemplateWithSchedule, variant: string | null, showAll: boolean): string | null {
  const a = appliesOf(t)
  if (a.length === 0) return null
  if (variant && !showAll) return null
  return `${a.map(cap).join(" / ")} only`
}

// ── Supplies (round 19, Item Option B) ────────────────────────────────────────
/** The template's supply rows, from the item-page embed (widened in round 19
 *  to carry the user's url / size / buy-ahead alongside the parse's part). */
function templateSuppliesOf(t: TaskTemplateWithSchedule): TemplateSupply[] {
  const rows = (t as { task_template_supply?: TaskSupplyEmbed[] }).task_template_supply ?? []
  return rows
    .map((r) => r.supply_item ? {
      name: r.supply_item.name, category: r.supply_item.category, part_number: r.supply_item.oem_part_number,
      url: r.supply_item.url, size: r.supply_item.size, buy_ahead: r.supply_item.buy_ahead,
    } : null)
    .filter((x): x is TemplateSupply => x !== null)
}

type BandTone = "teal" | "gold" | "violet" | "slate"
const BAND_TONE: Record<BandTone, { bg: string; fg: string }> = {
  teal: { bg: "var(--hh-teal-wash)", fg: TEAL },
  gold: { bg: "var(--hh-gold-soft)", fg: "var(--hh-gold)" },
  violet: { bg: "var(--hh-violet-soft)", fg: "var(--hh-violet)" },
  slate: { bg: SLATE_SOFT, fg: SLATE },
}

/**
 * One collapsible group of upkeep.
 *
 * Open on arrival — a page that hides its own contents on first look is worse
 * than a long one — but every band collapses, because after the first read the
 * only band most people want is the one with a due date in it. The tone is what
 * distinguishes the four at a glance: previously "First-time setup" and "Tips"
 * were both grey outlines and read as the same afterthought.
 */
function Band({ tone, title, count, children, onFirstOpen, defaultOpen = true, note }: {
  tone: BandTone
  title: string
  count: number
  children: React.ReactNode
  /** Fires the first time the user expands this band by hand. */
  onFirstOpen?: () => void
  /** First-time setup starts closed — see the call site. */
  defaultOpen?: boolean
  /** One line beside the count, for a band whose closed state needs explaining. */
  note?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const t = BAND_TONE[tone]
  return (
    <div className="overflow-hidden rounded-[15px] border" style={{ borderColor: LINE, background: "var(--hh-surface)" }}>
      <button
        type="button"
        onClick={() => { setOpen((v) => { if (!v) onFirstOpen?.(); return !v }) }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left"
        style={{ background: t.bg }}
      >
        <span className="text-[12.5px] font-extrabold tracking-[-0.01em]" style={{ color: t.fg }}>{title}</span>
        {note && !open && <span className="truncate text-[11px]" style={{ color: FAINT }}>{note}</span>}
        <span className="ml-auto font-mono text-[10.5px] font-bold" style={{ color: FAINT }}>{count}</span>
        {open
          ? <ChevronUpIcon className="size-[15px] shrink-0" style={{ color: FAINT }} />
          : <ChevronDownIcon className="size-[15px] shrink-0" style={{ color: FAINT }} />}
      </button>
      {open && children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">{children}</div>
}
// ── Habit bands (read-only) ──────────────────────────────────────────────────
// ── Schedule hero ────────────────────────────────────────────────────────────
// Match a safety chunk to the task(s) it describes by keyword overlap, so a
// self-clean fire warning surfaces on the self-clean task's "See how" — timely
// and in context — instead of a generic note at the bottom of the list.
const SAFETY_STOP = new Set("the a an and or of to in do not never if you your when this that with for on off is are be can may will".split(/\s+/))
function safetyTokens(s: string): Set<string> {
  return new Set((s.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4 && !SAFETY_STOP.has(w)))
}
function tokenOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}

function ScheduleRow({ t, homeId, focused, due, completed, instanceId, onOpenTask, hasManual, onOpenManualPage, last, variantTag, safetyNote }: {
  homeId: string
  /** A push or link named THIS task (?task=): open it and bring it into view. */
  focused?: boolean
  t: TaskTemplateWithSchedule
  due: string | null
  /** Whether this cadence has ever been completed — drives calm "Start anytime". */
  completed: boolean
  /** Soonest open instance id — enables tap-through to the task detail (complete/snooze). */
  instanceId: string | null
  onOpenTask?: (instanceId: string) => void
  hasManual: boolean
  onOpenManualPage?: (page: number) => void
  last: boolean
  variantTag?: string | null
  /** Critical safety warning from the manual, attached to this task by keyword. */
  safetyNote?: string
}) {
  const [open, setOpen] = useState(!!focused)
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focused) rowRef.current?.scrollIntoView({ block: "center" })
  }, [focused])
  const safety = t.risk_level === "safety" || !!safetyNote
  const reminds = willNotify(taskLikeOf(t))
  // HH-82 (Chris, twice): this band said "On a schedule" for three tasks and
  // the Tasks list showed none of them. Both screens were behaving as designed
  // and they disagreed about what "scheduled" means — this one groups purely by
  // cadence, while the agenda drops item-scoped cleaning by the 2026-07-29
  // rule. It is the item page that sets the expectation, so it is the item page
  // that has to be honest about where the work actually appears.
  const onAgenda = isAgendaEligible({ careType: t.care_type ?? null, scopeType: t.scope_type ?? null })
  const actor = classifyTaskActor(t)
  const { steps, cautions } = getTaskGuidance(t)
  const showSteps = actor !== "hazardous" && steps.length > 0
  const page = manualPageOf(t)
  const days = due != null ? dueDays(due) : null
  // Never-started past-due cadence: calm "Start anytime", not "N days overdue".
  const neverStarted = !completed && days != null && days < 0
  // Tapping the row opens the tracked task (to complete/snooze); falls back to
  // toggling the inline how-to when there's no open instance to open.
  const canOpenTask = !!(instanceId && onOpenTask)
  const openTask = () => (canOpenTask ? onOpenTask!(instanceId!) : setOpen((v) => !v))

  return (
    <div ref={rowRef} style={{ borderTop: last ? "none" : `1px solid ${LINE}` }}>
      {/* HH-155 (owner, 2026-09-05): "the task names are squeezed to the left".
          The right side used to stack FOUR controls — cadence chip, bell,
          "See how", chevron — which left the title about 140px of a 390px
          screen, so "Inspect and Clean Vent Ductwork" wrapped to two lines.
          The title now owns the full width and the cadence joins the meta line
          where the minutes already live. Same anatomy the week lists took. */}
      <div data-testid="care-row" className="flex items-center gap-3 px-4 py-3.5">
        {/* No leading glyph tile. Every row carried an identical wrench in a
            red-or-green square, which read as a status light that meant nothing
            — the same "red dots look like warnings" note that removed the tier
            dots. Safety already has its own badge, and the bell says the one
            thing worth scanning for. */}
        <div onClick={openTask} className="min-w-0 flex-1 cursor-pointer">
          <div className="min-w-0 flex-1">
            {/* The bell used to live HERE, left of the title. Round 18 moved it
                to the right of the row, beside a standardized cadence chip,
                because that is where the review puts it — and a task that reads
                one way while you are deciding it and another way on the page it
                lands on is the drift this round exists to end.

                Owner caught it: "you have the old bell icon to the left of the
                task." She was reading a mockup I had drawn from this file, which
                is how it surfaced — the mockup was faithful, the code was
                stale. */}
            <div className="flex items-start gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{t.title}</span>
                {safety && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: CLAY_SOFT, color: CLAY }}>Safety</span>}
                {(actor === "pro" || actor === "hazardous") && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}>Pro</span>}
                {variantTag && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}><GitBranchIcon className="size-2.5" />{variantTag}</span>}
              </div>
            </div>
            <div className="mt-1 text-[12px]" style={{ color: SUB }}>
              {/* Join non-empty parts: an unscheduled row has no cadence label,
                  and blindly prefixing the separator rendered a stray "· 15 min". */}
              {/* HH-97 (was HH-82's leading chip): the off-agenda marker lives
                  in the meta line now — the chip broke row alignment, and
                  "In guides" named a concept nobody had met. "Deep Clean" is
                  the surface's own name on Home, so the words point somewhere
                  visible. */}
              {/* The cadence moved to the chip on the right — same slot, same
                  mono, same box as the review's. What stays here is what the
                  chip cannot carry: effort, and the due phrase, which is the
                  most important thing on the row. */}
              {[freqLabel(t), t.estimated_minutes ? `${t.estimated_minutes} min` : "", onAgenda ? "" : "Deep Clean"].filter(Boolean).join(" · ")}
              {due != null && days != null && (
                <span style={{ color: neverStarted ? SUB : dueStatusColor(days), fontWeight: !neverStarted && days <= 7 ? 700 : 500 }}>
                  {" · "}{neverStarted ? "Start anytime" : duePhraseOf(t, due)}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* ONE cadence chip, identical on every scheduled row, with the bell
            BESIDE it rather than inside — the owner's round-18 note, applied to
            this surface too: "I like to have the cadence be standardized, and
            then I would like a bell … to just show that notifications are on."
            Colouring the chip would make cadences incomparable down the column,
            which is the one thing a column of cadences is for. */}
        {/* The bell's slot is ALWAYS this wide, so "See how" sits at one x down
            the whole column whether or not a row notifies — the reason the old
            chevron slot existed, kept where it still earns its width. */}
        <span className="flex w-[14px] shrink-0 justify-center">
          {reminds && <BellRingIcon className="size-[14px]" style={{ color: TEAL }} aria-label="Notifies you" />}
        </span>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[12.5px] font-bold" style={{ color: TEAL }}>
          {open ? "Hide" : "See how"}{open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-4 pt-1.5" style={{ background: SLATE_SOFT }}>
          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            <div className="flex min-w-0 flex-col gap-3">
              {safetyNote && (
                <div className="flex items-start gap-2.5 rounded-[12px] border p-3" style={{ background: CLAY_SOFT, borderColor: "color-mix(in srgb, var(--hh-clay) 25%, transparent)" }}>
                  <AlertTriangle className="mt-px size-4 shrink-0" style={{ color: CLAY }} />
                  <div className="min-w-0">
                    <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.5px]" style={{ color: CLAY }}>Safety</div>
                    <div className="text-[13px] leading-snug" style={{ color: "#6B3A24" }}>{safetyNote}</div>
                  </div>
                </div>
              )}
              {actor !== "diy" && <ProTaskNotice actor={actor} />}
              {/* Item Option B: the part lives with the task that uses it. */}
              <SupplyRows homeId={homeId} taskTemplateId={t.task_template_id} supplies={templateSuppliesOf(t)} nextInstanceId={instanceId} />
              {showSteps ? (
                <StepList steps={steps} />
              ) : actor === "diy" ? (
                <div className="text-[13.5px]" style={{ color: SUB }}>
                  {hasManual ? "Open the manual for step-by-step instructions." : "Add this item's manual to unlock steps."}
                </div>
              ) : null}
              <CautionCallout cautions={cautions} />
            </div>
            <div className="flex flex-col gap-3">
              {t.justification && <InfoBlurb text={t.justification} />}
              {page != null && onOpenManualPage && <ManualBlurb page={page} onOpen={() => onOpenManualPage(page)} />}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Setup band ───────────────────────────────────────────────────────────────
/**
 * "Using it well" — operational advice (add detergent, refill the water tank,
 * app pairing) the taxonomy converted from tasks into usage-tip chunks, plus any
 * task still bucketing as a tip. Deliberately NOT task-shaped: no due date, no
 * Mark done — it exists so the manual's usage guidance stays findable without
 * becoming a reminder.
 */
function UsageTipRows({ tips, taskTips, onOpenManualPage, canOpenManual }: {
  tips: KnowledgeChunk[]
  taskTips: TaskTemplateWithSchedule[]
  onOpenManualPage?: (page: number) => void
  /** False when the PDF could not be resolved. The page number is still worth
   *  showing — it tells you where to look — but as text, not a dead button. */
  canOpenManual: boolean
}) {
  const rows = [
    ...tips.map((t) => ({ key: t.chunk_id, title: t.title ?? "Tip", body: t.content, page: t.source_pages?.[0] ?? null })),
    ...taskTips.map((t) => ({ key: t.task_template_id, title: t.title, body: t.description, page: t.source_page ?? null })),
  ]
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.key} className="border-t px-4 py-3" style={{ borderColor: LINE }}>
          <p className="text-[13.5px] font-semibold" style={{ color: INK }}>{r.title}</p>
          {r.body && <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: SUB }}>{r.body}</p>}
          {r.page != null && (
            canOpenManual && onOpenManualPage ? (
              <button type="button" onClick={() => onOpenManualPage(r.page!)} className="mt-1 text-[11.5px] font-bold" style={{ color: TEAL }}>
                Manual p.{r.page}
              </button>
            ) : (
              // Tapping this used to set state that `dockOpen` then discarded
              // because the PDF URL was null — a button that silently did
              // nothing. Say where it is instead of pretending to go there.
              <span className="mt-1 block text-[11.5px] font-semibold" style={{ color: FAINT }}>Manual p.{r.page}</span>
            )
          )}
        </li>
      ))}
    </ul>
  )
}

function SetupBody({ tasks, homeId, itemUnitId, m }: {
  tasks: TaskTemplateWithSchedule[]
  homeId: string
  itemUnitId: string
  m?: boolean
}) {
  const { isDone, loadingIds, doneCount, toggleDone, markAllDone } = useSetupCompletion(tasks, homeId, itemUnitId)
  const allDone = tasks.length > 0 && doneCount === tasks.length
  const [clearing, setClearing] = useState(false)

  return (
    <div className="border-t px-4 py-3.5" style={{ borderColor: LINE }}>
      <div className="mb-2.5 flex items-center gap-2">
        <p className="flex-1 text-[12px]" style={{ color: SUB }}>Everything here is required at install unless marked optional.</p>
        {doneCount > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: allDone ? TEAL_WASH : SLATE_SOFT, color: allDone ? TEAL : SLATE }}>{doneCount}/{tasks.length}</span>
        )}
      </div>
      {/* The design's Door 2, inline. Most people adding a manual own the
          appliance already, and asking them to tick nine install steps they
          did years ago is asking them to do our bookkeeping. Only offered
          while nothing is ticked — after that the checkboxes are the story. */}
      {doneCount === 0 && (
        <button
          type="button"
          disabled={clearing}
          onClick={async () => { setClearing(true); await markAllDone(); setClearing(false) }}
          className="mb-3 w-full rounded-xl border px-3 py-2.5 text-left text-[12.5px] font-bold disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL, background: "var(--hh-surface)" }}
        >
          {clearing ? "Marking done…" : "It's already installed"}
        </button>
      )}
      <div className="flex flex-col" style={{ gap: m ? 12 : 12 }}>
        {[...tasks]
          .sort((a, b) => Number(a.priority_tier === "optional") - Number(b.priority_tier === "optional"))
          .map((t) => {
          const done = isDone(t.task_template_id)
          // Only the exceptions are marked. Most install steps are required, so
          // stamping "Required" on nine of them would be noise; the one that is
          // genuinely skippable — "Install side vent kit" — is the useful signal.
          const optional = t.priority_tier === "optional"
          const loading = loadingIds.has(t.task_template_id)
          const triggers = parseTriggers(t.re_check_triggers ?? [])
          return (
            <div key={t.task_template_id}>
              <div className="flex items-start gap-2.5">
                <button type="button" onClick={() => toggleDone(t)} disabled={loading} aria-label={done ? "Mark not done" : "Mark done"} className="mt-px shrink-0 disabled:opacity-50" style={{ color: done ? TEAL : FAINT }}>
                  {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                </button>
                <span className="flex-1 text-[13px] leading-snug" style={{ color: done ? FAINT : "#3C4A47", textDecoration: done ? "line-through" : undefined }}>
                  {t.title}
                  {optional && (
                    <span className="ml-1.5 inline-block rounded px-1.5 py-px align-[1px] text-[9.5px] font-bold uppercase tracking-[0.4px]" style={{ background: SLATE_SOFT, color: SLATE }}>
                      Optional
                    </span>
                  )}
                </span>
                {done && (
                  <button type="button" onClick={() => toggleDone(t)} disabled={loading} aria-label="Mark as needing redo" className="mt-px shrink-0 disabled:opacity-50" style={{ color: FAINT }}>
                    <RotateCcw className="size-3.5" />
                  </button>
                )}
              </div>
              {triggers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-[30px]">
                  {triggers.map((tr) => {
                    const sev = tr.severity === "safety"
                    return (
                      <span key={tr.trigger} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: sev ? CLAY_SOFT : SLATE_SOFT, color: sev ? CLAY : SLATE }}>
                        {sev && <AlertTriangle className="size-3" />}
                        Re-do if {SYMPTOM_TAGS[tr.trigger as keyof typeof SYMPTOM_TAGS]?.label ?? tr.trigger}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Variant set / filtered / unknown UI (Q6) ─────────────────────────────────
/** Light model-letter heuristic for the "Likely yours" hint — never authoritative. */
function inferVariant(item: ItemUnit, options: string[]): string | null {
  const hay = `${item.model ?? ""} ${item.display_name}`.toLowerCase()
  for (const o of options) if (hay.includes(o)) return o
  const model = (item.model ?? "").toLowerCase()
  if (options.includes("gas") && /dlg|wtg|gtg|gas/.test(model)) return "gas"
  if (options.includes("electric") && /dle|wte|gte|elec/.test(model)) return "electric"
  return null
}

function VariantArea({ options, variant, showAll, inferred, onPick, onToggleShowAll, onChange }: {
  options: string[]
  variant: string | null
  showAll: boolean
  inferred: string | null
  onPick: (v: string) => void
  onToggleShowAll: () => void
  onChange: () => void
}) {
  if (variant) {
    const label = cap(variant)
    return (
      <div className="flex items-center gap-2.5 rounded-[12px] border px-3.5 py-2.5" style={{ background: TEAL_WASH, borderColor: LINE }}>
        <SlidersHorizontalIcon className="size-[15px] shrink-0" style={{ color: TEALD }} />
        <span className="flex-1 text-[12.5px] leading-snug" style={{ color: "#2C3B37" }}>
          {showAll ? "Showing care for all models" : <>Showing care for your <b className="font-bold">{label}</b> model</>}
        </span>
        <button type="button" onClick={onToggleShowAll} className="shrink-0 whitespace-nowrap text-[12.5px] font-bold" style={{ color: TEALD }}>
          {showAll ? `${label} only` : "Show all"}
        </button>
        <button type="button" onClick={onChange} className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold" style={{ color: SUB }}>Change</button>
      </div>
    )
  }
  return (
    <div className="rounded-[14px] border p-4" style={{ borderColor: LINE, background: "var(--hh-surface)" }}>
      <div className="mb-1 flex items-center gap-2">
        <GitBranchIcon className="size-[15px]" style={{ color: TEALD }} />
        <span className="text-[13.5px] font-bold" style={{ color: INK }}>Which model do you have?</span>
      </div>
      <div className="mb-3 text-[12.5px] leading-snug" style={{ color: SUB }}>
        Some steps below are tagged <b style={{ color: SLATE }}>{options.map(cap).join(" only / ")} only</b> — pick your model to hide the ones that don&apos;t apply.
      </div>
      <div className="flex gap-2">
        {options.map((o) => {
          const likely = o === inferred
          return (
            <button key={o} type="button" onClick={() => onPick(o)} className="flex-1 rounded-[11px] border py-2.5 text-[13px] font-bold" style={{ borderColor: likely ? TEAL : "var(--hh-line2)", background: likely ? TEAL_WASH : "var(--hh-surface)", color: INK }}>
              {cap(o)}
              {likely && <span className="block text-[10px] font-semibold" style={{ color: TEALD }}>Likely yours</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export interface CareBlockProps {
  item: ItemUnit
  homeId: string
  /** Full task list for this item; CareBlock routes by schedule_type. */
  tasks: TaskTemplateWithSchedule[]
  chunks: KnowledgeChunk[]
  hasManual: boolean
  /** HH-87: a manual is mid-parse. The empty state must not offer to add a
   *  manual that was added minutes ago — it waits, and says so. */
  parsingManual?: boolean
  /** HH-141: a manual has been READ and its findings are not saved yet. Neither
   *  "has a manual" nor "mid-parse", and without it the page offered to add the
   *  manual ParsePickupCard was reporting on. See lib/manualReviewState. */
  manualAwaitingReview?: boolean
  onOpenManualPage?: (page: number) => void
  /** Whether the manual PDF actually resolved. Page references render as plain
   *  text when it didn't, rather than as buttons that silently do nothing. */
  canOpenManual?: boolean
  onItemUpdate?: (item: ItemUnit) => void
  /** Opens the add-manual dialog. Without it the no-manual state is a dead
   *  end: a sentence telling you the manual is where upkeep comes from, and
   *  nothing to press. */
  onAddManual?: () => void
  /** Template id named by a push or link (?task=) — that row opens and scrolls into view. */
  focusTaskId?: string | null
  /** Mobile spacing. */
  m?: boolean
}

export function CareBlock({ item, homeId, tasks, chunks, hasManual, parsingManual, manualAwaitingReview, onOpenManualPage, canOpenManual = false, onItemUpdate, onAddManual, focusTaskId = null, m }: CareBlockProps) {
  // One partition, by the same rule the review wizard uses — and since round 18
  // that rule is the KIND of work, not its importance. The bands below are the
  // same four words the review shows, in the same order, because a task filed
  // under Cleaning in the review that arrives under a different heading here is
  // exactly the drift six reports were about.
  //
  // "Scheduled" is no longer a band. It is a property a row carries into
  // whichever band it belongs to: a Cleaning job can be weekly or when-needed,
  // and both are Cleaning.
  const maintenance = tasks.filter((t) => bucketOf(t) === "maintenance")
  const cleaning = tasks.filter((t) => bucketOf(t) === "cleaning")
  const usageTasks = tasks.filter((t) => bucketOf(t) === "usage")
  const setupTasks = tasks.filter((t) => bucketOf(t) === "setup")


  // Soonest open instance per scheduled template — drives the due label and the
  // tap-through to task detail. Re-fetch when the task set changes (e.g. after an
  // in-place re-parse) as well as on item switch.
  const navigate = useNavigate()
  const taskIdsKey = tasks.map((t) => t.task_template_id).join(",")
  const [dueByTemplate, setDueByTemplate] = useState<Map<string, { due: string; instanceId: string }>>(new Map())
  // Templates with at least one completed instance — a never-completed cadence
  // reads as calm "Start anytime", not "N days overdue" (app-wide calm model).
  const [completedTemplates, setCompletedTemplates] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    Promise.all([
      getTaskInstances(homeId, { item_unit_id: item.item_unit_id, status: ["scheduled", "snoozed"] }),
      getTaskInstances(homeId, { item_unit_id: item.item_unit_id, status: ["done"] }),
    ]).then(([openRes, doneRes]) => {
      if (cancelled) return
      const map = new Map<string, { due: string; instanceId: string }>()
      for (const inst of (openRes.data ?? []) as TaskInstanceWithDetails[]) {
        const tid = inst.task_template_id
        if (!tid || !inst.due_date) continue
        const prev = map.get(tid)
        if (!prev || inst.due_date < prev.due) map.set(tid, { due: inst.due_date, instanceId: inst.task_instance_id })
      }
      setDueByTemplate(map)
      const done = new Set<string>()
      for (const inst of (doneRes.data ?? []) as TaskInstanceWithDetails[]) {
        if (inst.task_template_id) done.add(inst.task_template_id)
      }
      setCompletedTemplates(done)
    }).catch(() => {
      // No spinner rides on this one — the rows render without due dates. Caught
      // so it fails as "no due date shown" rather than as an unhandled rejection
      // that Sentry reports and nobody can act on.
    })
    return () => { cancelled = true }
  }, [homeId, item.item_unit_id, taskIdsKey])

  const critical = useMemo(
    () => chunks.find((c) => c.chunk_type === "safety" && c.content_level === "critical"),
    [chunks],
  )

  // "Using it well" — operational steps the taxonomy kept OUT of the task list
  // (adding detergent, refilling the water tank). They're real advice, just not
  // things to remind someone about, so they read as tips instead of tasks.
  // `tags` is typed Json on KnowledgeChunk, so narrow before matching.
  const usageTips = useMemo(
    () => chunks.filter((c) => Array.isArray(c.tags) && c.tags.includes(USAGE_TIP_TAG)),
    [chunks],
  )

  // Which scheduled task(s) the critical safety warning is about, by keyword
  // overlap — so it renders in that task's "See how" instead of a generic note.
  const criticalTaskIds = useMemo(() => {
    const ids = new Set<string>()
    if (!critical) return ids
    const ctoks = safetyTokens(`${critical.title ?? ""} ${critical.content ?? ""}`)
    for (const t of tasks) {
      if (tokenOverlap(ctoks, safetyTokens(`${t.title} ${t.instructions_override ?? ""}`)) >= 3) {
        ids.add(t.task_template_id)
      }
    }
    return ids
  }, [critical, tasks])

  // Variant filtering: derive the available variants from the distinct applies_to
  // tags across this item's content. Need ≥2 to be a meaningful choice.
  const availableVariants = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) appliesOf(t).forEach((v) => s.add(v))
    for (const c of chunks) ((c as { applies_to?: string[] }).applies_to ?? []).forEach((v) => s.add(v))
    return [...s].sort()
  }, [tasks, chunks])
  const supportsVariant = availableVariants.length >= 2
  const [variant, setVariant] = useState<string | null>(item.variant_tags?.[0] ?? null)
  const [showAll, setShowAll] = useState(false)
  const inferred = useMemo(() => inferVariant(item, availableVariants), [item, availableVariants])
  // Setup steps are visible by default now (placement, not concealment, keeps
  // them out of the way), so this records the first deliberate look rather than
  // gating the content behind it.
  const markSetupRevealed = async () => {
    if (item.setup_revealed_at) return
    const res = await updateItemUnit(homeId, item.item_unit_id, { setup_revealed_at: new Date().toISOString() })
    if (res.data && onItemUpdate) onItemUpdate(res.data)
  }

  const persistVariant = async (v: string | null) => {
    setVariant(v)
    setShowAll(false)
    const res = await updateItemUnit(homeId, item.item_unit_id, { variant_tags: v ? [v] : [] })
    if (res.data && onItemUpdate) onItemUpdate(res.data)
  }
  const activeVariant = supportsVariant ? variant : null
  const vis = (t: TaskTemplateWithSchedule) => variantVisible(t, activeVariant, showAll)
  const fMaintenance = maintenance.filter(vis)
  const fCleaning = cleaning.filter(vis)
  const fUsageTasks = usageTasks.filter(vis)
  const fSetup = setupTasks.filter(vis)
  // Order the schedule sensibly: genuinely due/overdue first (soonest first),
  // with never-started cadences ("Start anytime") sinking to the bottom instead
  // of dominating the top with alarming back-dated "overdue" dates.
  const dueDaysOf = (t: TaskTemplateWithSchedule) => {
    const d = dueByTemplate.get(t.task_template_id)?.due
    return d != null ? dueDays(d) : 99999
  }
  const isNeverStarted = (t: TaskTemplateWithSchedule) =>
    !completedTemplates.has(t.task_template_id) && dueDaysOf(t) < 0
  const byDue = (a: TaskTemplateWithSchedule, b: TaskTemplateWithSchedule) => {
    const na = isNeverStarted(a), nb = isNeverStarted(b)
    if (na !== nb) return na ? 1 : -1
    return dueDaysOf(a) - dueDaysOf(b) || a.title.localeCompare(b.title)
  }
  // Round 18: the bands are kinds, so this is no longer a band of its own — it
  // is the ordering applied INSIDE Maintenance and Cleaning, where dated rows
  // lead and never-started cadences sink rather than shouting "overdue".
  const orderInBand = (rows: TaskTemplateWithSchedule[]) => {
    const dated = rows.filter((t) => isScheduledTask(taskLikeOf(t))).sort(byDue)
    const undated = rows.filter((t) => !isScheduledTask(taskLikeOf(t)))
    return [...dated, ...undated]
  }

  const nothing = tasks.length === 0
  // While the manual is being read, Upkeep holds the space its tasks will fill
  // rather than showing an empty state that contradicts the band above it. The
  // rows are deliberately blank: the worker writes its draft in one go at the
  // end, so anything more specific here would be invented. Reserving space is
  // honest; naming tasks we have not been told about is not.
  if (nothing && !critical && parsingManual) {
    return (
      <Card>
        <div className="px-4 py-4" aria-busy="true" aria-live="polite">
          <p className="mb-3 text-[13px] font-semibold" style={{ color: SUB }}>
            Reading the manual — upkeep lands here.
          </p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mb-2 h-[46px] animate-pulse rounded-xl last:mb-0"
              style={{ background: "var(--hh-surface2)", opacity: 1 - i * 0.25 }}
            />
          ))}
        </div>
      </Card>
    )
  }

  // HH-141: read, but nothing saved yet. The findings are real and one tap
  // away in ParsePickupCard above — so this holds the space they will fill and
  // says where they are. It deliberately carries NO button: a second primary
  // next to the card's own would be two doors to one decision, which is the
  // pattern the review consolidation removed.
  if (nothing && !critical && manualAwaitingReview) {
    return (
      <Card>
        <div className="px-4 py-4" aria-live="polite">
          <p className="mb-1 text-[15px] font-extrabold tracking-[-0.01em]" style={{ color: "var(--hh-ink)" }}>
            We read the manual
          </p>
          <p className="mb-3 text-[13.5px]" style={{ color: SUB }}>
            Your upkeep lands here once you save what we found.
          </p>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mb-2 h-[46px] rounded-xl last:mb-0"
              style={{ background: "var(--hh-surface2)", opacity: 1 - i * 0.25 }}
            />
          ))}
        </div>
      </Card>
    )
  }

  if (nothing && !critical) {
    // The no-manual case is the whole product in miniature: upkeep comes from
    // the manual, and this is where someone finds out they haven't got one.
    // It used to say exactly that and then offer nothing to press.
    return (
      <Card>
        <div className="flex flex-col items-center gap-3 px-4 py-7 text-center">
          {/* HH-91: the no-manual state leads with the thing that unlocks the
              page, in the same voice as Home's no-upkeep hero — two screens,
              one lesson. The upload/link lanes themselves live in the manual
              section below; this is the headline, not a second set of doors. */}
          {!hasManual && !parsingManual && (
            <p className="text-[15px] font-extrabold tracking-[-0.01em]" style={{ color: "var(--hh-ink)" }}>
              No upkeep yet — add the manual
            </p>
          )}
          <p className="text-[13.5px]" style={{ color: SUB }}>
            {hasManual
              ? "No upkeep found in this manual yet."
              : "The manual is where this item's schedule, warranty window and answers come from."}
          </p>
          {!hasManual && !parsingManual && onAddManual && (
            <button
              type="button"
              onClick={onAddManual}
              className="rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white"
              style={{ background: "var(--hh-teal)" }}
            >
              {/* Says what the button DOES. It opens the add-manual flow —
                  upload or paste a link — and the automatic search is a
                  labelled beta option inside that. "Find the manual" promised a
                  search this button does not run. */}
              Add the manual
            </button>
          )}
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col" style={{ gap: m ? 16 : 20 }}>
      {supportsVariant && (
        <VariantArea
          options={availableVariants}
          variant={variant}
          showAll={showAll}
          inferred={inferred}
          onPick={persistVariant}
          onToggleShowAll={() => setShowAll((v) => !v)}
          onChange={() => persistVariant(null)}
        />
      )}


      {/* Round 18: four bands, and they are the same four words in the same
          order as the review — Maintenance, Cleaning, Usage, Setup. A task filed
          under Cleaning in the review arriving under a different heading here is
          the drift six reports were about.

          Inside each band, dated rows lead. HH-82 still applies: when every
          scheduled row is one the Tasks list will not show, say it once at the
          band rather than making someone infer it from three chips. */}
      {fMaintenance.length > 0 && (
        <Band tone="teal" title="Maintenance" count={fMaintenance.length}>
          {orderInBand(fMaintenance).map((t, i) => (
            <ScheduleRow
              key={t.task_template_id}
              t={t}
              homeId={homeId}
              focused={focusTaskId === t.task_template_id}
              due={isScheduledTask(taskLikeOf(t)) ? dueByTemplate.get(t.task_template_id)?.due ?? null : null}
              completed={completedTemplates.has(t.task_template_id)}
              instanceId={isScheduledTask(taskLikeOf(t)) ? dueByTemplate.get(t.task_template_id)?.instanceId ?? null : null}
              onOpenTask={(iid) => navigate(`/tasks/${iid}`)}
              hasManual={hasManual}
              onOpenManualPage={onOpenManualPage}
              last={i === fMaintenance.length - 1}
              variantTag={variantTagFor(t, activeVariant, showAll)}
              safetyNote={critical && criticalTaskIds.has(t.task_template_id) ? critical.content : undefined}
            />
          ))}
        </Band>
      )}

      {fCleaning.length > 0 && (
        <Band tone="gold" title="Cleaning" count={fCleaning.length}>
          {fCleaning.every((t) => !isAgendaEligible({ careType: t.care_type ?? null, scopeType: t.scope_type ?? null })) && (
            /* HH-151 (owner, 2026-09-05): "looks too close to header and
               stylistically different". It was an 11.5px one-off with almost no
               padding, jammed under the gold band. It now sits INSIDE the band
               on the rows' own inset and type, and the link says where it goes. */
            <div className="border-t px-4 py-2.5 text-[12px] leading-snug" style={{ borderColor: LINE, color: SUB }}>
              These live in your cleaning guides — nothing here reminds you.{" "}
              <Link to="/clean" className="font-bold" style={{ color: TEAL }}>
                Open guides ›
              </Link>
            </div>
          )}
          {orderInBand(fCleaning).map((t, i) => (
            <ScheduleRow
              key={t.task_template_id}
              t={t}
              homeId={homeId}
              focused={focusTaskId === t.task_template_id}
              due={isScheduledTask(taskLikeOf(t)) ? dueByTemplate.get(t.task_template_id)?.due ?? null : null}
              completed={completedTemplates.has(t.task_template_id)}
              instanceId={isScheduledTask(taskLikeOf(t)) ? dueByTemplate.get(t.task_template_id)?.instanceId ?? null : null}
              onOpenTask={(iid) => navigate(`/tasks/${iid}`)}
              hasManual={hasManual}
              onOpenManualPage={onOpenManualPage}
              last={i === fCleaning.length - 1}
              variantTag={variantTagFor(t, activeVariant, showAll)}
              safetyNote={critical && criticalTaskIds.has(t.task_template_id) ? critical.content : undefined}
            />
          ))}
        </Band>
      )}

      {(usageTips.length > 0 || fUsageTasks.length > 0) && (
        <Band tone="violet" title="Usage" count={usageTips.length + fUsageTasks.length}>
          <UsageTipRows tips={usageTips} taskTips={fUsageTasks} onOpenManualPage={onOpenManualPage} canOpenManual={canOpenManual} />
        </Band>
      )}

      {/* Last on the page, and last in REVIEW_BUCKET_ORDER: once the thing is
          installed, its install steps are the least useful rows here. */}
      {fSetup.length > 0 && (
        <Band
          tone="slate"
          title="Setup"
          count={fSetup.length}
          // Closed by default. Nine open checkboxes for work finished the day the
          // appliance was installed pushed the actual upkeep off the screen — and
          // almost every item is added long AFTER install, so "already done" is
          // the honest default. One tap opens it, and that tap stamps
          // setup_revealed_at.
          defaultOpen={item.setup_revealed_at != null}
          note="already installed?"
          onFirstOpen={() => { void markSetupRevealed() }}
        >
          <SetupBody tasks={fSetup} homeId={homeId} itemUnitId={item.item_unit_id} m={m} />
        </Band>
      )}

      {/* Safety note fallback — only when we couldn't attach the critical
          warning to a specific task (otherwise it shows in that task's "See
          how"). A general caution, kept at the end, never the top. */}
      {critical && criticalTaskIds.size === 0 && (
        <div className="flex items-start gap-3 rounded-[14px] border p-4" style={{ background: CLAY_SOFT, borderColor: "color-mix(in srgb, var(--hh-clay) 25%, transparent)" }}>
          <div className="grid size-[30px] shrink-0 place-items-center rounded-[8px]" style={{ background: "color-mix(in srgb, var(--hh-clay) 14%, transparent)" }}>
            <AlertTriangle className="size-[17px]" style={{ color: CLAY }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-0.5 text-[10px] font-extrabold uppercase tracking-[0.6px]" style={{ color: CLAY }}>Safety note</div>
            <div className="text-[13px] leading-snug" style={{ color: "#6B3A24" }}>
              {critical.content}
              {critical.source_pages?.[0] != null && <span className="font-semibold" style={{ color: CLAY }}> · manual p.{critical.source_pages[0]}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
