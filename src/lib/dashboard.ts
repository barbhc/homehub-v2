/**
 * Dashboard data layer: tasks for "What needs my attention right now?"
 * CHO Data Model v1.1: uses task_instance, task_template, item_unit, room
 */

import { supabase } from "@/integrations/shim/client"
import type { TopConcernKey } from "@/modules/home/services/homeProfileService"
import type { CareType, RiskLevel } from "@/integrations/types"

/** Due-soon window: tasks due within this many days count as "urgent". */
export const DUE_SOON_DAYS = 7

/** Fallback when home context is unavailable. */
export const DASHBOARD_PROPERTY_ID = ""

export type TaskPriority = "low" | "medium" | "high" | "critical"
export type TaskEffort = "short" | "medium" | "long"

// ── Tier filtering ─────────────────────────────────────────────────────────

export type TierFilter = {
  essential: boolean
  recommended: boolean
  optional: boolean
}

export const DEFAULT_TIER_FILTER: TierFilter = {
  essential: true,
  recommended: false,
  optional: false,
}

/** Map TaskPriority back to tier name */
export function priorityToTier(p: TaskPriority): "essential" | "recommended" | "optional" {
  switch (p) {
    case "critical": return "essential"
    case "high": return "recommended"
    default: return "optional"
  }
}

export function filterTasksByTier<T extends { priority: TaskPriority }>(
  tasks: T[],
  filter: TierFilter
): T[] {
  return tasks.filter((t) => {
    const tier = priorityToTier(t.priority)
    return filter[tier]
  })
}

export interface DashboardTask {
  id: string
  name: string
  dueDate: string | null
  isOverdue: boolean
  isDueSoon: boolean
  itemName: string | null
  itemId: string | null
  priority: TaskPriority
  effort: TaskEffort | null
  daysOverdue: number | null
  daysUntilDue: number | null
  /**
   * True when this task's template has never been completed. A past-due,
   * never-completed cadence was never actually started, so it's "start
   * anytime", not a lapse — callers use this to avoid an alarming/untrue
   * "N days overdue" label on brand-new work.
   */
  neverCompleted: boolean
  urgencyLevel: "critical" | "overdue" | "due_today" | "due_soon" | "upcoming"
  /** Risk level from the task template — drives top_concerns concern boosts */
  riskLevel: RiskLevel | null
  /** Care type from the task template */
  careType: CareType | null
}

/** Habit schedule types — these route to Habits & Reminders, not the recurring task feed. */
export const HABIT_SCHEDULE_TYPES = new Set(["as_needed", "after_each_use"])

export interface DashboardStats {
  totalItems: number
  overdueTaskCount: number
  dueSoonCount: number
  completedThisMonth: number
}

export function computeHealthScore(stats: DashboardStats, essentialOverdueCount: number): number {
  const nonEssentialOverdue = Math.max(0, stats.overdueTaskCount - essentialOverdueCount)
  const essentialPenalty = Math.min(essentialOverdueCount * 15, 45)
  const softPenalty = Math.min(nonEssentialOverdue * 3, 15)
  const bonus = Math.min(stats.completedThisMonth * 2, 12)
  return Math.max(0, Math.min(100, 100 - essentialPenalty - softPenalty + bonus))
}

export type InsightCard = {
  id: string
  variant: "red" | "amber" | "blue" | "green"
  category: string
  title: string
  body: string
}

const SEASONAL_TITLE: Record<number, string> = {
  2: "Spring prep",
  3: "Spring prep",
  5: "Summer ready",
  6: "Summer ready",
  8: "Fall prep",
  9: "Fall prep",
  11: "Winter ready",
  0: "New year check",
}

/**
 * One seasonal suggestion. `match` is tested against each owned item's
 * `sub_type` + `display_name`; the suggestion only shows if a real item
 * matches — so a condo with no A/C never sees "test the A/C". A null `match`
 * means the tip is universal (applies to any home) and always shows.
 */
