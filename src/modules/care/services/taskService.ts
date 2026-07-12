import { supabase } from "@/integrations/shim/client"
import { doc, getDoc, serverTimestamp, writeBatch, Timestamp, type DocumentData } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"
import type {
  TaskTemplate,
  TaskInstance,
  PriorityTier,
  RiskLevel,
  TaskInstanceStatus,
  DiagramImageUrl,
  ScheduleType,
  Season,
} from "@/integrations/types"

// ── Firestore taskInstance doc (camelCase) → curated TaskInstance (snake_case) ──
function tiIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : null
}
function toTaskInstance(homeId: string, id: string, d: DocumentData): TaskInstance {
  return {
    task_instance_id: id,
    home_id: homeId,
    task_template_id: d.taskTemplateId ?? "",
    item_unit_id: d.itemUnitId ?? null,
    status: (d.status ?? "scheduled") as TaskInstanceStatus,
    due_date: d.dueDate ?? "",
    window_start: d.windowStart ?? null,
    window_end: d.windowEnd ?? null,
    snoozed_until: d.snoozedUntil ?? null,
    priority_score: d.priorityScore ?? 0,
    is_safety_critical: d.isSafetyCritical ?? false,
    completed_at: tiIso(d.completedAt),
    completion_notes: d.completionNotes ?? null,
    completion_photos: d.completionPhotos ?? [],
    assigned_to: d.assignedTo ?? null,
    created_at: tiIso(d.createdAt) ?? "",
    updated_at: tiIso(d.updatedAt) ?? "",
    deleted_at: tiIso(d.deletedAt),
  }
}

const completeTaskCallable = callable<
  { homeId: string; taskInstanceId: string; completedOn?: string; nextDueOverride?: string | null; completionNotes?: string | null },
  { completedInstanceId: string; nextInstanceId: string | null }
>("completeTask")

export type ServiceResult<T> =
  | { data: T; error: null }
  | { data: null; error: { message: string } }

// Priority scoring constants (from CHO spec)
const TIER_BASE: Record<PriorityTier, number> = {
  essential: 100,
  recommended: 60,
  optional: 30,
}
const RISK_BONUS: Record<RiskLevel, number> = {
  safety: 100,
  prevent_damage: 50,
  performance: 20,
  comfort: 10,
}
const DUENESS_OVERDUE = 60
const DUENESS_WITHIN_WINDOW = 30
const DUENESS_DUE_IN_14 = 15
const EFFORT_PENALTY = 20

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Computes priority_score and is_safety_critical for a task_instance.
 */
export function computePriorityScore(
  tier: PriorityTier,
  riskLevel: RiskLevel,
  dueDate: string,
  windowStart: string | null,
  windowEnd: string | null,
  estimatedMinutes: number | null
): { priorityScore: number; isSafetyCritical: boolean } {
  const tierBase = TIER_BASE[tier] ?? 60
  const riskBonus = RISK_BONUS[riskLevel] ?? 0
  const isSafetyCritical = riskLevel === "safety"

  let duenessBonus = 0
  const today = todayStr()
  if (dueDate < today) duenessBonus = DUENESS_OVERDUE
  else if (windowStart && windowEnd && today >= windowStart && today <= windowEnd)
    duenessBonus = DUENESS_WITHIN_WINDOW
  else {
    const due = new Date(dueDate + "T12:00:00").getTime()
    const in14 = new Date(today + "T12:00:00").getTime() + 14 * 24 * 60 * 60 * 1000
    if (due <= in14) duenessBonus = DUENESS_DUE_IN_14
  }

  let effortPenalty = 0
  const isHighEffort = estimatedMinutes != null && estimatedMinutes > 20
  if (tier === "optional" && isHighEffort) effortPenalty = EFFORT_PENALTY

  const priorityScore = Math.max(0, tierBase + riskBonus + duenessBonus - effortPenalty)
  return { priorityScore, isSafetyCritical }
}

export type CreateTaskTemplateInput = {
  home_id: string
  scope_type: "home" | "item_unit"
  item_unit_id?: string | null
  title: string
  description?: string | null
  care_type: "cleaning" | "maintenance" | "mixed"
  priority_tier: PriorityTier
  risk_level: RiskLevel
  estimated_minutes?: number | null
  instructions_chunk_id?: string | null
  instructions_override?: string | null
  supplies_mode?: "none" | "suggested" | "required"
  source: "manual" | "user" | "cho_generated"
}

