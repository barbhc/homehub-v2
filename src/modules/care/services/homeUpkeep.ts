import { collection, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
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

  try {
    // Instances carry the denorm display fields; season/intervalDays live on the
    // template's inlined schedule, so read templates once into a lookup.
    const [instSnap, tplSnap] = await Promise.all([
      getDocs(query(collection(db, `homes/${homeId}/taskInstances`), where("deletedAt", "==", null))),
      getDocs(query(collection(db, `homes/${homeId}/taskTemplates`), where("deletedAt", "==", null))),
    ])
    const scheduleByTpl = new Map<string, { season: Season | null; intervalDays: number | null }>()
    for (const d of tplSnap.docs) {
      const sched = (d.get("schedule") as { season?: Season | null; intervalDays?: number | null } | undefined) ?? {}
      scheduleByTpl.set(d.id, { season: sched.season ?? null, intervalDays: sched.intervalDays ?? null })
    }

    const items: HomeUpkeepItem[] = instSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as { id: string } & Record<string, unknown>)
      // Whole-home recurring jobs only: home-scoped + no item.
      .filter((r) => (r.status === "scheduled" || r.status === "snoozed") && r.itemUnitId == null && r.scopeType === "home")
      .sort((a, b) => ((a.dueDate as string) ?? "").localeCompare((b.dueDate as string) ?? ""))
      .map((r) => {
        const sched = scheduleByTpl.get(r.taskTemplateId as string) ?? { season: null, intervalDays: null }
        const dueDate = (r.dueDate as string) ?? today
        return {
          taskInstanceId: r.id,
          taskTemplateId: (r.taskTemplateId as string) ?? "",
          title: (r.title as string) ?? "Task",
          dueDate,
          isOverdue: dueDate < today,
          priorityTier: (r.priorityTier as PriorityTier) ?? "optional",
          scheduleType: (r.scheduleType as ScheduleType) ?? "monthly",
          season: sched.season,
          intervalDays: sched.intervalDays,
          careType: (r.careType as string | null) ?? null,
          estimatedMinutes: (r.estimatedMinutes as number | null) ?? null,
        }
      })

    return { data: items, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
  }
}
