/**
 * Clean Session data layer — CHO Data Model v1.1
 * Cleaning tasks from task_instance (includes routine templates after instance generation)
 */

import { supabase } from "@/integrations/shim/client"
import type { ScheduleType } from "@/integrations/types"
import { generateTaskInstances } from "@/modules/care"

export type CleanSessionMode = "cleaning" | "maintenance"

export type CleanTaskSource = "instance" | "routine" | "custom"

export interface CleanTask {
  id: string
  source: CleanTaskSource
  title: string
  description: string | null
  instructions: string | null
  itemUnitId: string | null
  itemName: string | null
  roomId: string | null
  roomName: string | null
  dueDate: string | null
  estimatedMinutes: number | null
  scheduleType: string | null
  lastCompletedDate: string | null
  staleDays: number
  priorityScore: number
  isOverdue: boolean
}

const SCHEDULE_URGENCY: Record<string, number> = {
  after_each_use: 100,
  daily: 80,
  weekly: 50,
  monthly: 20,
  quarterly: 8,
  semiannual: 4,
  annual: 2,
  every_n_days: 15,
  as_needed: 1,
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const dA = new Date(a)
  const dB = new Date(b)
  return Math.round((dB.getTime() - dA.getTime()) / (24 * 60 * 60 * 1000))
}

export function computeCleanScore(task: Omit<CleanTask, "priorityScore">): number {
  const overdueDays =
    task.dueDate && task.isOverdue ? daysBetween(task.dueDate, todayStr()) : 0

  // Cap staleness at 90 days so frequency stays meaningful
  const staleness = Math.min(task.staleDays, 90)

  const freq = SCHEDULE_URGENCY[task.scheduleType ?? "monthly"] ?? 5

  return overdueDays * 4 + staleness * 0.5 + freq
}

type TaskInstanceRow = {
  task_instance_id: string
  task_template_id: string
  due_date: string
  item_unit_id: string | null
  task_template: {
    title: string
    scope_type: string
    item_unit_id: string | null
    care_type?: string
    priority_tier: string
    estimated_minutes: number | null
    schedule_rule: Array<{ schedule_type: string }> | { schedule_type: string } | null
    description: string | null
    instructions_override: string | null
    knowledge_chunk: { content: string } | null
  } | null
  item_unit: {
    display_name: string
    room_id: string | null
    room: { name: string } | null
  } | null
}

/**
 * Fetches tasks for a clean session: task_instance filtered by care_type (cleaning+mixed or maintenance+mixed) + routine templates.
 * Routine = scope_type home, item_unit_id null, source user (user-created home tasks).
 */