export type UpdateTaskInstanceInput = {
  status?: TaskInstanceStatus
  completed_at?: string | null
  completion_notes?: string | null
  snoozed_until?: string | null
  /** Assignee user id, or null to unassign (Phase 3). Guarded to home_members by trigger. */
  assigned_to?: string | null
}

/**
 * Creates a task_template.
 */
export async function createTaskTemplate(
  input: CreateTaskTemplateInput
): Promise<ServiceResult<TaskTemplate>> {
  const { error, data } = await supabase
    .from("task_template")
    .insert({
      ...input,
      item_unit_id: input.item_unit_id ?? null,
      supplies_mode: input.supplies_mode ?? "none",
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as TaskTemplate, error: null }
}

/**
 * Fetches task_templates for a home.
 */
export async function getTaskTemplates(homeId: string): Promise<ServiceResult<TaskTemplate[]>> {
  const { error, data } = await supabase
    .from("task_template")
    .select("*")
    .eq("home_id", homeId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as TaskTemplate[], error: null }
}

/**
 * Fetches task_templates for a specific item_unit.
 */
export async function getTaskTemplatesByItem(
  homeId: string,
  itemUnitId: string
): Promise<ServiceResult<TaskTemplate[]>> {
  const { error, data } = await supabase
    .from("task_template")
    .select("*")
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as TaskTemplate[], error: null }
}

export type TaskSupplyEmbed = {
  quantity: string | null
  supply_item: { name: string; category: string; oem_part_number: string | null } | null
}
export type TaskTemplateWithSchedule = TaskTemplate & {
  schedule_rule?: { schedule_type: string; interval_days: number | null }[]
  /** Cited supplies for the "You'll need" chip row (Q5); empty/absent → self-hide. */
  task_template_supply?: TaskSupplyEmbed[]
}

/**
 * Fetches task_templates for an item_unit with schedule_rule info.
 */
export async function getTaskTemplatesWithSchedulesByItem(
  homeId: string,
  itemUnitId: string
): Promise<ServiceResult<TaskTemplateWithSchedule[]>> {
  const { error, data } = await supabase
    .from("task_template")
    .select("*, schedule_rule(schedule_type, interval_days), task_template_supply(quantity, supply_item(name, category, oem_part_number))")
    .eq("home_id", homeId)
    .eq("item_unit_id", itemUnitId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as TaskTemplateWithSchedule[], error: null }
}

/**
 * Updates the care_type of a task_template (e.g. reclassify maintenance ↔ cleaning).
 */
export async function updateTaskCareType(
  taskTemplateId: string,
  careType: "cleaning" | "maintenance"
): Promise<ServiceResult<true>> {
  const { error } = await supabase
    .from("task_template")
    .update({ care_type: careType, updated_at: new Date().toISOString() })
    .eq("task_template_id", taskTemplateId)
  if (error) return { data: null, error: { message: error.message } }
  return { data: true, error: null }
}

/**
 * Merges `diagram_image_urls` into task_template.metadata while preserving other keys.
 */
export async function updateTaskDiagramUrls(
  taskTemplateId: string,
  imageUrls: DiagramImageUrl[]
): Promise<ServiceResult<void>> {
  const { data: row, error: fetchErr } = await supabase
    .from("task_template")
    .select("metadata")
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)
    .single()

  if (fetchErr) return { data: null, error: { message: fetchErr.message } }

  const existingMeta =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}

  const nextMeta = {
    ...existingMeta,
    diagram_image_urls: imageUrls,
  }

  const { error: updateErr } = await supabase
    .from("task_template")
    .update({ metadata: nextMeta })
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)

  if (updateErr) return { data: null, error: { message: updateErr.message } }
  return { data: undefined, error: null }
}

/**
 * Updates the `diagram_pages` array inside task_template.metadata.
 * Used when a user corrects the manual page reference for a task.
 */
export async function updateTaskDiagramPages(
  taskTemplateId: string,
  diagramPages: Array<{ page: number; caption: string }>
): Promise<ServiceResult<void>> {
  const { data: row, error: fetchErr } = await supabase
    .from("task_template")
    .select("metadata")
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)
    .single()

  if (fetchErr) return { data: null, error: { message: fetchErr.message } }

  const existingMeta =
    row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {}

  const nextMeta = { ...existingMeta, diagram_pages: diagramPages }

  const { error: updateErr } = await supabase
    .from("task_template")
    .update({ metadata: nextMeta })
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)

  if (updateErr) return { data: null, error: { message: updateErr.message } }
  return { data: undefined, error: null }
}

