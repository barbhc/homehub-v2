import type { TaskTemplateWithSchedule } from "@/modules/care"
import { splitCautions, type SplitSteps } from "@/lib/cautions"

export type EditableField =
  | "display_name"
  | "brand"
  | "model"
  | "category"
  | "room_id"
  | "serial_number"
  | "purchase_date"
  | "install_date"
  | "store_name"
  | "price_paid"
  | "status"
  | "notes"
  | "warranty_expiry_date"
  | "warranty_duration_months"
  | "warranty_coverage"
  | "manufactured_year"

export const ROOM_NONE = "__none__" as const

export const SCHEDULE_LABELS: Record<string, string> = {
  after_each_use: "After each use",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Semiannual",
  annual: "Annual",
  seasonal: "Seasonal",
  every_n_days: "Every N days",
  as_needed: "As needed",
  setup: "Setup (one-time)",
}

export const tierBorderStyles = {
  essential: "border-l-red-500",
  recommended: "border-l-amber-500",
  optional: "border-l-[#2D9B82]",
}

export const tierChipStyles = {
  essential: "border-red-500/60 text-red-700 dark:text-red-400",
  recommended: "border-amber-500/60 text-amber-700 dark:text-amber-400",
  optional: "border-[#2D9B82]/60 text-[#1B6B5A] dark:text-[#2D9B82]",
}

export const tierDotStyles = {
  essential: "bg-red-500",
  recommended: "bg-amber-500",
  optional: "bg-[#2D9B82]",
}

export const tierTextStyles = {
  essential: "text-red-600 dark:text-red-400",
  recommended: "text-amber-600 dark:text-amber-400",
  optional: "text-[#1B6B5A] dark:text-[#2D9B82]",
}

export type TierKey = "essential" | "recommended" | "optional"

export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

/**
 * Get displayable step-by-step instructions for a task.
 * Priority: instructions_override -> description -> null
 */
export function getTaskInstructions(task: TaskTemplateWithSchedule): string[] | null {
  const text = task.instructions_override ?? task.description
  if (!text) return null
  return parseSteps(text)
}

/**
 * Splits a block of instruction prose into discrete steps. Shared by the item
 * page and the Tasks-page how-to so both render the same numbered steps from
 * the same source text (instructions_override / notes / description).
 *
 * Falls back to `[text]` (a single step) only when nothing splits — callers can
 * treat a length-1 result as "still one paragraph" if they want a prose layout.
 */
export function parseSteps(text: string): string[] {
  // Cleaning-guide chunks were stored with their content as a JSON blob
  // (e.g. {"steps":[…],"supplies":[…]} or [{…}]) — parse it back into steps
  // instead of rendering the literal JSON. (Phase 1 guard for already-parsed data.)
  const jsonSteps = tryJsonSteps(text)
  if (jsonSteps) return jsonSteps

  // Try line-based numbered list first (e.g. "1. Do this\n2. Do that")
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean)
  const numbered = lines.filter((l) => /^\d+[.)]\s+/.test(l))
  if (numbered.length >= 2) return numbered.map((l) => l.replace(/^\d+[.)]\s+/, ""))

  // Try inline numbered steps (e.g. "1. Open door. 2. Slide rack in. 3. Close.")
  const inlineSegments = text.split(/(?:^|\s+)(?=\d+[.)]\s)/)
    .map((s) => s.replace(/^\d+[.)]\s+/, "").trim())
    .filter(Boolean)
  if (inlineSegments.length >= 2) return inlineSegments

  // Try sentence-boundary numbered steps (e.g. "Open door. 2. Slide rack in.")
  const sentenceSplit = text.split(/\.\s+(?=\d+[.)]\s)/)
  if (sentenceSplit.length >= 2) {
    return sentenceSplit.map((s, i) => {
      let step = s.replace(/^\d+[.)]\s+/, "").trim()
      if (i < sentenceSplit.length - 1 && !step.endsWith(".")) step += "."
      return step
    }).filter(Boolean)
  }

  // Split prose by sentence boundaries (period/exclamation followed by space + capital)
  const sentences = text
    .split(/(?<=[.!])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
  if (sentences.length >= 2) return sentences

  // Single block — return as one step
  return [text]
}

/**
 * If `text` is a JSON blob a cleaning-guide chunk was stored as, pull the step
 * strings out of it. Handles {steps:[…]}, [{steps:[…]}], and nested
 * {weekly|deep_clean:{steps:[…]}}. Returns null when it isn't recognizable JSON.
 */
function tryJsonSteps(text: string): string[] | null {
  const t = text.trim()
  if (!(t.startsWith("{") || t.startsWith("["))) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(t)
  } catch {
    return null
  }
  const out: string[] = []
  const collect = (v: unknown): void => {
    if (!v) return
    if (Array.isArray(v)) {
      for (const e of v) {
        if (typeof e === "string") out.push(e)
        else collect(e)
      }
      return
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>
      if (Array.isArray(o.steps)) collect(o.steps)
      else for (const val of Object.values(o)) collect(val)
    }
  }
  collect(parsed)
  const steps = out.map((s) => String(s).trim()).filter(Boolean)
  return steps.length > 0 ? steps : null
}

/**
 * Splits a task's instructions into actionable steps vs. cautions.
 *
 * Prefers the structured `cautions` column when the parser populated it
 * (precise, future data) and unions it with a heuristic split over the
 * instruction prose, so existing tasks — whose warnings are still baked into
 * `instructions_override` — surface their cautions without a DB backfill.
 */
export function getTaskGuidance(task: TaskTemplateWithSchedule): SplitSteps {
  const structured = (task as unknown as { cautions?: string[] | null }).cautions
  const structuredCautions = Array.isArray(structured)
    ? structured.map((c) => String(c).trim()).filter(Boolean)
    : []
  return splitCautions(getTaskInstructions(task) ?? [], structuredCautions)
}

// Glass card styles
export const glassCardStyles = {
  base: "bg-white/55 backdrop-blur-sm border border-white/70 rounded-[14px] transition-all duration-200",
  hover: "hover:bg-white/75 hover:-translate-y-px hover:shadow-md",
  expanded: "bg-white/80 shadow-md",
}

// Gradient accent bar styles (4px left bar)
export const tierAccentStyles = {
  essential: "bg-gradient-to-b from-red-500 to-red-600",
  recommended: "bg-gradient-to-b from-amber-500 to-amber-600",
  optional: "bg-gradient-to-b from-[#2D9B82] to-[#1f8069]",
}

// Glass toggle bar styles
export const glassToggleStyles = {
  container: "bg-white/40 backdrop-blur-sm border border-white/60 rounded-xl p-1 flex gap-0",
  item: "flex-1 text-[11px] sm:text-xs font-semibold py-2 text-center rounded-[10px] cursor-pointer transition-all duration-200 text-muted-foreground whitespace-nowrap",
  active: "bg-white/85 text-foreground shadow-sm",
}

export function getScheduleLabel(t: TaskTemplateWithSchedule): string | null {
  const rule = Array.isArray(t.schedule_rule) ? t.schedule_rule[0] : null
  const st = rule?.schedule_type
  if (!st) return null
  let label = SCHEDULE_LABELS[st] ?? st
  // Show actual interval for "every N days" schedules (e.g. "Every 180 days")
  if (st === "every_n_days" && rule?.interval_days) {
    label = `Every ${rule.interval_days} days`
  }
  if (t.estimated_minutes) return `${label} · ${t.estimated_minutes} min`
  return label
}
