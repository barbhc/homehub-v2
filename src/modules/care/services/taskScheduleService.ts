import { supabase } from "@/integrations/shim/client"
import type {
  PriorityTier,
  RiskLevel,
  ScheduleType,
} from "@/integrations/types"
import type { ServiceResult } from "./careNoteService"

export type ScheduleInput = {
  scheduleType: ScheduleType
  intervalDays?: number
}

export type CreateTaskFromNoteInput = {
  homeId: string
  roomId?: string | null
  itemUnitId?: string | null
  title: string
  description?: string | null
  priorityTier: PriorityTier
  careType?: "cleaning" | "maintenance" | "mixed"
  schedule: ScheduleInput
}

function computeDueDate(schedule: ScheduleInput): string {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  switch (schedule.scheduleType) {
    case "weekly":
      d.setDate(d.getDate() + 7)
      break
    case "monthly":
      d.setMonth(d.getMonth() + 1)
      break
    case "quarterly":
      d.setMonth(d.getMonth() + 3)
      break
    case "semiannual":
      d.setMonth(d.getMonth() + 6)
      break
    case "annual":
      d.setFullYear(d.getFullYear() + 1)
      break
    case "every_n_days":
      d.setDate(d.getDate() + (schedule.intervalDays ?? 30))
      break
    default:
      d.setFullYear(d.getFullYear() + 10)
  }
  return d.toISOString().slice(0, 10)
}

export async function createTaskFromNote(
  input: CreateTaskFromNoteInput
): Promise<ServiceResult<{ taskTemplateId: string }>> {
  const { data: tmpl, error: tmplErr } = await supabase
    .from("task_template")
    .insert({
      home_id: input.homeId,
      room_id: input.roomId ?? null,
      item_unit_id: input.itemUnitId ?? null,
      scope_type: input.itemUnitId ? "item_unit" : "home",
      title: input.title,
      description: input.description ?? null,
      care_type: input.careType ?? "cleaning",
      priority_tier: input.priorityTier,
      risk_level: "comfort",
      source: "user",
      supplies_mode: "none",
      is_user_editable: true,
      is_active: true,
    })
    .select("task_template_id")
    .single()
  if (tmplErr || !tmpl)
    return { data: null, error: { message: tmplErr?.message ?? "Failed to create task" } }

  const { error: schedErr } = await supabase.from("schedule_rule").insert({
    task_template_id: tmpl.task_template_id,
    schedule_type: input.schedule.scheduleType,
    interval_days:
      input.schedule.scheduleType === "every_n_days"
        ? (input.schedule.intervalDays ?? 30)
        : null,
    window_days_before: 7,
    window_days_after: 14,
  })
  if (schedErr) return { data: null, error: { message: schedErr.message } }

  const dueDate = computeDueDate(input.schedule)
  const priorityScore =
    input.priorityTier === "essential"
      ? 100
      : input.priorityTier === "recommended"
        ? 60
        : 30
  const { error: instErr } = await supabase.from("task_instance").insert({
    home_id: input.homeId,
    task_template_id: tmpl.task_template_id,
    item_unit_id: input.itemUnitId ?? null,
    status: "scheduled",
    due_date: dueDate,
    priority_score: priorityScore,
    is_safety_critical: false,
  })
  if (instErr) return { data: null, error: { message: instErr.message } }

  return { data: { taskTemplateId: tmpl.task_template_id }, error: null }
}

export async function updateTaskSchedule(
  taskTemplateId: string,
  updates: { priorityTier?: PriorityTier; schedule?: ScheduleInput; estimatedMinutes?: number | null; riskLevel?: RiskLevel },
  source: string = "manual"
): Promise<ServiceResult<true>> {
  if (updates.priorityTier) {
    // Fetch current tier + home_id before updating so we can log the change
    const { data: current } = await supabase
      .from("task_template")
      .select("priority_tier, home_id")
      .eq("task_template_id", taskTemplateId)
      .single()

    const { error } = await supabase
      .from("task_template")
      .update({
        priority_tier: updates.priorityTier,
        updated_at: new Date().toISOString(),
      })
      .eq("task_template_id", taskTemplateId)
    if (error) return { data: null, error: { message: error.message } }

    // Log tier change if the tier actually changed
    if (current && current.priority_tier !== updates.priorityTier) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user && current.home_id) {
        await supabase.from("task_tier_change_log").insert({
          task_template_id: taskTemplateId,
          home_id: current.home_id,
          changed_by: user.id,
          old_tier: current.priority_tier,
          new_tier: updates.priorityTier,
          source,
        })
      }
    }
  }

  if (updates.estimatedMinutes !== undefined) {
    const { error: minErr } = await supabase
      .from("task_template")
      .update({ estimated_minutes: updates.estimatedMinutes, updated_at: new Date().toISOString() })
      .eq("task_template_id", taskTemplateId)
    if (minErr) return { data: null, error: { message: minErr.message } }
  }

  if (updates.riskLevel) {
    const { error: riskErr } = await supabase
      .from("task_template")
      .update({ risk_level: updates.riskLevel, updated_at: new Date().toISOString() })
      .eq("task_template_id", taskTemplateId)
    if (riskErr) return { data: null, error: { message: riskErr.message } }
  }

  if (updates.schedule) {
    const { error: schedErr } = await supabase
      .from("schedule_rule")
      .update({
        schedule_type: updates.schedule.scheduleType,
        interval_days:
          updates.schedule.scheduleType === "every_n_days"
            ? (updates.schedule.intervalDays ?? 30)
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq("task_template_id", taskTemplateId)
    if (schedErr) return { data: null, error: { message: schedErr.message } }

    const newDue = computeDueDate(updates.schedule)
    await supabase
      .from("task_instance")
      .update({
        due_date: newDue,
        updated_at: new Date().toISOString(),
      })
      .eq("task_template_id", taskTemplateId)
      .in("status", ["scheduled", "snoozed"])
  }

  return { data: true, error: null }
}

export async function updateTaskNotes(
  taskTemplateId: string,
  notes: string | null
): Promise<ServiceResult<void>> {
  // task_template has no free-form `notes` column; the redesign's editable
  // "Notes" maps to the existing instructions_override field.
  const { error } = await supabase
    .from("task_template")
    .update({ instructions_override: notes, updated_at: new Date().toISOString() })
    .eq("task_template_id", taskTemplateId)

  if (error) return { data: null, error }
  return { data: undefined as unknown as void, error: null }
}