type SeasonalSuggestion = { months: number[]; match: RegExp | null; text: string }

const SEASONAL_SUGGESTIONS: SeasonalSuggestion[] = [
  { months: [2], match: /water.?heater|tankless/i, text: "Flush your water heater to clear sediment." },
  { months: [2, 3], match: /hvac|furnace|air.?condition|\ba\/?c\b|heat.?pump/i, text: "Replace the HVAC filter before cooling season." },
  { months: [3], match: /range.?hood|\bhood\b/i, text: "Clean the range hood mesh filter before pollen season." },
  { months: [5], match: /air.?condition|\ba\/?c\b|heat.?pump/i, text: "Test the A/C before the heat hits." },
  { months: [5, 6], match: /refrigerator|fridge/i, text: "Check refrigerator door seals and clean the coils." },
  { months: [6], match: /refrigerator|fridge|ice.?maker/i, text: "Check the ice-maker water line." },
  { months: [8], match: /hvac|furnace|heat.?pump/i, text: "Schedule a furnace tune-up before heating season." },
  { months: [9], match: /dryer/i, text: "Clean the dryer vent before heavier cool-weather use." },
  { months: [11], match: /water.?heater|furnace|hvac/i, text: "Insulate exposed pipes around your water heater and furnace." },
  // Universal — applies to any home regardless of inventory.
  { months: [11], match: null, text: "Test smoke and CO detectors before heating season." },
  { months: [0], match: null, text: "Review appliance warranties and book any overdue service." },
]

export async function getInsights(
  homeId: string,
  _expiringWarranties: ExpiringWarrantyItem[]
): Promise<InsightCard[]> {
  const cards: InsightCard[] = []

  // Warranty alerts now render in their own dedicated WarrantyAlertsCard —
  // see WarrantyAlertsCard in src/pages/Home.tsx. Keep this list to seasonal
  // tips and other general guidance so the two surfaces don't duplicate.

  const month = new Date().getMonth()
  const monthSuggestions = SEASONAL_SUGGESTIONS.filter((s) => s.months.includes(month))
  if (monthSuggestions.length === 0) return cards

  // Only fetch inventory if at least one suggestion is appliance-specific.
  // Appliance tips must match a real owned item; universal tips always pass.
  let ownedText: string[] = []
  if (monthSuggestions.some((s) => s.match !== null)) {
    const { data } = await supabase
      .from("item_unit")
      .select("sub_type, display_name")
      .eq("home_id", homeId)
      .is("deleted_at", null)
    ownedText = (data ?? []).map(
      (r: { sub_type: string | null; display_name: string | null }) =>
        `${r.sub_type ?? ""} ${r.display_name ?? ""}`
    )
  }

  const matched = monthSuggestions.filter(
    (s) => s.match === null || ownedText.some((t) => s.match!.test(t))
  )
  if (matched.length === 0) return cards

  cards.push({
    id: `seasonal-${month}`,
    variant: "amber",
    category: "Seasonal",
    title: SEASONAL_TITLE[month] ?? "Seasonal",
    body: matched.map((s) => s.text).join(" "),
  })

  return cards
}

export interface DashboardTasksResult {
  overdue: DashboardTask[]
  overdueEssential: DashboardTask[]
  overdueRecommended: DashboardTask[]
  dueSoon: DashboardTask[]
  nextDueDate: string | null
  isMock: boolean
  /** @deprecated Use overdue + dueSoon. Kept for backward compat. */
  needsAttention: DashboardTask[]
  suggested: DashboardTask[]
}

/** Map CHO priority_tier → TaskPriority for backward compat */
function tierToPriority(tier: string | null | undefined): TaskPriority {
  switch (tier) {
    case "essential":
      return "critical"
    case "recommended":
      return "high"
    case "optional":
      return "medium"
    default:
      return "medium"
  }
}

const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString().slice(0, 10)
}

const addDays = (dateStr: string, days: number): string => {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const dA = new Date(a)
  const dB = new Date(b)
  return Math.round((dB.getTime() - dA.getTime()) / (24 * 60 * 60 * 1000))
}