export type TaskInstanceWithDetails = TaskInstance & {
  task_template?: { title: string; care_type: string; priority_tier: string } | null
  item_unit?: { display_name: string; room_id: string | null; room?: { name: string } | null } | null
}

/**
 * Fetches task_instances for a home with details (template, item, room). Includes optional filters.
 */
export async function getTaskInstances(
  homeId: string,
  filters?: {
    status?: TaskInstanceStatus[]
    room_id?: string
    item_unit_id?: string
    care_type?: string
    priority_tier?: PriorityTier
  }
): Promise<ServiceResult<TaskInstanceWithDetails[]>> {
  const { error, data } = await supabase
    .from("task_instance")
    .select(
      `
      *,
      task_template:task_template_id(title, care_type, priority_tier),
      item_unit:item_unit_id(display_name, room_id, room:room_id(name))
    `
    )
    .eq("home_id", homeId)
    .is("deleted_at", null)
    .order("priority_score", { ascending: false })
    .order("due_date", { ascending: true })

  if (error) return { data: null, error: { message: error.message } }
  let instances = (data ?? []) as TaskInstanceWithDetails[]

  if (filters?.status && filters.status.length > 0) {
    instances = instances.filter((i) => filters.status!.includes(i.status))
  }
  if (filters?.item_unit_id) {
    instances = instances.filter((i) => i.item_unit_id === filters!.item_unit_id)
  }
  if (filters?.room_id) {
    instances = instances.filter(
      (i) => (i.item_unit as { room_id?: string } | undefined)?.room_id === filters!.room_id
    )
  }
  if (filters?.care_type) {
    instances = instances.filter(
      (i) => (i.task_template as { care_type?: string } | undefined)?.care_type === filters!.care_type
    )
  }
  if (filters?.priority_tier) {
    instances = instances.filter(
      (i) =>
        (i.task_template as { priority_tier?: string } | undefined)?.priority_tier === filters!.priority_tier
    )
  }

  return { data: instances, error: null }
}

export type TaskDetail = {
  taskInstanceId: string
  taskTemplateId: string
  title: string
  tier: PriorityTier
  careType: string | null
  justification: string | null
  estimatedMinutes: number | null
  dueDate: string
  assignedTo: string | null
  notes: string | null
  /** Structured how-to steps from the `steps` column when present; null when the
   *  caller should fall back to parsing `notes`. */
  steps: string[] | null
  /** Cited supply names for the "You'll need" row; empty when none are linked. */
  supplies: string[]
  /** True when the template has never been completed — lets the full task view
   *  show "Start anytime" instead of an untrue "N days overdue" for a brand-new
   *  cadence, matching the Home surfaces. */
  neverCompleted: boolean
  /** Manual page this task's how-to was parsed from (metadata.diagram_pages or
   *  the instructions chunk's source_pages); null when there's no citation. */
  manualPage: number | null
  itemUnitId: string | null
  itemName: string | null
  roomName: string | null
  schedule: { scheduleType: ScheduleType; intervalDays: number | null; season: Season | null } | null
}

/**
 * Fetches everything the redesigned Task-detail screen needs for one instance:
 * the instance, its template (tier, why/justification, notes, minutes), the
 * most-recent schedule rule (for the recurrence strip + next-due preview), and
 * the item + room. Returns null when the instance isn't found.
 */