export async function getCleaningTasks(
  homeId: string,
  mode: CleanSessionMode = "cleaning"
): Promise<CleanTask[]> {
  const today = todayStr()
  const templateCareTypes = mode === "cleaning" ? ["cleaning", "mixed"] : ["maintenance", "mixed"]

  // 1. Fetch completion map: template_id -> last completed date
  const { data: doneData } = await supabase
    .from("task_instance")
    .select("task_template_id, completed_at")
    .eq("home_id", homeId)
    .eq("status", "done")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })

  const lastByTemplate = new Map<string, string>()
  for (const row of (doneData ?? []) as Array<{ task_template_id: string; completed_at: string }>) {
    if (!lastByTemplate.has(row.task_template_id)) {
      lastByTemplate.set(row.task_template_id, row.completed_at.slice(0, 10))
    }
  }

  // 2. Ensure all active templates have at least one scheduled instance
  const [{ data: allTpls }, { data: existingInst }] = await Promise.all([
    supabase
      .from("task_template")
      .select("task_template_id, item_unit_id")
      .eq("home_id", homeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .in("care_type", templateCareTypes),
    supabase
      .from("task_instance")
      .select("task_template_id")
      .eq("home_id", homeId)
      .eq("status", "scheduled")
      .is("deleted_at", null),
  ])
  const templatesWithInstances = new Set((existingInst ?? []).map((r) => r.task_template_id))
  const needInstances = (allTpls ?? []).filter((t) => !templatesWithInstances.has(t.task_template_id))
  await Promise.all(
    needInstances.map((t) =>
      generateTaskInstances({
        task_template_id: t.task_template_id,
        home_id: homeId,
        item_unit_id: t.item_unit_id ?? undefined,
      })
    )
  )

  // 4. Fetch task_instance rows (scheduled/snoozed); filter by template.care_type for mode
  const { data: instances, error: instErr } = await supabase
    .from("task_instance")
    .select(`
      task_instance_id,
      task_template_id,
      due_date,
      item_unit_id,
      task_template:task_template_id(title, scope_type, item_unit_id, care_type, priority_tier, estimated_minutes, schedule_rule(schedule_type), description, instructions_override, knowledge_chunk:instructions_chunk_id(content)),
      item_unit:item_unit_id(display_name, room_id, room:room_id(name))
    `)
    .eq("home_id", homeId)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)

  if (instErr) throw new Error(`Failed to load tasks: ${instErr.message}`)

  const careTypes = mode === "cleaning" ? ["cleaning", "mixed"] : ["maintenance", "mixed"]
  const instanceRows = ((instances ?? []) as unknown as TaskInstanceRow[]).filter((r) => {
    const ct = r.task_template?.care_type
    return ct != null && careTypes.includes(ct)
  })
  const instanceTasks: CleanTask[] = instanceRows.map((r) => {
    const isRoutine = r.task_template?.scope_type === "home" && r.task_template?.item_unit_id == null
    return { ...r, _isRoutine: isRoutine }
  })
    .map((r) => {
      const due = r.due_date
      const lastDone = lastByTemplate.get(r.task_template_id) ?? null
      const staleDays = lastDone ? daysBetween(lastDone, today) : 9999
      const isOverdue = due < today
      const scheduleRuleRaw = r.task_template?.schedule_rule
      const scheduleType = (Array.isArray(scheduleRuleRaw) ? scheduleRuleRaw[0]?.schedule_type : (scheduleRuleRaw as { schedule_type: string } | null)?.schedule_type) ?? null
      const roomId = (r as { _isRoutine?: boolean })._isRoutine ? null : (r.item_unit?.room_id ?? null)
      const roomName = (r as { _isRoutine?: boolean })._isRoutine ? "Routine" : (r.item_unit?.room?.name ?? null)
      const source: CleanTaskSource = (r as { _isRoutine?: boolean })._isRoutine ? "routine" : "instance"
      const instructions =
        r.task_template?.instructions_override ??
        (r.task_template?.knowledge_chunk as { content?: string } | null)?.content ??
        null
      const t: Omit<CleanTask, "priorityScore"> = {
        id: r.task_instance_id,
        source,
        title: r.task_template?.title ?? "Task",
        description: r.task_template?.description ?? null,
        instructions,
        itemUnitId: (r as { _isRoutine?: boolean })._isRoutine ? null : (r.item_unit_id ?? r.task_template?.item_unit_id ?? null),
        itemName: (r as { _isRoutine?: boolean })._isRoutine ? null : (r.item_unit?.display_name ?? null),
        roomId,
        roomName,
        dueDate: due,
        estimatedMinutes: r.task_template?.estimated_minutes ?? null,
        scheduleType,
        lastCompletedDate: lastDone,
        staleDays,
        isOverdue,
      }
      return { ...t, priorityScore: computeCleanScore(t) }
    })

  return instanceTasks
}

export type RoutineTemplate = {
  task_template_id: string
  title: string
  schedule_type: string
  estimated_minutes: number | null
}

/**
 * Returns task_templates where scope_type=home, item_unit_id=null (routine tasks).
 */
export async function getRoutineTemplates(homeId: string): Promise<RoutineTemplate[]> {
  const { data, error } = await supabase
    .from("task_template")
    .select(`
      task_template_id,
      title,
      estimated_minutes,
      schedule_rule(schedule_type)
    `)
    .eq("home_id", homeId)
    .eq("scope_type", "home")
    .is("item_unit_id", null)
    .eq("source", "user")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) throw new Error(`Failed to load routine templates: ${error.message}`)

  const rows = (data ?? []) as Array<{
    task_template_id: string
    title: string
    estimated_minutes: number | null
    schedule_rule: { schedule_type: string }[] | { schedule_type: string } | null
  }>
  return rows.map((r) => {
    const rule = Array.isArray(r.schedule_rule) ? r.schedule_rule[0] : r.schedule_rule
    return {
      task_template_id: r.task_template_id,
      title: r.title,
      schedule_type: rule?.schedule_type ?? "monthly",
      estimated_minutes: r.estimated_minutes,
    }
  })
}

/** A short, guide-level deep-clean entry for the desktop Home rail. */
export type DeepCleanGuide = {
  id: string
  title: string
  estimatedMinutes: number | null
  /** Appliance this guide is for → links to /clean/:itemUnitId. Null for
   *  home-level cleaning routines, which link to the /clean hub instead. */
  itemUnitId: string | null
}