function computeUrgency(dueDate: string | null, todayStr: string): DashboardTask["urgencyLevel"] {
  if (!dueDate) return "upcoming"
  const days = daysBetween(todayStr, dueDate)
  if (days < -14) return "critical"
  if (days < 0) return "overdue"
  if (days === 0) return "due_today"
  if (days <= 7) return "due_soon"
  return "upcoming"
}

type TaskInstanceRow = {
  task_instance_id: string
  task_template_id: string
  due_date: string
  task_template: { title: string; priority_tier: string; risk_level: RiskLevel | null; care_type: CareType | null } | null
  item_unit: { display_name: string; item_unit_id: string; room?: { name: string } } | null
}

function toDashboardTask(
  row: TaskInstanceRow,
  todayStr: string,
  completedTemplateIds?: Set<string>,
): DashboardTask {
  const due = row.due_date
  const priority = tierToPriority(row.task_template?.priority_tier)
  const itemName = row.item_unit?.display_name ?? null
  const itemId = row.item_unit?.item_unit_id ?? null
  const daysOverdue = due < todayStr ? daysBetween(due, todayStr) : null
  const daysUntilDue = due >= todayStr ? daysBetween(todayStr, due) : null
  const isOverdue = due < todayStr
  const dueSoonEnd = addDays(todayStr, DUE_SOON_DAYS)
  const isDueSoon = due >= todayStr && due <= dueSoonEnd

  return {
    id: row.task_instance_id,
    name: row.task_template?.title ?? "Task",
    dueDate: due,
    isOverdue,
    isDueSoon,
    itemName,
    itemId,
    priority,
    effort: null,
    daysOverdue,
    daysUntilDue,
    neverCompleted: completedTemplateIds ? !completedTemplateIds.has(row.task_template_id) : false,
    urgencyLevel: computeUrgency(due, todayStr),
    riskLevel: row.task_template?.risk_level ?? null,
    careType: row.task_template?.care_type ?? null,
  }
}

/**
 * Returns a staleness-equivalent boost (in days) for a task based on the
 * user's top_concerns from their home profile.  The boost inflates the
 * effective staleness so concern-matched tasks sort to the top of the
 * "suggested" list without affecting overdue / due-soon ordering.
 *
 * Boost hierarchy (additive):
 *  surprise_repairs  → safety | prevent_damage  → +30 000 days
 *  saving_money      → prevent_damage | perf.   → +20 000 days
 *  seasonal_maint.   → maintenance care_type    → +15 000 days
 */
function computeConcernBoost(
  riskLevel: RiskLevel | null,
  careType: CareType | null,
  topConcerns: TopConcernKey[],
): number {
  if (!topConcerns.length) return 0
  let boost = 0
  if (
    topConcerns.includes("surprise_repairs") &&
    (riskLevel === "safety" || riskLevel === "prevent_damage")
  ) {
    boost += 30000
  }
  if (
    topConcerns.includes("saving_money") &&
    (riskLevel === "prevent_damage" || riskLevel === "performance")
  ) {
    boost += 20000
  }
  if (topConcerns.includes("seasonal_maintenance") && careType === "maintenance") {
    boost += 15000
  }
  return boost
}

