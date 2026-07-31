/**
 * CareBlock — the unified "Care by rhythm" surface (desktop + mobile).
 *
 * One adaptive template that routes a manual's parsed tasks by
 * `schedule_rule.schedule_type` into four self-hiding bands:
 *   Every use (after_each_use) · As needed (as_needed) — read-only habit lists
 *   On a schedule (cadences) — the tracked, due-dated hero
 *   One-time setup (setup) — collapsed, checkable, reveal on "I just installed this"
 * Plus a critical-safety callout (from content_level==='critical' safety chunks)
 * and a provenance note. Pass `m` for mobile spacing.
 *
 * Design: design_handoff_manual_parse_care (round 2). Tokens mapped to --hh-*.
 */
import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle, BellRingIcon, CalendarClockIcon, CheckCircle2, ChevronDownIcon, ChevronRightIcon,
  ChevronUpIcon, Circle, CircleDashedIcon, GitBranchIcon, PackageIcon, PackageOpenIcon, RepeatIcon,
  RotateCcw, SlidersHorizontalIcon, SparklesIcon, WrenchIcon,
} from "lucide-react"
import type { ItemUnit, KnowledgeChunk, Json } from "@/integrations/types"
import { getTaskInstances, type TaskInstanceWithDetails, type TaskSupplyEmbed, type TaskTemplateWithSchedule } from "@/modules/care"
import { TIER, dueLabel, type Tier } from "@/lib/redesign/tokens"
import { getTaskGuidance } from "@/pages/item-detail/utils"
import { classifyTaskActor } from "@/lib/taskActor"
import { StepList, InfoBlurb, ManualBlurb } from "@/components/tasks/TaskHowTo"
import { ProTaskNotice } from "@/components/tasks/ProTaskNotice"
import { CautionCallout } from "@/components/tasks/CautionCallout"
import { useSetupCompletion } from "@/pages/item-detail/useSetupCompletion"
import { SYMPTOM_TAGS, type ReCheckTrigger } from "@/lib/symptomTaxonomy"
import { USAGE_TIP_TAG } from "../../../shared/tasks/taxonomy"
import { updateItemUnit } from "@/modules/items/services/itemService"

const INK = "var(--hh-ink)", SUB = "var(--hh-sub)", FAINT = "var(--hh-faint)", TEAL = "var(--hh-teal)"
const TEALD = "var(--hh-teal-deep)", TEAL_WASH = "var(--hh-teal-wash)", CLAY = "var(--hh-clay)"
const CLAY_SOFT = "var(--hh-clay-soft)", SLATE = "var(--hh-slate)", SLATE_SOFT = "var(--hh-slate-soft)"
const LINE = "var(--hh-line)"