export async function getTaskDetail(
  homeId: string,
  taskInstanceId: string
): Promise<ServiceResult<TaskDetail | null>> {
  const { data, error } = await supabase
    .from("task_instance")
    .select(
      `
      task_instance_id, task_template_id, due_date, assigned_to, item_unit_id,
      task_template:task_template_id(
        title, priority_tier, care_type, justification, instructions_override, estimated_minutes, steps, metadata, source_page,
        schedule_rule(schedule_type, interval_days, season, created_at),
        task_template_supply(supply_item(name)),
        knowledge_chunk:instructions_chunk_id(source_pages)
      ),
      item_unit:item_unit_id(display_name, room:room_id(name))
    `
    )
    .eq("home_id", homeId)
    .eq("task_instance_id", taskInstanceId)
    .is("deleted_at", null)
    .maybeSingle()

  if (error) return { data: null, error: { message: error.message } }
  if (!data) return { data: null, error: null }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = data as any
  const tmpl = Array.isArray(r.task_template) ? r.task_template[0] : r.task_template
  const itemUnit = Array.isArray(r.item_unit) ? r.item_unit[0] : r.item_unit
  const room = itemUnit && (Array.isArray(itemUnit.room) ? itemUnit.room[0] : itemUnit.room)
  const rules = (tmpl?.schedule_rule ?? []) as Array<{ schedule_type: ScheduleType; interval_days: number | null; season: Season | null; created_at: string }>
  const rule = rules.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0]

  // Structured steps from the column; null tells the UI to parse `notes`.
  const rawSteps = Array.isArray(tmpl?.steps)
    ? (tmpl.steps as unknown[]).map((s) => String(s).trim()).filter(Boolean)
    : null
  const steps = rawSteps && rawSteps.length > 0 ? rawSteps : null

  // Cited supply names from the task_template_supply → supply_item join.
  const supplyRows = (tmpl?.task_template_supply ?? []) as Array<{ supply_item: { name: string } | { name: string }[] | null }>
  const supplies = supplyRows
    .map((s) => (Array.isArray(s.supply_item) ? s.supply_item[0]?.name : s.supply_item?.name))
    .map((n) => (n ?? "").trim())
    .filter(Boolean)

  // Has this cadence ever been completed? A never-completed past-due task is
  // "start anytime", not a lapse (mirrors the dashboard's calm framing).
  const { count: doneCount } = await supabase
    .from("task_instance")
    .select("task_instance_id", { count: "exact", head: true })
    .eq("home_id", homeId)
    .eq("task_template_id", r.task_template_id)
    .eq("status", "done")
  const neverCompleted = (doneCount ?? 0) === 0

  // Manual citation: prefer the task's diagram_pages, else the instructions
  // chunk's source_pages.
  const meta = (tmpl?.metadata ?? null) as { diagram_pages?: Array<{ page?: number }> } | null
  const chunk = Array.isArray(tmpl?.knowledge_chunk) ? tmpl.knowledge_chunk[0] : tmpl?.knowledge_chunk
  // Prefer the dedicated source_page column (populated by the parse pipeline);
  // fall back to a diagram page or the instructions chunk's source page.
  const manualPage =
    (typeof tmpl?.source_page === "number" ? tmpl.source_page : null) ??
    meta?.diagram_pages?.[0]?.page ??
    (chunk?.source_pages?.[0] ?? null)

  return {
    data: {
      taskInstanceId: r.task_instance_id,
      taskTemplateId: r.task_template_id,
      title: tmpl?.title ?? "Task",
      tier: tmpl?.priority_tier ?? "optional",
      careType: tmpl?.care_type ?? null,
      justification: tmpl?.justification ?? null,
      estimatedMinutes: tmpl?.estimated_minutes ?? null,
      dueDate: r.due_date,
      assignedTo: r.assigned_to ?? null,
      notes: tmpl?.instructions_override ?? null,
      steps,
      supplies,
      neverCompleted,
      manualPage,
      itemUnitId: r.item_unit_id ?? null,
      itemName: itemUnit?.display_name ?? null,
      roomName: room?.name ?? null,
      schedule: rule ? { scheduleType: rule.schedule_type, intervalDays: rule.interval_days, season: rule.season } : null,
    },
    error: null,
  }
}

/**
 * Updates a task_instance (e.g. mark done, snooze).
 */
export async function updateTaskInstance(
  homeId: string,
  taskInstanceId: string,
  input: UpdateTaskInstanceInput
): Promise<ServiceResult<TaskInstance>> {
  const updates = { ...input, updated_at: new Date().toISOString() }
  if (input.status === "done") {
    ;(updates as Record<string, unknown>).completed_at =
      (updates as Record<string, unknown>).completed_at ?? new Date().toISOString()
  }

  const { error, data } = await supabase
    .from("task_instance")
    .update(updates)
    .eq("home_id", homeId)
    .eq("task_instance_id", taskInstanceId)
    .is("deleted_at", null)
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as TaskInstance, error: null }
}

/**
 * Assigns a task occurrence to a home member, or unassigns it when
 * `assigneeUserId` is null. The DB trigger (`enforce_assignee_membership`)
 * rejects a non-member, surfaced here as a normal service error.
 */