export async function getDashboardTasks(
  propertyId: string,
  /**
   * User's top_concerns from home_profile.  When provided, the "suggested"
   * list is reordered so concern-matched tasks (e.g. safety tasks for a
   * surprise_repairs user) float to the top.
   */
  topConcerns: TopConcernKey[] = [],
): Promise<DashboardTasksResult> {
  const todayStr = today()

  // Fetch scheduled tasks + snoozed tasks whose snooze has expired
  const { data: instances, error } = await supabase
    .from("task_instance")
    .select(`
      task_instance_id,
      task_template_id,
      due_date,
      task_template:task_template_id(title, priority_tier, risk_level, care_type),
      item_unit:item_unit_id(display_name, item_unit_id, room:room_id(name))
    `)
    .eq("home_id", propertyId)
    .eq("status", "scheduled")
    .is("deleted_at", null)
    .order("priority_score", { ascending: false })
    .order("due_date", { ascending: true })

  if (error) throw new Error(`Failed to load tasks: ${error.message}`)

  const rows = (instances ?? []) as unknown as TaskInstanceRow[]

  // Completed-instance history per template, fetched up front: it drives both
  // the "never started" calm-framing flag on every task and the staleness
  // ranking for the suggested list below.
  const { data: doneData } = await supabase
    .from("task_instance")
    .select("task_template_id, completed_at")
    .eq("home_id", propertyId)
    .eq("status", "done")
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })

  const lastByTemplate = new Map<string, string>()
  const completedTemplateIds = new Set<string>()
  for (const row of (doneData ?? []) as Array<{ task_template_id: string; completed_at: string }>) {
    completedTemplateIds.add(row.task_template_id)
    if (!lastByTemplate.has(row.task_template_id)) {
      lastByTemplate.set(row.task_template_id, row.completed_at.slice(0, 10))
    }
  }

  const all = rows.map((r) => toDashboardTask(r, todayStr, completedTemplateIds))

  // Cleaning tasks route to the Deep Clean surface — exclude from the
  // task feed (overdue count, needs-attention, due-soon). They are NOT
  // deadlines in the same sense as maintenance tasks.
  const maintenanceAll = all.filter((t) => t.careType !== "cleaning")

  const tierOrder: Record<TaskPriority, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }
  // Only Essential (critical) tasks carry a hard overdue deadline.
  // Recommended / Optional past-due tasks are "suggested" — they have a
  // cadence, not a deadline, so they never trigger the red overdue state.
  const overdue = maintenanceAll
    .filter((t) => t.isOverdue && t.priority === "critical")
    .sort((a, b) => {
      const tDiff = (tierOrder[a.priority] ?? 3) - (tierOrder[b.priority] ?? 3)
      if (tDiff !== 0) return tDiff
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
    })
  const dueSoon = maintenanceAll
    .filter((t) => t.isDueSoon && !t.isOverdue)
    .sort((a, b) => {
      const tDiff = (tierOrder[a.priority] ?? 3) - (tierOrder[b.priority] ?? 3)
      if (tDiff !== 0) return tDiff
      return (a.dueDate ?? "").localeCompare(b.dueDate ?? "")
    })
  const overdueEssential = overdue.filter((t) => t.priority === "critical")
  const overdueRecommended = overdue.filter((t) => t.priority !== "critical")
  const needsAttention = [...overdue, ...dueSoon]

  const mustDoCandidates = maintenanceAll.filter((t) => t.priority === "critical" || t.priority === "high")
  const suggestedCandidates = maintenanceAll
    .filter((t) => !needsAttention.some((n) => n.id === t.id))
    .map((t) => {
      const row = rows.find((r) => r.task_instance_id === t.id)
      const templateId = row?.task_template_id ?? ""
      const lastCompleted = lastByTemplate.get(templateId) ?? null
      const stalenessDays = lastCompleted ? daysBetween(lastCompleted, todayStr) : 99999
      const concernBoost = computeConcernBoost(t.riskLevel, t.careType, topConcerns)
      return { task: t, effectiveStaleness: stalenessDays + concernBoost }
    })
    .sort((a, b) => b.effectiveStaleness - a.effectiveStaleness)
    .slice(0, 5)
    .map((x) => x.task)

  const nextDueDate = needsAttention.length > 0 ? null : (mustDoCandidates.find((t) => t.dueDate)?.dueDate ?? null)

  return {
    overdue,
    overdueEssential,
    overdueRecommended,
    dueSoon,
    needsAttention,
    suggested: suggestedCandidates,
    nextDueDate,
    isMock: all.length === 0,
  }
}

