import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { MaintenanceFreqUnit, PriorityTier, ScheduleType } from "@/integrations/types"
import {
  dueKindOf, dueWindow, isTrulyOverdue, safetyPhrase, windowPhrase,
  type DueKind, type WindowState,
} from "@/lib/dueWindow"
import { indicatorDrivenTitles, usagePhrase } from "../../../../shared/care/usageSignal"
import { seasonForTitle, seasonalWindow, type Climate } from "../../../../shared/care/seasonalWindow"
import { seasonalFamily } from "../../../../shared/tasks/houseRules"
import type { ServiceResult } from "./taskService"
import { createTaskTemplate } from "./taskService"
import { createScheduleRule, generateTaskInstances } from "./scheduleService"
import { taskSource, effortToMinutes, frequencyToSchedule, type TaskSource } from "./taskMapping"
import { isAgendaEligible } from "@/lib/agendaEligibility"

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
  /** Due semantics — see `src/lib/dueWindow.ts` and design/due-windows.md.
   *  Derived at read time; nothing here is stored. */
  dueKind: DueKind
  /** Where today sits relative to this task's window. */
  windowState: WindowState
  /** How to say when it wants doing: "Oct-ish", "Been a while", "By Sep 30". */
  duePhrase: string
  /** Firm, dateless pressure for safety work that skipped a cycle; else null. */
  safetyNote: string | null
  /** Only a real deadline, actually past, still earns red. */
  trulyOverdue: boolean
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
/**
 * How many scheduled tasks the agenda deliberately HIDES.
 *
 * Item-scoped cleaning lives in the Deep-Clean guide, not the task feed — a
 * curation decision, not a bug. But a tester with one air fryer whose whole
 * task set is cleaning saw "Nothing due — enjoy the calm" on Tasks while the
 * item page listed three jobs right there. The app contradicting itself is
 * worse than either answer alone, so the empty state needs this number to
 * explain where the work went.
 *
 * Only called WHEN THE AGENDA IS EMPTY, so the common path pays nothing.
 */
export async function countHiddenCleaning(homeId: string): Promise<number> {
  try {
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("deletedAt", "==", null))
    )
    return snap.docs.filter((d) => {
      const status = d.get("status")
      if (status !== "scheduled" && status !== "snoozed") return false
      return !isAgendaEligible({ careType: d.get("careType"), scopeType: d.get("scopeType") })
    }).length
  } catch {
    // The count only enriches copy; never let it break the empty state.
    return 0
  }
}

