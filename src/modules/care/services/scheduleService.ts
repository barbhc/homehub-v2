import { collection, doc, getDoc, serverTimestamp, writeBatch, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
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
/** The template's inlined `schedule` object → a v1-shaped ScheduleRule. */
function scheduleToRule(taskTemplateId: string, s: DocumentData | null | undefined): ScheduleRule | null {
  if (!s) return null
  return {
    schedule_rule_id: taskTemplateId,
    task_template_id: taskTemplateId,
    schedule_type: (s.scheduleType ?? "as_needed") as ScheduleType,
    interval_days: s.intervalDays ?? null,
    anchor_date: s.anchorDate ?? null,
    season: (s.season ?? null) as Season | null,
    window_days_before: s.windowDaysBefore ?? 7,
    window_days_after: s.windowDaysAfter ?? 14,
    created_at: "",
    updated_at: "",
    deleted_at: null,
  }
}

export async function getScheduleRulesByTemplate(
  homeId: string,
  taskTemplateId: string
): Promise<ServiceResult<ScheduleRule[]>> {
  try {
    const snap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
    if (!snap.exists() || snap.data().deletedAt != null) return { data: [], error: null }
    const rule = scheduleToRule(taskTemplateId, snap.data().schedule)
    return { data: rule ? [rule] : [], error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load schedule" } }
  }
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
  homeId: string,
  input: CreateScheduleRuleInput
): Promise<ServiceResult<ScheduleRule>> {
  try {
    // The schedule is inlined on the template — "creating a rule" sets that field.
    const schedule = {
      scheduleType: input.schedule_type,
      intervalDays: input.interval_days ?? null,
      anchorDate: input.anchor_date ?? todayStr(),
      season: input.season ?? null,
      windowDaysBefore: input.window_days_before ?? 7,
      windowDaysAfter: input.window_days_after ?? 14,
    }
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/taskTemplates/${input.task_template_id}`), { schedule, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: scheduleToRule(input.task_template_id, schedule) as ScheduleRule, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to create schedule" } }
  }
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

  try {
    const tplSnap = await getDoc(doc(db, `homes/${input.home_id}/taskTemplates/${input.task_template_id}`))
    if (!tplSnap.exists()) return { data: null, error: { message: "Task template not found" } }
    const tpl = tplSnap.data()
    if (!(tpl.isActive ?? true) || tpl.deletedAt != null) return { data: null, error: { message: "Task template not found" } }

    const rule = scheduleToRule(input.task_template_id, tpl.schedule)
    if (!rule) return { data: null, error: { message: "No schedule rules" } }

    const dueDate = resolveDueDate(rule, today)
    if (!dueDate || dueDate < today || dueDate > toDate) {
      // Non-recurring types (as_needed/after_each_use/setup) legitimately
      // produce no scheduled instance — success with count 0.
      return { data: { count: 0 }, error: null }
    }

    const windowStart = addDays(dueDate, -(rule.window_days_before ?? 7))
    const windowEnd = addDays(dueDate, rule.window_days_after ?? 14)
    const { priorityScore, isSafetyCritical } = computePriorityScore(
      tpl.priorityTier,
      tpl.riskLevel,
      dueDate,
      windowStart,
      windowEnd,
      tpl.estimatedMinutes ?? null
    )

    // Denormalize item/room for the instance display set (firestore-model.md §5).
    const iuId: string | null = input.item_unit_id ?? tpl.itemUnitId ?? null
    let itemName: string | null = null
    let roomName: string | null = null
    if (iuId) {
      const itemSnap = await getDoc(doc(db, `homes/${input.home_id}/items/${iuId}`))
      if (itemSnap.exists()) {
        itemName = itemSnap.data().displayName ?? null
        const roomId = itemSnap.data().roomId
        if (roomId) {
          const roomSnap = await getDoc(doc(db, `homes/${input.home_id}/rooms/${roomId}`))
          roomName = roomSnap.exists() ? (roomSnap.data().name ?? null) : null
        }
      }
    }

    const now = serverTimestamp()
    const ref = doc(collection(db, `homes/${input.home_id}/taskInstances`))
    await writeBatch(db)
      .set(ref, {
        taskTemplateId: input.task_template_id,
        itemUnitId: iuId,
        status: "scheduled",
        dueDate,
        windowStart,
        windowEnd,
        snoozedUntil: null,
        priorityScore,
        isSafetyCritical,
        completedAt: null,
        completionNotes: null,
        completionPhotos: [],
        assignedTo: null,
        title: tpl.title ?? "",
        priorityTier: tpl.priorityTier ?? "recommended",
        careType: tpl.careType ?? null,
        scopeType: tpl.scopeType ?? (iuId ? "item_unit" : "home"),
        estimatedMinutes: tpl.estimatedMinutes ?? null,
        scheduleType: rule.schedule_type,
        itemName,
        roomName,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    return { data: { count: 1 }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to generate instances" } }
  }
}