export async function fetchDashboardTasks(
  propertyId: string | null,
  topConcerns: TopConcernKey[] = [],
): Promise<DashboardTasksResult | null> {
  if (!propertyId) return null
  return getDashboardTasks(propertyId, topConcerns)
}

export async function getDashboardStats(propertyId: string): Promise<DashboardStats> {
  const todayStr = today()
  const dueSoonEnd = addDays(todayStr, DUE_SOON_DAYS)
  const monthStart = todayStr.slice(0, 7) + "-01"

  const [itemsRes, instancesRes, completedRes] = await Promise.all([
    supabase
      .from("item_unit")
      .select("item_unit_id", { count: "exact", head: true })
      .eq("home_id", propertyId)
      .eq("status", "active")
      .is("deleted_at", null),
    supabase
      .from("task_instance")
      .select("task_instance_id, due_date, task_template:task_template_id(care_type, priority_tier)")
      .eq("home_id", propertyId)
      .eq("status", "scheduled")
      .is("deleted_at", null),
    supabase
      .from("task_instance")
      .select("task_instance_id", { count: "exact", head: true })
      .eq("home_id", propertyId)
      .eq("status", "done")
      .gte("completed_at", monthStart)
      .is("deleted_at", null),
  ])

  const totalItems = itemsRes.count ?? 0
  const completedThisMonth = completedRes.count ?? 0

  let overdueTaskCount = 0
  let dueSoonCount = 0
  for (const row of (instancesRes.data ?? []) as unknown as Array<{
    due_date: string
    task_template: { care_type: string | null; priority_tier: string | null } | { care_type: string | null; priority_tier: string | null }[] | null
  }>) {
    const d = row.due_date
    if (!d) continue
    // Supabase may return the FK join as an object or single-element array depending on version
    const tmpl = Array.isArray(row.task_template) ? row.task_template[0] : row.task_template
    // Exclude cleaning tasks — they route to Deep Clean, not the task feed
    if (tmpl?.care_type === "cleaning") continue
    // Only Essential tasks carry a hard overdue deadline — count them in the stat chip.
    // Recommended / Optional past-due tasks are cadence suggestions, not deadlines.
    if (d < todayStr) {
      if (tmpl?.priority_tier === "essential") overdueTaskCount++
    } else if (d <= dueSoonEnd) {
      dueSoonCount++
    }
  }

  return { totalItems, overdueTaskCount, dueSoonCount, completedThisMonth }
}

export interface MaintenanceTaskFull {
  id: string
  title: string
  description: string | null
  task_template_id: string
  notes: string | null
  next_due_date: string | null
  is_recurring: boolean
  frequency_value: number | null
  frequency_unit: string | null
  item_id: string | null
  itemName: string | null
  locationId: string | null
  locationName: string | null
  priority: TaskPriority
  effort: TaskEffort | null
  isOverdue: boolean
  isDueSoon: boolean
  /** ISO date string of the most recent completion, or null if never completed */
  lastCompletedAt: string | null
  /** Total number of times this task template has been completed */
  completionCount: number
  /** Whether this is a cleaning or maintenance task — used for routing */
  careType: CareType | null
}

type TaskInstanceFull = {
  task_instance_id: string
  task_template_id: string
  due_date: string
  item_unit_id: string | null
  task_template: { title: string; priority_tier: string; notes: string | null; care_type: CareType | null } | null
  item_unit: { display_name: string; room_id: string | null; room?: { name: string } | null } | null
}