const HABIT_TYPES = new Set(["after_each_use", "as_needed"])
function scheduleTypeOf(t: TaskTemplateWithSchedule): string {
  return t.schedule_rule?.[0]?.schedule_type ?? "as_needed"
}
function tierOf(t: TaskTemplateWithSchedule): Tier {
  return t.priority_tier === "essential" ? "essential" : t.priority_tier === "recommended" ? "recommended" : "optional"
}
/** Friendly cadence label (the handoff's "Twice a year" / "Yearly" wording). */
function freqLabel(t: TaskTemplateWithSchedule): string {
  const st = t.schedule_rule?.[0]?.schedule_type
  const n = t.schedule_rule?.[0]?.interval_days
  switch (st) {
    case "weekly": return "Weekly"
    case "monthly": return "Monthly"
    case "quarterly": return "Quarterly"
    case "semiannual": return "Twice a year"
    case "annual": return "Yearly"
    case "seasonal": return "Seasonally"
    case "every_n_days": return n ? `Every ${n} days` : "Every so often"
    default: return ""
  }
}
function manualPageOf(t: TaskTemplateWithSchedule): number | null {
  const meta = (t as unknown as { metadata?: { diagram_pages?: { page: number }[] } }).metadata
  return meta?.diagram_pages?.[0]?.page ?? null
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

// ── Supplies (Q5) ─────────────────────────────────────────────────────────────
function suppliesOf(t: TaskTemplateWithSchedule): { name: string; part: string | null }[] {
  const rows = (t as { task_template_supply?: TaskSupplyEmbed[] }).task_template_supply ?? []
  return rows
    .map((r) => (r.supply_item ? { name: r.supply_item.name, part: r.supply_item.oem_part_number } : null))
    .filter((s): s is { name: string; part: string | null } => s !== null)
}
/** "You'll need" chip row — renders ONLY when the task cites supplies. */
function SupplyChips({ supplies }: { supplies: { name: string; part: string | null }[] }) {
  if (supplies.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color: SUB }}>You&apos;ll need</div>
      <div className="flex flex-wrap gap-1.5">
        {supplies.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11.5px] font-semibold" style={{ borderColor: LINE, background: "var(--hh-surface)", color: "#3C4A47" }}>
            <PackageIcon className="size-3" style={{ color: TEAL }} />
            {s.name}{s.part && <span className="font-normal" style={{ color: FAINT }}>· {s.part}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-[16px] bg-[var(--hh-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.05)]">{children}</div>
}
function BandLabel({ icon: Ic, children, hint }: { icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-1.5 pl-0.5">
      <Ic className="size-3.5" style={{ color: SUB }} />
      <span className="text-[11px] font-bold uppercase tracking-[0.6px]" style={{ color: SUB }}>{children}</span>
      {hint && <span className="text-[11px] font-semibold" style={{ color: FAINT }}>· {hint}</span>}
    </div>
  )
}

// ── Habit bands (read-only) ──────────────────────────────────────────────────
function HabitList({ tasks, variant, showAll }: { tasks: TaskTemplateWithSchedule[]; variant: string | null; showAll: boolean }) {
  return (
    <Card>
      <div className="flex flex-col gap-2.5 p-4">
        {tasks.map((t) => {
          const essential = t.priority_tier === "essential" && scheduleTypeOf(t) === "after_each_use"
          const vTag = variantTagFor(t, variant, showAll)
          return (
            <div key={t.task_template_id} className="flex items-start gap-2.5">
              <span className="mt-[6px] size-1.5 shrink-0 rounded-full" style={{ background: essential ? CLAY : TEAL }} />
              <span className="flex-1 text-[13.5px] leading-snug" style={{ color: "#26302D" }}>{t.title}</span>
              {vTag && <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.4px]" style={{ background: SLATE_SOFT, color: SLATE }}><GitBranchIcon className="size-2.5" />{vTag}</span>}
              {essential && <span className="mt-px shrink-0 text-[9px] font-bold uppercase tracking-[0.4px]" style={{ color: CLAY }}>Essential</span>}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

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

function ScheduleRow({ t, due, completed, instanceId, onOpenTask, hasManual, onOpenManualPage, last, variantTag, safetyNote }: {
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
  const [open, setOpen] = useState(false)
  const tier = tierOf(t)
  const safety = t.risk_level === "safety" || !!safetyNote
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
    <div style={{ borderTop: last ? "none" : `1px solid ${LINE}` }}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div onClick={openTask} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-[9px]" style={{ background: safety ? CLAY_SOFT : "#F1F5F4" }}>
            <WrenchIcon className="size-[17px]" style={{ color: safety ? CLAY : TEALD }} />
          </div>
          <div className="min-w-0 flex-1">
            {/* Tier dot pinned to the FIRST line of the title (mt aligns it to
                the 14px line's optical center). Previously the dot + title were
                siblings in a flex-wrap row, so a title long enough to wrap got
                pushed to its own line, orphaning the dot above it. */}
            <div className="flex items-start gap-2">
              <span className="mt-[6px] size-[7px] shrink-0 rounded-full" style={{ background: TIER[tier].dot }} />
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[14px] font-semibold tracking-[-0.2px]" style={{ color: INK }}>{t.title}</span>
                {safety && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: CLAY_SOFT, color: CLAY }}>Safety</span>}
                {(actor === "pro" || actor === "hazardous") && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}>Pro</span>}
                {variantTag && <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.3px]" style={{ background: SLATE_SOFT, color: SLATE }}><GitBranchIcon className="size-2.5" />{variantTag}</span>}
              </div>
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: SUB }}>
              {freqLabel(t)}{t.estimated_minutes ? ` · ${t.estimated_minutes} min` : ""}
              {days != null && <span style={{ color: neverStarted ? SUB : dueStatusColor(days), fontWeight: !neverStarted && days <= 7 ? 700 : 500 }}> · {neverStarted ? "Start anytime" : dueLabel(days)}</span>}
            </div>
          </div>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap text-[12.5px] font-bold" style={{ color: TEAL }}>
          {open ? "Hide" : "See how"}{open ? <ChevronUpIcon className="size-4" /> : <ChevronDownIcon className="size-4" />}
        </button>
        {canOpenTask && <ChevronRightIcon onClick={openTask} className="size-4 shrink-0 cursor-pointer" style={{ color: "#C2CBD4" }} />}
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
              <SupplyChips supplies={suppliesOf(t)} />
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
 * app pairing) that the taxonomy converted from tasks into usage-tip chunks.
 * Deliberately NOT task-shaped: no dot, no due date, no Mark done — it exists so
 * the manual's usage guidance stays findable without becoming a reminder.
 */
function UsageTipsBand({ tips, onOpenManualPage }: {
  tips: KnowledgeChunk[]
  onOpenManualPage?: (page: number) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: LINE, background: "#FBFCFC" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <SlidersHorizontalIcon className="size-4 shrink-0" style={{ color: FAINT }} />
        <span className="min-w-0 flex-1">
          <span className="text-[13.5px] font-semibold" style={{ color: SUB }}>Using it well</span>
          <span className="ml-1.5 text-[12.5px]" style={{ color: FAINT }}>· {tips.length} tip{tips.length === 1 ? "" : "s"}</span>
        </span>
        {open
          ? <ChevronUpIcon className="size-[17px] shrink-0" style={{ color: FAINT }} />
          : <ChevronDownIcon className="size-[17px] shrink-0" style={{ color: FAINT }} />}
      </button>
      {open && (
        <ul className="border-t px-4 py-3.5" style={{ borderColor: LINE }}>
          {tips.map((tip) => {
            const page = tip.source_pages?.[0] ?? null
            return (
              <li key={tip.chunk_id} className="border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0" style={{ borderColor: LINE }}>
                <p className="text-[13px] font-semibold" style={{ color: INK }}>{tip.title}</p>
                <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: SUB }}>{tip.content}</p>
                {page != null && onOpenManualPage && (
                  <button
                    type="button"
                    onClick={() => onOpenManualPage(page)}
                    className="mt-1 text-[11.5px] font-bold"
                    style={{ color: TEAL }}
                  >
                    Manual p.{page}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Cleaning band — scheduled tasks whose careType is "cleaning", split out of the
 * maintenance hero and collapsed by default. Cleaning is genuine upkeep but not a
 * deadline: mixing wipe-downs into the tracked schedule is what made the item
 * page read as noise (2026-07-29 dogfooding). Same rows, calmer container.
 */
function CleaningBand({ tasks, dueByTemplate, completedTemplates, activeVariant, showAll, hasManual, onOpenManualPage }: {
  tasks: TaskTemplateWithSchedule[]
  dueByTemplate: Map<string, { due: string | null; instanceId: string | null }>
  completedTemplates: Set<string>
  activeVariant: string | null
  showAll: boolean
  hasManual: boolean
  onOpenManualPage?: (page: number) => void
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: LINE, background: "#FBFCFC" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <SparklesIcon className="size-4 shrink-0" style={{ color: FAINT }} />
        <span className="min-w-0 flex-1">
          <span className="text-[13.5px] font-semibold" style={{ color: SUB }}>Cleaning</span>
          <span className="ml-1.5 text-[12.5px]" style={{ color: FAINT }}>· {tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
        </span>
        {open
          ? <ChevronUpIcon className="size-[17px] shrink-0" style={{ color: FAINT }} />
          : <ChevronDownIcon className="size-[17px] shrink-0" style={{ color: FAINT }} />}
      </button>
      {open && (
        <div className="border-t" style={{ borderColor: LINE }}>
          {tasks.map((t, i) => (
            <ScheduleRow
              key={t.task_template_id}
              t={t}
              due={dueByTemplate.get(t.task_template_id)?.due ?? null}
              completed={completedTemplates.has(t.task_template_id)}
              instanceId={dueByTemplate.get(t.task_template_id)?.instanceId ?? null}
              onOpenTask={(iid) => navigate(`/tasks/${iid}`)}
              hasManual={hasManual}
              onOpenManualPage={onOpenManualPage}
              last={i === tasks.length - 1}
              variantTag={variantTagFor(t, activeVariant, showAll)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SetupBand({ tasks, homeId, item, revealed, onItemUpdate, m }: {
  tasks: TaskTemplateWithSchedule[]
  homeId: string
  item: ItemUnit
  revealed: boolean
  onItemUpdate?: (item: ItemUnit) => void
  m?: boolean
}) {
  const [open, setOpen] = useState(revealed)
  const { isDone, loadingIds, doneCount, toggleDone } = useSetupCompletion(tasks, homeId, item.item_unit_id)
  const allDone = doneCount === tasks.length

  const reveal = async () => {
    setOpen(true)
    if (item.setup_revealed_at) return
    const res = await updateItemUnit(homeId, item.item_unit_id, { setup_revealed_at: new Date().toISOString() })
    if (res.data && onItemUpdate) onItemUpdate(res.data)
  }

  return (
    <div className="overflow-hidden rounded-[14px] border" style={{ borderColor: LINE, background: "#FBFCFC" }}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <PackageOpenIcon className="size-4 shrink-0" style={{ color: FAINT }} />
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="text-[13.5px] font-semibold" style={{ color: SUB }}>{open ? "Setup checklist" : "Just installed it?"}</span>
          <span className="ml-1.5 text-[12.5px]" style={{ color: FAINT }}>· {tasks.length} one-time step{tasks.length === 1 ? "" : "s"}</span>
        </button>
        {doneCount > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.4px]" style={{ background: allDone ? TEAL_WASH : SLATE_SOFT, color: allDone ? TEAL : SLATE }}>{doneCount}/{tasks.length}</span>
        )}
        {!open && (
          <button type="button" onClick={reveal} className="shrink-0 whitespace-nowrap text-[12px] font-bold" style={{ color: TEAL }}>I just installed this</button>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Expand"} className="shrink-0">
          {open ? <ChevronUpIcon className="size-[17px]" style={{ color: FAINT }} /> : <ChevronDownIcon className="size-[17px]" style={{ color: FAINT }} />}
        </button>
      </div>
      {open && (
        <div className="border-t px-4 py-3.5" style={{ borderColor: LINE }}>
          <p className="mb-2.5 text-[12px]" style={{ color: SUB }}>Complete once at install. Re-check after moving or service.</p>
          <div className="flex flex-col" style={{ gap: m ? 12 : 12 }}>
            {tasks.map((t) => {
              const done = isDone(t.task_template_id)
              const loading = loadingIds.has(t.task_template_id)
              const triggers = parseTriggers(t.re_check_triggers ?? [])
              return (
                <div key={t.task_template_id}>
                  <div className="flex items-start gap-2.5">
                    <button type="button" onClick={() => toggleDone(t)} disabled={loading} aria-label={done ? "Mark not done" : "Mark done"} className="mt-px shrink-0 disabled:opacity-50" style={{ color: done ? TEAL : FAINT }}>
                      {done ? <CheckCircle2 className="size-5" /> : <Circle className="size-5" />}
                    </button>
                    <span className="flex-1 text-[13px] leading-snug" style={{ color: done ? FAINT : "#3C4A47", textDecoration: done ? "line-through" : undefined }}>{t.title}</span>
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
      )}
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
  onOpenManualPage?: (page: number) => void
  onItemUpdate?: (item: ItemUnit) => void
  /** Mobile spacing. */
  m?: boolean
}

export function CareBlock({ item, homeId, tasks, chunks, hasManual, onOpenManualPage, onItemUpdate, m }: CareBlockProps) {
  const perUse = tasks.filter((t) => scheduleTypeOf(t) === "after_each_use")
  const asNeeded = tasks.filter((t) => scheduleTypeOf(t) === "as_needed")
  const scheduled = tasks.filter((t) => {
    const st = scheduleTypeOf(t)
    return st !== "setup" && !HABIT_TYPES.has(st)
  })
  const setupTasks = tasks.filter((t) => scheduleTypeOf(t) === "setup")

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
  const persistVariant = async (v: string | null) => {
    setVariant(v)
    setShowAll(false)
    const res = await updateItemUnit(homeId, item.item_unit_id, { variant_tags: v ? [v] : [] })
    if (res.data && onItemUpdate) onItemUpdate(res.data)
  }
  const activeVariant = supportsVariant ? variant : null
  const vis = (t: TaskTemplateWithSchedule) => variantVisible(t, activeVariant, showAll)
  const fPerUse = perUse.filter(vis)
  const fAsNeeded = asNeeded.filter(vis)
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
  const allScheduled = scheduled.filter(vis).sort(byDue)
  // Cleaning is split out of the schedule hero: it's real upkeep, but it's not a
  // deadline, and mixing wipe-downs into the maintenance list is what made the
  // item page feel like noise (2026-07-29). Maintenance stays open and tracked;
  // cleaning collapses into its own group, still one tap away.
  const fScheduled = allScheduled.filter((t) => t.care_type !== "cleaning")
  const fCleaning = allScheduled.filter((t) => t.care_type === "cleaning")

  const nothing = tasks.length === 0
  if (nothing && !critical) {
    return (
      <Card>
        <div className="px-4 py-7 text-center text-[13.5px]" style={{ color: SUB }}>
          {hasManual ? "No upkeep found in this manual yet." : "Add this item's manual to unlock recommended upkeep."}
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


      <section>
        <BandLabel icon={CalendarClockIcon}>On a schedule</BandLabel>
        {fScheduled.length ? (
          <Card>
            {fScheduled.map((t, i) => (
              <ScheduleRow
                key={t.task_template_id}
                t={t}
                due={dueByTemplate.get(t.task_template_id)?.due ?? null}
                completed={completedTemplates.has(t.task_template_id)}
                instanceId={dueByTemplate.get(t.task_template_id)?.instanceId ?? null}
                onOpenTask={(iid) => navigate(`/tasks/${iid}`)}
                hasManual={hasManual}
                onOpenManualPage={onOpenManualPage}
                last={i === fScheduled.length - 1}
                variantTag={variantTagFor(t, activeVariant, showAll)}
                safetyNote={critical && criticalTaskIds.has(t.task_template_id) ? critical.content : undefined}
              />
            ))}
          </Card>
        ) : (
          <div className="rounded-[14px] border border-dashed px-4 py-3 text-[12.5px] italic" style={{ borderColor: LINE, color: FAINT, background: "#FBFCFC" }}>
            {/* Don't claim "nothing found" when the manual DID yield upkeep and it
                all landed in the cleaning group — that reads as a parse failure. */}
            {fCleaning.length > 0
              ? "No scheduled maintenance — this item's upkeep is all cleaning (below)."
              : "No scheduled upkeep found in this manual."}
          </div>
        )}
      </section>


      {fAsNeeded.length > 0 && (
        <section>
          <BandLabel icon={CircleDashedIcon} hint="only when needed">As needed</BandLabel>
          <HabitList tasks={fAsNeeded} variant={activeVariant} showAll={showAll} />
        </section>
      )}

      {fCleaning.length > 0 && (
        <CleaningBand
          tasks={fCleaning}
          dueByTemplate={dueByTemplate}
          completedTemplates={completedTemplates}
          activeVariant={activeVariant}
          showAll={showAll}
          hasManual={hasManual}
          onOpenManualPage={onOpenManualPage}
        />
      )}

      {fSetup.length > 0 && (
        <SetupBand tasks={fSetup} homeId={homeId} item={item} revealed={item.setup_revealed_at != null} onItemUpdate={onItemUpdate} m={m} />
      )}

      {fPerUse.length > 0 && (
        <section>
          <BandLabel icon={RepeatIcon} hint="every use">After each use</BandLabel>
          <HabitList tasks={fPerUse} variant={activeVariant} showAll={showAll} />
        </section>
      )}

      {/* Habits & setup are intentionally calm — habits carry no due date and setup is one-time. */}
      {(fPerUse.length > 0 || fAsNeeded.length > 0) && (
        <div className="flex items-center gap-1.5 pl-0.5 text-[11px]" style={{ color: FAINT }}>
          <BellRingIcon className="size-3" /> Habits have no due date — do them as part of normal use.
        </div>
      )}

      {usageTips.length > 0 && <UsageTipsBand tips={usageTips} onOpenManualPage={onOpenManualPage} />}


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
