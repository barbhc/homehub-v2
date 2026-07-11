import { supabase } from "@/integrations/shim/client"
import type { MaintenanceFreqUnit, PriorityTier } from "@/integrations/types"
import type { ServiceResult } from "./taskService"
import { createTaskTemplate } from "./taskService"
import { createScheduleRule, generateTaskInstances } from "./scheduleService"
import { taskSource, effortToMinutes, frequencyToSchedule, type TaskSource } from "./taskMapping"

/**
 * Unified "This week" agenda read model (Phase 2) and the v1.1 task-creation
 * path that replaces the retired `maintenanceService` (which targeted the
 * dropped `maintenance_tasks` table).
 *
 * The redesign's WeekAgenda merges appliance upkeep + home upkeep + cleaning
 * into one feed; `getWeekAgenda` reads task_instance joined to task_template
 * (for scope_type/care_type → source chip) and item_unit (name + room), so the
 * UI never has to touch three different shapes.
 */

export type WeekAgendaItem = {
  taskInstanceId: string
  taskTemplateId: string
  title: string
  source: TaskSource
  priorityTier: PriorityTier
  estimatedMinutes: number | null
  dueDate: string
  /**
   * Genuinely overdue: an *essential* cadence that was actually started once
   * and then lapsed. Recommended/optional work and never-started tasks are
   * never "overdue" — they read as calm "Start anytime" backlog instead.
   */
  isOverdue: boolean
  /** Due date is in the past (any tier, regardless of completion history). */
  pastDue: boolean
  itemUnitId: string | null
  itemName: string | null
  roomName: string | null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Returns scheduled/snoozed task instances due on or before `today + days`
 * (default 7), newest-due last, each tagged with its agenda source. Overdue
 * items are included (they still need doing this week).
 */
export async function getWeekAgenda(
  homeId: string,
  opts?: { days?: number }
): Promise<ServiceResult<WeekAgendaItem[]>> {
  const today = todayStr()
  const horizon = addDaysStr(today, opts?.days ?? 7)

  const { data, error } = await supabase
    .from("task_instance")
    .select(
      `
      task_instance_id,
      task_template_id,
      due_date,
      item_unit_id,
      task_template:task_template_id(title, scope_type, care_type, priority_tier, estimated_minutes),
      item_unit:item_unit_id(display_name, room:room_id(name))
    `
    )
    .eq("home_id", homeId)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)
    .lte("due_date", horizon)
    .order("due_date", { ascending: true })

  if (error) return { data: null, error: { message: error.message } }

  // Templates with at least one completed instance — used to tell a lapsed
  // cadence (genuinely overdue) apart from a never-started one (calm backlog).
  const { data: doneData } = await supabase
    .from("task_instance")
    .select("task_template_id")
    .eq("home_id", homeId)
    .eq("status", "done")
    .not("completed_at", "is", null)
  const completedTemplates = new Set(
    ((doneData ?? []) as Array<{ task_template_id: string }>).map((r) => r.task_template_id),
  )

  type Row = {
    task_instance_id: string
    task_template_id: string
    due_date: string
    item_unit_id: string | null
    task_template: {
      title: string
      scope_type: "home" | "item_unit"
      care_type: string | null
      priority_tier: PriorityTier
      estimated_minutes: number | null
    } | null
    item_unit: { display_name: string; room: { name: string } | null } | null
  }

  const items: WeekAgendaItem[] = ((data ?? []) as unknown as Row[])
    // Binding fix (see design/data-binding-pattern.md): the agenda is a curated
    // maintenance/upkeep feed, NOT a flatten of every per-item cleaning step.
    // Drop item-scoped cleaning sub-steps ("Clean Oven Door Exterior", "Wipe
    // Drawer Window"…) — those live inside a Deep-Clean guide. KEEP all
    // maintenance and HOME-scoped cleaning routines ("Clean range-hood
    // filters"), which are real recurring upkeep. Mirrors getDashboardTasks.
    .filter(
      (r) =>
        !(r.task_template?.care_type === "cleaning" && r.task_template?.scope_type === "item_unit")
    )
    .map((r) => {
      const tier = r.task_template?.priority_tier ?? "optional"
      const pastDue = r.due_date < today
      // Only an essential cadence that was previously completed and then
      // lapsed counts as genuinely "overdue". Never-started work and all
      // recommended/optional past-due work stay calm (Start anytime).
      const isOverdue = pastDue && tier === "essential" && completedTemplates.has(r.task_template_id)
      return {
        taskInstanceId: r.task_instance_id,
        taskTemplateId: r.task_template_id,
        title: r.task_template?.title ?? "Task",
        source: taskSource(r.task_template?.scope_type ?? "item_unit", r.task_template?.care_type),
        priorityTier: tier,
        estimatedMinutes: r.task_template?.estimated_minutes ?? null,
        dueDate: r.due_date,
        isOverdue,
        pastDue,
        itemUnitId: r.item_unit_id,
        itemName: r.item_unit?.display_name ?? null,
        roomName: r.item_unit?.room?.name ?? null,
      }
    })

  return { data: items, error: null }
}

/** A user-entered/parsed task from the add-item "Plan" step, framework-agnostic. */
export type EditableTaskInput = {
  title: string
  instructions?: string | null
  priority: PriorityTier
  effort?: "short" | "medium" | "long" | null
  afterEachUse?: boolean
  frequencyValue: number | null
  frequencyUnit: MaintenanceFreqUnit | null
}

export type CreateTasksResult =
  | { success: true; count: number }
  | { success: false; error: string }

/**
 * Creates v1.1 tasks for an item from the add-item Plan step: one task_template
 * + schedule_rule per editable task, then generates the upcoming instances.
 * Replaces `maintenanceService.createMaintenanceTasks`. Best-effort across the
 * list — returns the count created and the first error (if any).
 */
export async function createTasksFromEditable(
  homeId: string,
  itemUnitId: string | null,
  tasks: EditableTaskInput[]
): Promise<CreateTasksResult> {
  let count = 0
  let firstError: string | null = null

  for (const t of tasks) {
    const tmpl = await createTaskTemplate({
      home_id: homeId,
      scope_type: itemUnitId ? "item_unit" : "home",
      item_unit_id: itemUnitId,
      title: t.title.trim(),
      description: t.instructions ?? null,
      care_type: "maintenance",
      priority_tier: t.priority,
      risk_level: "comfort",
      estimated_minutes: effortToMinutes(t.effort),
      source: "manual",
    })
    if (tmpl.error || !tmpl.data) {
      firstError ??= tmpl.error?.message ?? "Failed to create task"
      continue
    }

    const sched = frequencyToSchedule(t)
    const ruleRes = await createScheduleRule({
      task_template_id: tmpl.data.task_template_id,
      schedule_type: sched.schedule_type,
      interval_days: sched.interval_days,
    })
    if (ruleRes.error) {
      firstError ??= ruleRes.error.message
      continue
    }

    // Non-recurring types (as_needed/after_each_use) legitimately produce no
    // scheduled instance — `generateTaskInstances` returns success with count 0
    // for those — so only a real error counts as a failure here.
    const gen = await generateTaskInstances({
      home_id: homeId,
      task_template_id: tmpl.data.task_template_id,
      item_unit_id: itemUnitId,
    })
    if (gen.error) {
      firstError ??= gen.error.message
      continue
    }
    count++
  }

  if (count === 0 && firstError) return { success: false, error: firstError }
  return { success: true, count }
}
