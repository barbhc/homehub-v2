import { supabase } from "@/integrations/shim/client"
import type { ScheduleRule, ScheduleType, Season } from "@/integrations/types"
import { computePriorityScore } from "./taskService"

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

// Seasonal anchor dates (from CHO spec v1)
const SEASON_ANCHOR: Record<Season, string> = {
  spring: "04-15",
  summer: "07-15",
  fall: "10-15",
  winter: "01-15",
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function getSeasonAnchorYear(season: Season, referenceDate: string): number {
  const refYear = new Date(referenceDate + "T12:00:00").getFullYear()
  if (season === "winter") return refYear // Jan 15 of current year
  return refYear
}

/**
 * Resolves a schedule_rule to a concrete due_date.
 * - interval_days: due = today + interval_days (or anchor-based)
 * - seasonal: due = season anchor date
 * - annual: due = anchor_date or Jan 1
 */
function resolveDueDate(
  rule: ScheduleRule,
  today: string
): string | null {
  const { schedule_type, interval_days, anchor_date, season } = rule

  switch (schedule_type) {
    case "after_each_use":
      return null // No recurring due; manual trigger
    case "as_needed":
      return null
    case "setup":
      return null // One-time install task; no recurring due date generated
    case "every_n_days":
      if (interval_days != null) return addDays(today, interval_days)
      return null
    case "weekly":
      return addDays(today, 7)
    case "monthly":
      return addDays(today, 30)
    case "quarterly":
      return addDays(today, 90)
    case "semiannual":
      return addDays(today, 180)
    case "annual":
      if (anchor_date) return anchor_date
      return addDays(today, 365)
    case "seasonal":
      if (season) {
        const anchor = SEASON_ANCHOR[season]
        const year = getSeasonAnchorYear(season, today)
        return `${year}-${anchor}`
      }
      return null
    default:
      return addDays(today, interval_days ?? 365)
  }
}

/**
 * Fetches schedule_rules for a task_template.
 */
export async function getScheduleRulesByTemplate(
  taskTemplateId: string
): Promise<ServiceResult<ScheduleRule[]>> {
  const { error, data } = await supabase
    .from("schedule_rule")
    .select("*")
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ScheduleRule[], error: null }
}

export type CreateScheduleRuleInput = {
  task_template_id: string
  schedule_type: ScheduleType
  interval_days?: number | null
  anchor_date?: string | null
  season?: Season | null
  window_days_before?: number
  window_days_after?: number
}

/**
 * Creates a schedule_rule.
 */
export async function createScheduleRule(
  input: CreateScheduleRuleInput
): Promise<ServiceResult<ScheduleRule>> {
  const { error, data } = await supabase
    .from("schedule_rule")
    .insert({
      ...input,
      window_days_before: input.window_days_before ?? 7,
      window_days_after: input.window_days_after ?? 14,
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ScheduleRule, error: null }
}

export type GenerateInstancesInput = {
  home_id: string
  task_template_id: string
  item_unit_id?: string | null
  from_date?: string
  to_date?: string
}

/**
 * Generates task_instances for a task_template based on its schedule_rules.
 * Fetches the task_template, its schedule_rules, then creates instances.
 * Called by ingest/commit flow or a periodic job.
 */
export async function generateTaskInstances(
  input: GenerateInstancesInput
): Promise<ServiceResult<{ count: number }>> {
  const today = input.from_date ?? todayStr()
  const toDate = input.to_date ?? addDays(today, 365)

  const { data: template, error: templateErr } = await supabase
    .from("task_template")
    .select("*")
    .eq("task_template_id", input.task_template_id)
    .eq("home_id", input.home_id)
    .eq("is_active", true)
    .is("deleted_at", null)
    .single()

  if (templateErr || !template) {
    return { data: null, error: { message: templateErr?.message ?? "Task template not found" } }
  }

  const { data: rules, error: rulesErr } = await getScheduleRulesByTemplate(input.task_template_id)
  if (rulesErr || !rules || rules.length === 0) {
    return { data: null, error: { message: "No schedule rules" } }
  }

  const instances: Array<{
    home_id: string
    task_template_id: string
    item_unit_id: string | null
    status: "scheduled"
    due_date: string
    window_start: string | null
    window_end: string | null
    priority_score: number
    is_safety_critical: boolean
  }> = []

  for (const rule of rules) {
    const dueDate = resolveDueDate(rule as ScheduleRule, today)
    if (!dueDate || dueDate < today) continue
    if (dueDate > toDate) continue

    const windowStart = addDays(dueDate, -(rule.window_days_before ?? 7))
    const windowEnd = addDays(dueDate, rule.window_days_after ?? 14)

    const { priorityScore, isSafetyCritical } = computePriorityScore(
      template.priority_tier,
      template.risk_level,
      dueDate,
      windowStart,
      windowEnd,
      template.estimated_minutes
    )

    instances.push({
      home_id: input.home_id,
      task_template_id: input.task_template_id,
      item_unit_id: input.item_unit_id ?? template.item_unit_id ?? null,
      status: "scheduled",
      due_date: dueDate,
      window_start: windowStart,
      window_end: windowEnd,
      priority_score: priorityScore,
      is_safety_critical: isSafetyCritical,
    })
  }

  if (instances.length === 0) {
    return { data: { count: 0 }, error: null }
  }

  const { error: insertErr } = await supabase.from("task_instance").insert(instances)
  if (insertErr) return { data: null, error: { message: insertErr.message } }
  return { data: { count: instances.length }, error: null }
}
