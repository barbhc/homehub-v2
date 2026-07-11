import { supabase } from "@/integrations/shim/client"
import type { PriorityTier, ScheduleType, Season } from "@/integrations/types"
import type { ServiceResult } from "./taskService"

/**
 * Home-upkeep read model — the live source for the desktop Home "Home upkeep"
 * list (DesktopHomeUpkeep) and any other surface that needs whole-home recurring
 * jobs (test the smoke alarms, service the furnace, quarterly pest control, …).
 *
 * Unlike `getWeekAgenda` (which spans appliance + home + cleaning, due-windowed)
 * this is scoped specifically to HOME-level recurring tasks: task_instance
 * joined to task_template where scope_type='home' AND item_unit_id is null, with
 * the schedule_rule joined so the UI can render a cadence label and the
 * "Seasonal" tag. Mirrors the shape/style of getWeekAgenda / getTaskDetail.
 */

export type HomeUpkeepItem = {
  taskInstanceId: string
  taskTemplateId: string
  title: string
  dueDate: string
  isOverdue: boolean
  priorityTier: PriorityTier
  scheduleType: ScheduleType
  season: Season | null
  intervalDays: number | null
  careType: string | null
  estimatedMinutes: number | null
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Returns scheduled/snoozed HOME-scoped recurring task instances (item_unit_id
 * null), soonest-due first. Each row carries its cadence (scheduleType / season
 * / intervalDays) so the caller can render "Weekly", "Every 3 months", "Each
 * fall", etc. and flag seasonal tasks.
 */
export async function getHomeUpkeep(
  homeId: string
): Promise<ServiceResult<HomeUpkeepItem[]>> {
  const today = todayStr()

  const { data, error } = await supabase
    .from("task_instance")
    .select(
      `
      task_instance_id,
      task_template_id,
      due_date,
      item_unit_id,
      task_template:task_template_id!inner(
        title,
        scope_type,
        item_unit_id,
        care_type,
        priority_tier,
        estimated_minutes,
        schedule_rule(schedule_type, season, interval_days)
      )
    `
    )
    .eq("home_id", homeId)
    .is("item_unit_id", null)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)
    .order("due_date", { ascending: true })

  if (error) return { data: null, error: { message: error.message } }

  type ScheduleRuleRow = {
    schedule_type: ScheduleType
    season: Season | null
    interval_days: number | null
  }
  type Row = {
    task_instance_id: string
    task_template_id: string
    due_date: string
    item_unit_id: string | null
    task_template: {
      title: string
      scope_type: "home" | "item_unit"
      item_unit_id: string | null
      care_type: string | null
      priority_tier: PriorityTier
      estimated_minutes: number | null
      schedule_rule: ScheduleRuleRow[] | ScheduleRuleRow | null
    } | null
  }

  const items: HomeUpkeepItem[] = ((data ?? []) as unknown as Row[])
    // Belt-and-braces: enforce home scope + null item even though the query
    // already filters item_unit_id. (The instance and template item_unit_id can
    // diverge in malformed data; we want truly whole-home jobs only.)
    .filter(
      (r) =>
        r.task_template?.scope_type === "home" &&
        r.task_template?.item_unit_id == null
    )
    .map((r) => {
      const ruleRaw = r.task_template?.schedule_rule
      const rule = Array.isArray(ruleRaw) ? ruleRaw[0] : ruleRaw
      return {
        taskInstanceId: r.task_instance_id,
        taskTemplateId: r.task_template_id,
        title: r.task_template?.title ?? "Task",
        dueDate: r.due_date,
        isOverdue: r.due_date < today,
        priorityTier: r.task_template?.priority_tier ?? "optional",
        scheduleType: rule?.schedule_type ?? "monthly",
        season: rule?.season ?? null,
        intervalDays: rule?.interval_days ?? null,
        careType: r.task_template?.care_type ?? null,
        estimatedMinutes: r.task_template?.estimated_minutes ?? null,
      }
    })

  return { data: items, error: null }
}