export async function getWeekAgenda(
  homeId: string,
  opts?: { days?: number }
): Promise<ServiceResult<WeekAgendaItem[]>> {
  const today = todayStr()
  const horizon = addDaysStr(today, opts?.days ?? 7)

  try {
    // Climate for seasonal windows. A single doc read, and a FAILED or absent
    // one degrades to null — a seasonal task must never be blocked or hidden
    // because the owner hasn't answered a profile question (the owner's own
    // home has no climate field today, so this is the common path).
    let climate: Climate | null = null
    try {
      const homeSnap = await getDoc(doc(db, `homes/${homeId}`))
      const c = homeSnap.get("climate")
      if (c === "mild" || c === "moderate" || c === "cold" || c === "hot") climate = c
    } catch {
      climate = null
    }

    // Single-collection read — the joins are gone: taskInstances carry the
    // denormalized display fields (firestore-model.md §5). One equality filter
    // (deletedAt == null); status/dueDate filtering + sort happen client-side
    // (the collection is small and this avoids a multi-inequality query the
    // emulator rejects). Composite index still declared for prod scale.
    const col = collection(db, `homes/${homeId}/taskInstances`)
    const snap = await getDocs(query(col, where("deletedAt", "==", null)))

    const all = snap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as { id: string } & Record<string, unknown>
    )

    // Which tasks the appliance itself signals (design/due-windows.md Phase 3).
    // Needs SIBLING context — an item's "Reset Filter Indicator" task is the
    // evidence that its filter work is indicator-driven — so it is computed
    // per item across the whole set, not per row.
    const titlesByItem = new Map<string, string[]>()
    for (const r of all) {
      const item = (r.itemUnitId as string | null) ?? ""
      if (!item) continue
      const list = titlesByItem.get(item) ?? []
      list.push((r.title as string) ?? "")
      titlesByItem.set(item, list)
    }
    const indicatorDriven = new Map<string, Set<string>>()
    for (const [item, titles] of titlesByItem) {
      const driven = indicatorDrivenTitles(titles)
      if (driven.size > 0) indicatorDriven.set(item, driven)
    }

    // Templates with at least one completed instance — distinguishes a lapsed
    // essential cadence (genuinely overdue) from a never-started one (calm backlog).
    const completedTemplates = new Set(
      all.filter((r) => r.status === "done").map((r) => r.taskTemplateId as string)
    )

    const items: WeekAgendaItem[] = all
      .filter((r) => r.status === "scheduled" || r.status === "snoozed")
      .filter((r) => (r.dueDate as string) <= horizon)
      .sort((a, b) => ((a.dueDate as string) ?? "").localeCompare((b.dueDate as string) ?? ""))
      // Curated feed, not a flatten of per-item cleaning steps: drop item-scoped
      // cleaning (lives in the Deep-Clean guide); keep maintenance + HOME cleaning.
      .filter((r) => isAgendaEligible({ careType: r.careType as string | null, scopeType: r.scopeType as string | null }))
      .map((r) => {
        const tier = (r.priorityTier as PriorityTier) ?? "optional"
        const dueDate = (r.dueDate as string) ?? today
        const templateId = (r.taskTemplateId as string) ?? ""
        const pastDue = dueDate < today
        const isOverdue = pastDue && tier === "essential" && completedTemplates.has(templateId)
        // Windows are DERIVED, never read from the stored windowStart/windowEnd
        // fields — those are v1 leftovers and badly stale (April windows on
        // August tasks). See design/due-windows.md.
        const scheduleType = (r.scheduleType as ScheduleType | null) ?? null
        const itemId = (r.itemUnitId as string | null) ?? ""
        const isUsage = !!itemId && (indicatorDriven.get(itemId)?.has((r.title as string) ?? "") ?? false)
        const dueKind: DueKind = isUsage
          ? "usage"
          : dueKindOf({ title: r.title as string, scheduleType, careType: r.careType as string | null })
        // The manual's stated range wins over the cadence default when present.
        const range = {
          intervalDaysMin: (r.intervalDaysMin as number | null) ?? null,
          intervalDaysMax: (r.intervalDaysMax as number | null) ?? null,
        }
        const windowState = dueWindow(dueDate, scheduleType, { today, ...range }).state
        // A usage task says what the unit will tell you, and keeps our cadence
        // only as the fallback — never a date.
        // A seasonal task states its season, resolved against the home's
        // climate when we have one — never a manufactured date.
        const season = dueKind === "seasonal"
          ? seasonForTitle((r.title as string) ?? "", seasonalFamily((r.title as string) ?? ""))
          : null
        const seasonal = season ? seasonalWindow(season, climate, { today }) : null
        const duePhrase = isUsage
          ? usagePhrase(scheduleType)
          : seasonal
            ? seasonal.phrase
            : windowPhrase(dueDate, scheduleType, { today, kind: dueKind, ...range })
        const safetyNote = (r.isSafetyCritical as boolean | undefined)
          ? safetyPhrase(dueDate, scheduleType, { today })
          : null
        return {
          taskInstanceId: r.id as string,
          taskTemplateId: templateId,
          title: (r.title as string) ?? "Task",
          source: taskSource((r.scopeType as "home" | "item_unit") ?? "item_unit", (r.careType as string) ?? null),
          priorityTier: tier,
          estimatedMinutes: (r.estimatedMinutes as number | null) ?? null,
          dueDate,
          isOverdue,
          pastDue,
          dueKind,
          windowState,
          duePhrase,
          safetyNote,
          trulyOverdue: isTrulyOverdue(dueDate, dueKind, { today }),
          itemUnitId: (r.itemUnitId as string | null) ?? null,
          itemName: (r.itemName as string | null) ?? null,
          roomName: (r.roomName as string | null) ?? null,
        }
      })

    return { data: items, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Request failed" } }
  }
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
    const ruleRes = await createScheduleRule(homeId, {
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