export async function assignTaskInstance(
  homeId: string,
  taskInstanceId: string,
  assigneeUserId: string | null
): Promise<ServiceResult<TaskInstance>> {
  return updateTaskInstance(homeId, taskInstanceId, { assigned_to: assigneeUserId })
}

export type MarkDoneResult =
  | { success: true; data: TaskInstance }
  | { success: false; error: string }

/**
 * Marks a task_instance as done and generates the next occurrence for recurring
 * tasks (via the `complete_task_instance` RPC — see the Phase 1 migration).
 *
 * - `completedOn` (YYYY-MM-DD) is the confirmed completion date from the
 *   completion sheet; the next due date rolls forward from it. Defaults to today.
 * - `nextDueOverride` (YYYY-MM-DD) lets the sheet's ±-week adjust pin the next
 *   due date explicitly.
 *
 * Returns the new instance id (if one was created). Completion notes are written
 * in a follow-up update so the RPC stays focused on the recurrence transaction.
 */
export async function markTaskInstanceDone(
  homeId: string,
  taskInstanceId: string,
  completionNotes?: string | null,
  opts?: { completedOn?: string; nextDueOverride?: string | null }
): Promise<MarkDoneResult & { nextInstanceId?: string | null }> {
  // Firestore: the complete_task_instance RPC is now the completeTask callable
  // (Admin transaction — dup-suppression needs a query-in-transaction; model §9).
  let nextInstanceId: string | null = null
  try {
    const res = await completeTaskCallable({
      homeId,
      taskInstanceId,
      completedOn: opts?.completedOn ?? todayStr(),
      nextDueOverride: opts?.nextDueOverride ?? null,
      completionNotes: completionNotes ?? null,
    })
    nextInstanceId = res.nextInstanceId
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to complete task" }
  }

  const snap = await getDoc(doc(db, `homes/${homeId}/taskInstances/${taskInstanceId}`))
  if (!snap.exists()) return { success: false, error: "Task instance not found after completion" }
  return { success: true, data: toTaskInstance(homeId, snap.id, snap.data()), nextInstanceId }
}

export type DeleteTaskTemplateResult =
  | { success: true }
  | { success: false; error: string }

export type ArchiveTaskTemplateResult = DeleteTaskTemplateResult

/**
 * Deactivates a task_template and soft-deletes open instances (scheduled/snoozed).
 * Template row is kept for history; schedule_rule rows are unchanged.
 */
export async function archiveTaskTemplate(
  homeId: string,
  taskTemplateId: string
): Promise<ArchiveTaskTemplateResult> {
  const now = new Date().toISOString()

  const { error: instanceErr } = await supabase
    .from("task_instance")
    .update({ deleted_at: now, updated_at: now })
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)
    .in("status", ["scheduled", "snoozed"])
    .is("deleted_at", null)

  if (instanceErr) return { success: false, error: instanceErr.message }

  const { error: templateErr } = await supabase
    .from("task_template")
    .update({ is_active: false, updated_at: now })
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)
    .is("deleted_at", null)

  if (templateErr) return { success: false, error: templateErr.message }

  return { success: true }
}

/**
 * Soft-deletes a task_template and hard-deletes its task_instances and schedule_rules.
 */
export async function deleteTaskTemplate(
  homeId: string,
  taskTemplateId: string
): Promise<DeleteTaskTemplateResult> {
  // Hard-delete instances first (they have no deleted_at)
  const { error: instanceErr } = await supabase
    .from("task_instance")
    .delete()
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)

  if (instanceErr) return { success: false, error: instanceErr.message }

  // Hard-delete schedule_rules
  const { error: ruleErr } = await supabase
    .from("schedule_rule")
    .delete()
    .eq("task_template_id", taskTemplateId)

  if (ruleErr) return { success: false, error: ruleErr.message }

  // Soft-delete the template
  const { error: templateErr } = await supabase
    .from("task_template")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("home_id", homeId)
    .eq("task_template_id", taskTemplateId)

  if (templateErr) return { success: false, error: templateErr.message }

  return { success: true }
}

export interface CompletionHistoryEntry {
  instanceId: string
  taskTitle: string
  priorityTier: PriorityTier
  completedAt: string
  completionNotes: string | null
}

export interface TierChangeHistoryEntry {
  id: string
  taskTemplateId: string
  taskTitle: string
  oldTier: PriorityTier
  newTier: PriorityTier
  source: string
  changedAt: string
}