const DEEP_CLEAN_GUIDE_CAP = 5

/**
 * Curated, guide-LEVEL deep-clean list for the desktop Home "Deep-clean guides"
 * rail (advanced/power only). This is deliberately NOT `getCleaningTasks`, which
 * returns every granular cleaning step (30+ rows) and would over-render the
 * card. We want ~4–5 guide-level entries with an "All →" to /clean for the rest.
 *
 * Source preference:
 *  1. `getRoutineTemplates` — home cleaning ROUTINE templates (scope_type=home,
 *     item_unit_id null). These are already guide-level, not per-step.
 *  2. Fallback: `getCleaningTasks` DE-DUPLICATED by item (one row per appliance,
 *     e.g. "Clean the Range", not each sub-step), capped at the same limit.
 */
export async function getDeepCleanGuides(homeId: string): Promise<DeepCleanGuide[]> {
  // 1. Prefer guide-level routine templates.
  try {
    const routines = await getRoutineTemplates(homeId)
    if (routines.length > 0) {
      return routines.slice(0, DEEP_CLEAN_GUIDE_CAP).map((r) => ({
        id: r.task_template_id,
        title: r.title,
        estimatedMinutes: r.estimated_minutes,
        itemUnitId: null,
      }))
    }
  } catch {
    // Non-fatal — fall through to the per-item fallback below.
  }

  // 2. Fallback: collapse granular cleaning steps to one entry per item, sorted
  // by clean-priority so the most relevant guides surface first.
  const tasks = await getCleaningTasks(homeId, "cleaning")
  const byItem = new Map<string, DeepCleanGuide>()
  for (const t of [...tasks].sort((a, b) => b.priorityScore - a.priorityScore)) {
    // De-dup by appliance (item_unit) so one guide covers all of its cleaning
    // steps; fall back to the title for home-level routine rows.
    const key = t.itemUnitId ?? t.itemName ?? t.title
    if (byItem.has(key)) continue
    byItem.set(key, {
      id: t.id,
      // Guide-level label: "Clean the {item}" when we have an appliance, else
      // the task's own title (already guide-shaped for routine rows).
      title: t.itemName ? `Clean the ${t.itemName}` : t.title,
      estimatedMinutes: t.estimatedMinutes,
      itemUnitId: t.itemUnitId,
    })
    if (byItem.size >= DEEP_CLEAN_GUIDE_CAP) break
  }
  return Array.from(byItem.values())
}

// ── Per-appliance clean guide ─────────────────────────────────────────────────

export type CleanGuideStep = {
  taskTemplateId: string
  title: string
  instructions: string | null
  steps: string[] | null
  supplies: string[]
  estimatedMinutes: number | null
}

export type ItemCleanGuide = {
  itemUnitId: string
  itemName: string
  roomName: string | null
  totalMinutes: number
  tasks: CleanGuideStep[]
}

/**
 * Assembles a per-appliance deep-clean guide from the item's manual-parsed
 * cleaning task_templates (care_type cleaning/mixed). Each task already carries
 * the structured `steps` (Increment 2) + cited supplies, so the guide renders
 * real how-to content with no separate generation step. Returns null when the
 * item has no cleaning tasks, so we never link to an empty guide.
 */
export async function getItemCleanGuide(
  homeId: string,
  itemUnitId: string
): Promise<ItemCleanGuide | null> {
  const { data, error } = await supabase
    .from("task_template")
    .select(`
      task_template_id, title, instructions_override, steps, estimated_minutes,
      item_unit:item_unit_id(display_name, room:room_id(name)),
      task_template_supply(supply_item(name))
    `)
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)
    .in("care_type", ["cleaning", "mixed"])
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })

  if (error) throw new Error(`Failed to load clean guide: ${error.message}`)

  type GuideRow = {
    task_template_id: string
    title: string | null
    instructions_override: string | null
    steps: string[] | null
    estimated_minutes: number | null
    item_unit: { display_name: string; room: { name: string } | null } | { display_name: string; room: { name: string } | null }[] | null
    task_template_supply: Array<{ supply_item: { name: string } | { name: string }[] | null }>
  }
  const rows = (data ?? []) as unknown as GuideRow[]
  if (rows.length === 0) return null

  const firstItem = Array.isArray(rows[0].item_unit) ? rows[0].item_unit[0] : rows[0].item_unit
  const room = firstItem && (Array.isArray(firstItem.room) ? firstItem.room[0] : firstItem.room)

  const tasks: CleanGuideStep[] = rows.map((r) => {
    const rawSteps = Array.isArray(r.steps) ? r.steps.map((s) => String(s).trim()).filter(Boolean) : null
    const supplies = (r.task_template_supply ?? [])
      .map((s) => (Array.isArray(s.supply_item) ? s.supply_item[0]?.name : s.supply_item?.name))
      .map((n) => (n ?? "").trim())
      .filter(Boolean)
    return {
      taskTemplateId: r.task_template_id,
      title: r.title ?? "Cleaning step",
      instructions: r.instructions_override ?? null,
      steps: rawSteps && rawSteps.length > 0 ? rawSteps : null,
      supplies,
      estimatedMinutes: r.estimated_minutes ?? null,
    }
  })

  return {
    itemUnitId,
    itemName: firstItem?.display_name ?? "Item",
    roomName: room?.name ?? null,
    totalMinutes: tasks.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0),
    tasks,
  }
}