function toMaintenanceTaskFull(
  row: TaskInstanceFull,
  todayStr: string,
  lastCompletedAt: string | null = null,
  completionCount = 0,
): MaintenanceTaskFull {
  const tier = row.task_template?.priority_tier
  const priority = tierToPriority(tier)
  const due = row.due_date
  const dueSoonEnd = addDays(todayStr, DUE_SOON_DAYS)
  const itemUnit = row.item_unit
  const locationId = itemUnit?.room_id ?? null
  const locationName = itemUnit?.room?.name ?? null

  return {
    id: row.task_instance_id,
    title: row.task_template?.title ?? "Task",
    description: null,
    task_template_id: row.task_template_id,
    notes: row.task_template?.notes ?? null,
    next_due_date: due,
    is_recurring: false,
    frequency_value: null,
    frequency_unit: null,
    item_id: row.item_unit_id,
    itemName: itemUnit?.display_name ?? null,
    locationId,
    locationName,
    priority,
    effort: null,
    isOverdue: due < todayStr,
    isDueSoon: due >= todayStr && due <= dueSoonEnd,
    lastCompletedAt,
    completionCount,
    careType: row.task_template?.care_type ?? null,
  }
}

export async function getUpcomingTasks(propertyId: string): Promise<MaintenanceTaskFull[]> {
  const todayStr = today()
  const in30Days = addDays(todayStr, 30)

  const { data, error } = await supabase
    .from("task_instance")
    .select(`
      task_instance_id,
      task_template_id,
      due_date,
      item_unit_id,
      task_template:task_template_id(title, priority_tier, notes, care_type),
      item_unit:item_unit_id(display_name, room_id, room:room_id(name))
    `)
    .eq("home_id", propertyId)
    .eq("status", "scheduled")
    .gte("due_date", todayStr)
    .lte("due_date", in30Days)
    .is("deleted_at", null)
    .order("due_date", { ascending: true })

  if (error) throw new Error(`Failed to load upcoming tasks: ${error.message}`)

  return ((data ?? []) as unknown as TaskInstanceFull[]).map((r) => toMaintenanceTaskFull(r, todayStr, null, 0))
}

export async function getAllMaintenanceTasks(propertyId: string): Promise<MaintenanceTaskFull[]> {
  const todayStr = today()

  const [scheduledRes, completionRes] = await Promise.all([
    supabase
      .from("task_instance")
      .select(`
        task_instance_id,
        task_template_id,
        due_date,
        item_unit_id,
        task_template:task_template_id(title, priority_tier, notes, care_type),
        item_unit:item_unit_id(display_name, room_id, room:room_id(name))
      `)
      .eq("home_id", propertyId)
      .in("status", ["scheduled", "snoozed"])
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("task_instance")
      .select("task_template_id, completed_at")
      .eq("home_id", propertyId)
      .eq("status", "done")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false }),
  ])

  if (scheduledRes.error) throw new Error(`Failed to load tasks: ${scheduledRes.error.message}`)

  // Build per-template completion map: templateId → { lastDate, count }
  type CompletionEntry = { lastDate: string; count: number }
  const completionMap = new Map<string, CompletionEntry>()
  for (const row of (completionRes.data ?? []) as Array<{ task_template_id: string; completed_at: string }>) {
    const existing = completionMap.get(row.task_template_id)
    if (!existing) {
      completionMap.set(row.task_template_id, { lastDate: row.completed_at.slice(0, 10), count: 1 })
    } else {
      existing.count++
    }
  }

  return ((scheduledRes.data ?? []) as unknown as TaskInstanceFull[]).map((r) => {
    const completion = completionMap.get(r.task_template_id)
    return toMaintenanceTaskFull(r, todayStr, completion?.lastDate ?? null, completion?.count ?? 0)
  })
}

/** Warranty items expiring within 60 days, ordered soonest first. */
export type ExpiringWarrantyItem = {
  item_unit_id: string
  display_name: string
  warranty_expiry_date: string
  days_remaining: number
}

/** Upcoming window (days) for warranty expiration alerts shown on the dashboard. */
export const WARRANTY_UPCOMING_DAYS = 90