/**
 * Fetches tier change log entries for tasks belonging to a specific item.
 * Joins through task_template to scope by item_unit_id and pick up the title.
 */
export async function getTierChangeHistory(
  homeId: string,
  itemUnitId: string,
  limit?: number
): Promise<ServiceResult<TierChangeHistoryEntry[]>> {
  const { data, error } = await supabase
    .from("task_tier_change_log")
    .select(
      `
      id,
      task_template_id,
      old_tier,
      new_tier,
      source,
      created_at,
      task_template:task_template_id(title, item_unit_id)
    `
    )
    .eq("home_id", homeId)
    .order("created_at", { ascending: false })
    .limit(limit ?? 20)

  if (error) return { data: null, error: { message: error.message } }

  const entries: TierChangeHistoryEntry[] = []
  for (const row of data ?? []) {
    const tpl = row.task_template as unknown as {
      title: string
      item_unit_id: string | null
    } | null
    if (!tpl || tpl.item_unit_id !== itemUnitId) continue
    entries.push({
      id: row.id,
      taskTemplateId: row.task_template_id,
      taskTitle: tpl.title,
      oldTier: row.old_tier as PriorityTier,
      newTier: row.new_tier as PriorityTier,
      source: row.source ?? "manual",
      changedAt: row.created_at ?? "",
    })
  }

  return { data: entries, error: null }
}

/**
 * Fetches completed task instances for a specific item, ordered by most recent.
 * Joins through task_template to get title, tier, and scope to item.
 */
export async function getCompletionHistory(
  homeId: string,
  itemUnitId: string,
  limit?: number
): Promise<ServiceResult<CompletionHistoryEntry[]>> {
  const { error, data } = await supabase
    .from("task_instance")
    .select(
      `
      task_instance_id,
      completed_at,
      completion_notes,
      task_template:task_template_id(title, priority_tier, item_unit_id)
    `
    )
    .eq("home_id", homeId)
    .eq("status", "done")
    .is("deleted_at", null)
    .order("completed_at", { ascending: false })
    .limit(limit ?? 20)

  if (error) return { data: null, error: { message: error.message } }

  // Filter to entries whose task_template belongs to this item
  const entries: CompletionHistoryEntry[] = []
  for (const row of data ?? []) {
    const tpl = row.task_template as unknown as {
      title: string
      priority_tier: PriorityTier
      item_unit_id: string | null
    } | null
    if (!tpl || tpl.item_unit_id !== itemUnitId) continue
    entries.push({
      instanceId: row.task_instance_id,
      taskTitle: tpl.title,
      priorityTier: tpl.priority_tier,
      completedAt: row.completed_at ?? "",
      completionNotes: row.completion_notes ?? null,
    })
  }

  return { data: entries, error: null }
}

/**
 * Logs a task completion directly (creates a done task_instance).
 * Used when marking a task done from the item detail page with optional backdate.
 */
export async function logTaskCompletion(
  homeId: string,
  taskTemplateId: string,
  itemUnitId: string | null,
  completedAt: string,
  completionNotes?: string | null
): Promise<ServiceResult<TaskInstance>> {
  const { data, error } = await supabase
    .from("task_instance")
    .insert({
      home_id: homeId,
      task_template_id: taskTemplateId,
      item_unit_id: itemUnitId,
      status: "done" as TaskInstanceStatus,
      due_date: completedAt.slice(0, 10),
      priority_score: 0,
      is_safety_critical: false,
      completed_at: completedAt,
      completion_notes: completionNotes ?? null,
      completion_photos: [],
    })
    .select()
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as TaskInstance, error: null }
}

export type SnoozeResult =
  | { success: true; data: TaskInstance }
  | { success: false; error: string }

/**
 * Snoozes a task_instance until a date.
 */
export async function snoozeTaskInstance(
  homeId: string,
  taskInstanceId: string,
  snoozedUntil: string
): Promise<SnoozeResult> {
  // Direct Firestore field update (matches v1: status snoozed + snoozed_until).
  try {
    const ref = doc(db, `homes/${homeId}/taskInstances/${taskInstanceId}`)
    await writeBatch(db)
      .set(ref, { status: "snoozed", snoozedUntil, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    const snap = await getDoc(ref)
    if (!snap.exists()) return { success: false, error: "Task instance not found" }
    return { success: true, data: toTaskInstance(homeId, snap.id, snap.data()) }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to snooze task" }
  }
}