/**
 * Creates a routine task_template with schedule_rule.
 */
export async function saveRoutineTask(
  homeId: string,
  title: string,
  scheduleType: string,
  estimatedMinutes: number | null
): Promise<{ task_template_id: string } | { error: string }> {
  const validSchedule: ScheduleType[] = [
    "weekly",
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
    "as_needed",
  ]
  const st = validSchedule.includes(scheduleType as ScheduleType)
    ? (scheduleType as ScheduleType)
    : "monthly"

  const { data: tmpl, error: tmplErr } = await supabase
    .from("task_template")
    .insert({
      home_id: homeId,
      scope_type: "home",
      item_unit_id: null,
      title: title.trim(),
      care_type: "cleaning",
      priority_tier: "recommended",
      risk_level: "comfort",
      estimated_minutes: estimatedMinutes,
      supplies_mode: "none",
      source: "user",
      is_user_editable: true,
      is_active: true,
    })
    .select("task_template_id")
    .single()

  if (tmplErr || !tmpl) return { error: tmplErr?.message ?? "Failed to create template" }

  const { error: ruleErr } = await supabase.from("schedule_rule").insert({
    task_template_id: tmpl.task_template_id,
    schedule_type: st,
    window_days_before: 7,
    window_days_after: 14,
  })

  if (ruleErr) return { error: ruleErr.message }
  return { task_template_id: tmpl.task_template_id }
}

/**
 * Creates a standalone (home-scoped) task with schedule_rule.
 * Supports care_type and priority_tier for maintenance tasks.
 */
export async function saveStandaloneTask(
  homeId: string,
  opts: {
    title: string
    scheduleType: string
    careType: "cleaning" | "maintenance" | "mixed"
    priorityTier: "essential" | "recommended" | "optional"
    estimatedMinutes: number | null
    roomId: string | null
  }
): Promise<{ task_template_id: string } | { error: string }> {
  const validSchedule: ScheduleType[] = [
    "weekly",
    "monthly",
    "quarterly",
    "semiannual",
    "annual",
    "as_needed",
  ]
  const st = validSchedule.includes(opts.scheduleType as ScheduleType)
    ? (opts.scheduleType as ScheduleType)
    : "monthly"

  const { data: tmpl, error: tmplErr } = await supabase
    .from("task_template")
    .insert({
      home_id: homeId,
      scope_type: "home",
      item_unit_id: null,
      room_id: opts.roomId,
      title: opts.title.trim(),
      care_type: opts.careType,
      priority_tier: opts.priorityTier,
      risk_level: "comfort",
      estimated_minutes: opts.estimatedMinutes,
      supplies_mode: "none",
      source: "user",
      is_user_editable: true,
      is_active: true,
    })
    .select("task_template_id")
    .single()

  if (tmplErr || !tmpl) return { error: tmplErr?.message ?? "Failed to create template" }

  const { error: ruleErr } = await supabase.from("schedule_rule").insert({
    task_template_id: tmpl.task_template_id,
    schedule_type: st,
    window_days_before: 7,
    window_days_after: 14,
  })

  if (ruleErr) return { error: ruleErr.message }
  return { task_template_id: tmpl.task_template_id }
}

/**
 * Soft-deletes a task_template.
 */
export async function deleteRoutineTask(templateId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("task_template")
    .update({ deleted_at: new Date().toISOString() })
    .eq("task_template_id", templateId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