export async function getExpiringWarranties(homeId: string): Promise<ExpiringWarrantyItem[]> {
  const todayStr = today()
  const cutoffEnd = addDays(todayStr, WARRANTY_UPCOMING_DAYS)

  const { data, error } = await supabase
    .from("item_unit")
    .select("item_unit_id, display_name, warranty_expiry_date")
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .not("warranty_expiry_date", "is", null)
    .gte("warranty_expiry_date", todayStr)
    .lte("warranty_expiry_date", cutoffEnd)
    .order("warranty_expiry_date", { ascending: true })

  if (error) throw new Error(`Failed to load expiring warranties: ${error.message}`)

  return ((data ?? []) as Array<{ item_unit_id: string; display_name: string; warranty_expiry_date: string }>).map(
    (row) => ({
      item_unit_id: row.item_unit_id,
      display_name: row.display_name,
      warranty_expiry_date: row.warranty_expiry_date,
      days_remaining: (() => {
        const [y, m, d] = row.warranty_expiry_date.split("-").map(Number)
        return Math.ceil((new Date(y, m - 1, d).getTime() - Date.now()) / 86400000)
      })(),
    })
  )
}

/**
 * "Good to know" rail data — real `item_unit` rows. Two calm, non-alarmist
 * surfaces for the desktop Home:
 *   · recalls  — items where `recall_status = 'found'` (safety notices)
 *   · missing  — items lacking the purchase/warranty details that would let
 *                Homehub track coverage + catch recalls (drives AddDetailsNudge)
 */
export interface RecallNotice {
  item_unit_id: string
  display_name: string
  recall_notes: string | null
}
export interface ItemMissingDetails {
  item_unit_id: string
  display_name: string
}
export interface HomeNotices {
  recalls: RecallNotice[]
  missingDetails: ItemMissingDetails[]
}

export async function getHomeNotices(homeId: string): Promise<HomeNotices> {
  const { data, error } = await supabase
    .from("item_unit")
    .select(
      "item_unit_id, display_name, recall_status, recall_notes, purchase_date, warranty_expiry_date, warranty_duration_months"
    )
    .eq("home_id", homeId)
    .is("deleted_at", null)

  if (error) throw new Error(`Failed to load home notices: ${error.message}`)

  type Row = {
    item_unit_id: string
    display_name: string | null
    recall_status: string | null
    recall_notes: string | null
    purchase_date: string | null
    warranty_expiry_date: string | null
    warranty_duration_months: number | null
  }
  const rows = (data ?? []) as Row[]

  const recalls: RecallNotice[] = rows
    .filter((r) => r.recall_status === "found")
    .map((r) => ({
      item_unit_id: r.item_unit_id,
      display_name: r.display_name ?? "Item",
      recall_notes: r.recall_notes,
    }))

  // Missing purchase details = no purchase date AND no warranty info on file.
  // These are the items that can't yet power warranty tracking / recall checks.
  const missingDetails: ItemMissingDetails[] = rows
    .filter(
      (r) =>
        !r.purchase_date &&
        !r.warranty_expiry_date &&
        r.warranty_duration_months == null
    )
    .map((r) => ({ item_unit_id: r.item_unit_id, display_name: r.display_name ?? "Item" }))

  return { recalls, missingDetails }
}

/** Returns item_unit_ids that have at least one task (instance or template). */
export async function getItemIdsWithTasks(homeId: string): Promise<Set<string>> {
  const ids = new Set<string>()

  const [instancesRes, templatesRes] = await Promise.all([
    supabase
      .from("task_instance")
      .select("item_unit_id")
      .eq("home_id", homeId)
      .in("status", ["scheduled", "snoozed"])
      .is("deleted_at", null)
      .not("item_unit_id", "is", null),
    supabase
      .from("task_template")
      .select("item_unit_id")
      .eq("home_id", homeId)
      .eq("scope_type", "item_unit")
      .eq("is_active", true)
      .is("deleted_at", null)
      .not("item_unit_id", "is", null),
  ])

  for (const row of (instancesRes.data ?? []) as Array<{ item_unit_id: string }>) {
    if (row.item_unit_id) ids.add(row.item_unit_id)
  }
  for (const row of (templatesRes.data ?? []) as Array<{ item_unit_id: string }>) {
    if (row.item_unit_id) ids.add(row.item_unit_id)
  }
  return ids
}
