import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, where, writeBatch, Timestamp, type DocumentData } from "firebase/firestore"
import { db, callable } from "@/integrations/firebase"
import { track } from "@/lib/analytics"
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

// ── Firestore taskTemplate doc (camelCase) → curated TaskTemplate (snake_case) ──
// Schedule + supplies are inlined on the template (firestore-model.md §1).
function toTaskTemplate(homeId: string, id: string, d: DocumentData): TaskTemplate {
  return {
    task_template_id: id,
    home_id: homeId,
    room_id: d.roomId ?? null,
    scope_type: (d.scopeType ?? "item_unit") as TaskTemplate["scope_type"],
    item_unit_id: d.itemUnitId ?? null,
    title: d.title ?? "",
    description: d.description ?? null,
    care_type: (d.careType ?? "maintenance") as TaskTemplate["care_type"],
    care_type_overridden_at: tiIso(d.careTypeOverriddenAt),
    justification: d.justification ?? null,
    symptom_tags: Array.isArray(d.symptomTags) ? d.symptomTags : [],
    re_check_triggers: d.reCheckTriggers ?? [],
    priority_tier: (d.priorityTier ?? "recommended") as PriorityTier,
    risk_level: (d.riskLevel ?? "comfort") as RiskLevel,
    estimated_minutes: d.estimatedMinutes ?? null,
    default_assignee: d.defaultAssignee ?? null,
    instructions_chunk_id: d.instructionsChunkId ?? null,
    instructions_override: d.instructionsOverride ?? null,
    steps: Array.isArray(d.steps) ? d.steps : (d.steps ?? null),
    source_page: typeof d.sourcePage === "number" ? d.sourcePage : null,
    supplies_mode: (d.suppliesMode ?? "none") as TaskTemplate["supplies_mode"],
    source: (d.source ?? "manual") as TaskTemplate["source"],
    is_user_editable: d.isUserEditable ?? true,
    user_modified_at: tiIso(d.userModifiedAt),
    is_active: d.isActive ?? true,
    metadata: d.metadata ?? {},
    section_category: d.sectionCategory ?? null,
    applies_to: Array.isArray(d.appliesTo) ? d.appliesTo : [],
    external_key: d.externalKey ?? null,
    manual_id: d.manualId ?? null,
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
  try {
    const ref = doc(collection(db, `homes/${input.home_id}/taskTemplates`))
    const now = serverTimestamp()
    // schedule is inlined on the template (firestore-model.md §1). The caller
    // sets the real cadence via createScheduleRule; default to as_needed so a
    // template that's never scheduled still has a well-formed schedule object.
    await writeBatch(db)
      .set(ref, {
        scopeType: input.scope_type,
        itemUnitId: input.item_unit_id ?? null,
        roomId: null,
        title: input.title,
        description: input.description ?? null,
        careType: input.care_type,
        careTypeOverriddenAt: null,
        justification: null,
        symptomTags: [],
        reCheckTriggers: [],
        priorityTier: input.priority_tier,
        riskLevel: input.risk_level,
        estimatedMinutes: input.estimated_minutes ?? null,
        defaultAssignee: null,
        instructionsChunkId: input.instructions_chunk_id ?? null,
        instructionsOverride: input.instructions_override ?? null,
        steps: null,
        sourcePage: null,
        suppliesMode: input.supplies_mode ?? "none",
        supplies: [],
        source: input.source,
        isUserEditable: true,
        userModifiedAt: null,
        isActive: true,
        metadata: {},
        manualId: null,
        externalKey: null,
        schedule: {
          scheduleType: "as_needed",
          intervalDays: null,
          anchorDate: todayStr(),
          season: null,
          windowDaysBefore: 7,
          windowDaysAfter: 14,
        },
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toTaskTemplate(input.home_id, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to create task template" } }
  }
}

/**
 * Fetches task_templates for a home.
 */
export async function getTaskTemplates(homeId: string): Promise<ServiceResult<TaskTemplate[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/taskTemplates`))
    const list = snap.docs
      .map((d) => toTaskTemplate(homeId, d.id, d.data()))
      .filter((t) => t.is_active && t.deleted_at == null)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: list, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load task templates" } }
  }
}

/**
 * Fetches task_templates for a specific item_unit.
 */
export async function getTaskTemplatesByItem(
  homeId: string,
  itemUnitId: string
): Promise<ServiceResult<TaskTemplate[]>> {
  try {
    // Equality on itemUnitId; is_active/deleted_at filtered client-side to avoid
    // a composite index.
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId))
    )
    const list = snap.docs
      .map((d) => toTaskTemplate(homeId, d.id, d.data()))
      .filter((t) => t.is_active && t.deleted_at == null)
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: list, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load task templates" } }
  }
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
  try {
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId))
    )
    const list = snap.docs
      .filter((d) => {
        const x = d.data()
        return (x.isActive ?? true) && x.deletedAt == null
      })
      .map((d) => {
        const x = d.data()
        const base = toTaskTemplate(homeId, d.id, x)
        // Compose the v1 join shapes from the inlined schedule + supplies.
        const sched = x.schedule as { scheduleType?: string; intervalDays?: number | null } | null
        const supplies = (x.supplies ?? []) as Array<{ name?: string; category?: string; partNumber?: string | null }>
        return {
          ...base,
          schedule_rule: sched
            ? [{ schedule_type: sched.scheduleType ?? "as_needed", interval_days: sched.intervalDays ?? null }]
            : [],
          task_template_supply: supplies.map((s) => ({
            quantity: null,
            supply_item: { name: s.name ?? "", category: s.category ?? "other", oem_part_number: s.partNumber ?? null },
          })),
        } as TaskTemplateWithSchedule
      })
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    return { data: list, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load task templates" } }
  }
}

/**
 * Updates the care_type of a task_template (e.g. reclassify maintenance ↔ cleaning).
 */
export async function updateTaskCareType(
  homeId: string,
  taskTemplateId: string,
  careType: "cleaning" | "maintenance"
): Promise<ServiceResult<true>> {
  try {
    await writeBatch(db)
      .set(
        doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`),
        { careType, careTypeOverriddenAt: serverTimestamp(), updatedAt: serverTimestamp() },
        { merge: true }
      )
      .commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update care type" } }
  }
}

/**
 * Merges `diagram_image_urls` into task_template.metadata while preserving other keys.
 */
export async function updateTaskDiagramUrls(
  homeId: string,
  taskTemplateId: string,
  imageUrls: DiagramImageUrl[]
): Promise<ServiceResult<void>> {
  try {
    const ref = doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`)
    const snap = await getDoc(ref)
    if (!snap.exists() || snap.data().deletedAt != null)
      return { data: null, error: { message: "Task template not found" } }
    const meta = snap.data().metadata
    const existingMeta = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
    await writeBatch(db)
      .set(ref, { metadata: { ...existingMeta, diagram_image_urls: imageUrls }, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: undefined, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update diagrams" } }
  }
}

/**
 * Updates the `diagram_pages` array inside task_template.metadata.
 * Used when a user corrects the manual page reference for a task.
 */
export async function updateTaskDiagramPages(
  homeId: string,
  taskTemplateId: string,
  diagramPages: Array<{ page: number; caption: string }>
): Promise<ServiceResult<void>> {
  try {
    const ref = doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`)
    const snap = await getDoc(ref)
    if (!snap.exists() || snap.data().deletedAt != null)
      return { data: null, error: { message: "Task template not found" } }
    const meta = snap.data().metadata
    const existingMeta = meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {}
    await writeBatch(db)
      .set(ref, { metadata: { ...existingMeta, diagram_pages: diagramPages }, updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { data: undefined, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update diagram pages" } }
  }
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
  try {
    // Single denormalized read — the instance carries title/careType/priorityTier
    // /itemName/roomName (firestore-model.md §5), so the v1 template+item+room
    // joins are already inlined. No caller filters by room_id.
    const snap = await getDocs(collection(db, `homes/${homeId}/taskInstances`))
    let instances: TaskInstanceWithDetails[] = snap.docs
      .filter((d) => d.data().deletedAt == null)
      .map((d) => {
        const x = d.data()
        return {
          ...toTaskInstance(homeId, d.id, x),
          task_template: { title: x.title ?? "", care_type: x.careType ?? "", priority_tier: x.priorityTier ?? "" },
          item_unit: x.itemUnitId
            ? { display_name: x.itemName ?? "", room_id: null, room: x.roomName ? { name: x.roomName } : null }
            : null,
        }
      })
      .sort(
        (a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0) || (a.due_date ?? "").localeCompare(b.due_date ?? "")
      )

    if (filters?.status && filters.status.length > 0) {
      instances = instances.filter((i) => filters.status!.includes(i.status))
    }
    if (filters?.item_unit_id) {
      instances = instances.filter((i) => i.item_unit_id === filters!.item_unit_id)
    }
    if (filters?.care_type) {
      instances = instances.filter((i) => (i.task_template as { care_type?: string })?.care_type === filters!.care_type)
    }
    if (filters?.priority_tier) {
      instances = instances.filter(
        (i) => (i.task_template as { priority_tier?: string })?.priority_tier === filters!.priority_tier
      )
    }

    return { data: instances, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load task instances" } }
  }
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
  try {
    // 1. The instance carries the denormalized display fields (item/room name,
    //    tier, due date — firestore-model.md §5). Absent/soft-deleted → null.
    const instSnap = await getDoc(doc(db, `homes/${homeId}/taskInstances/${taskInstanceId}`))
    if (!instSnap.exists()) return { data: null, error: null }
    const inst = instSnap.data()
    if (inst.deletedAt != null) return { data: null, error: null }

    const taskTemplateId: string = inst.taskTemplateId ?? ""

    // 2. The template inlines schedule + supplies (1:1 in v1 → no join): the
    //    why/how, structured steps, cited supplies, source page, recurrence.
    const tmplSnap = taskTemplateId
      ? await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
      : null
    const tmpl = tmplSnap?.exists() ? tmplSnap.data() : null

    // Structured steps from the column; null tells the UI to parse `notes`.
    const rawSteps = Array.isArray(tmpl?.steps)
      ? (tmpl!.steps as unknown[]).map((s) => String(s).trim()).filter(Boolean)
      : null
    const steps = rawSteps && rawSteps.length > 0 ? rawSteps : null

    // Cited supply names from the inlined supplies array ({ name, category,
    // partNumber } — commitDraft.ts). Empty → the "You'll need" row self-hides.
    const supplyRows = (tmpl?.supplies ?? []) as Array<{ name?: string }>
    const supplies = supplyRows
      .map((s) => (s.name ?? "").trim())
      .filter(Boolean)

    // 3. Has this cadence ever been completed? A never-completed past-due task is
    //    "start anytime", not a lapse (mirrors the dashboard's calm framing).
    let neverCompleted = true
    if (taskTemplateId) {
      const doneSnap = await getDocs(
        query(
          collection(db, `homes/${homeId}/taskInstances`),
          where("taskTemplateId", "==", taskTemplateId),
          where("status", "==", "done"),
          limit(1)
        )
      )
      neverCompleted = doneSnap.empty
    }

    // 4. Manual citation: prefer the dedicated sourcePage, else a diagram page,
    //    else the instructions chunk's source page (chunk lives under the
    //    template's manual — firestore-model.md; skipped when unlinked).
    const meta = (tmpl?.metadata ?? null) as { diagram_pages?: Array<{ page?: number }> } | null
    let chunkPage: number | null = null
    if (tmpl?.instructionsChunkId && tmpl?.manualId) {
      const chunkSnap = await getDoc(
        doc(db, `homes/${homeId}/manuals/${tmpl.manualId}/chunks/${tmpl.instructionsChunkId}`)
      )
      const sp = chunkSnap.exists() ? (chunkSnap.data().sourcePages as number[] | undefined) : undefined
      chunkPage = Array.isArray(sp) && typeof sp[0] === "number" ? sp[0] : null
    }
    const manualPage =
      (typeof tmpl?.sourcePage === "number" ? tmpl.sourcePage : null) ??
      (typeof meta?.diagram_pages?.[0]?.page === "number" ? meta.diagram_pages[0].page : null) ??
      chunkPage

    const sched = (tmpl?.schedule ?? null) as
      | { scheduleType?: ScheduleType; intervalDays?: number | null; season?: Season | null }
      | null

    return {
      data: {
        taskInstanceId: instSnap.id,
        taskTemplateId,
        title: tmpl?.title ?? inst.title ?? "Task",
        tier: (tmpl?.priorityTier ?? inst.priorityTier ?? "optional") as PriorityTier,
        careType: tmpl?.careType ?? inst.careType ?? null,
        justification: tmpl?.justification ?? null,
        estimatedMinutes: tmpl?.estimatedMinutes ?? inst.estimatedMinutes ?? null,
        dueDate: inst.dueDate ?? "",
        assignedTo: inst.assignedTo ?? null,
        notes: tmpl?.instructionsOverride ?? null,
        steps,
        supplies,
        neverCompleted,
        manualPage,
        itemUnitId: inst.itemUnitId ?? null,
        itemName: inst.itemName ?? null,
        roomName: inst.roomName ?? null,
        schedule: sched
          ? { scheduleType: sched.scheduleType as ScheduleType, intervalDays: sched.intervalDays ?? null, season: sched.season ?? null }
          : null,
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load task detail" } }
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
  try {
    const ref = doc(db, `homes/${homeId}/taskInstances/${taskInstanceId}`)
    const fields: DocumentData = { updatedAt: serverTimestamp() }
    if (input.status !== undefined) fields.status = input.status
    if (input.completion_notes !== undefined) fields.completionNotes = input.completion_notes
    if (input.snoozed_until !== undefined) fields.snoozedUntil = input.snoozed_until
    if (input.assigned_to !== undefined) fields.assignedTo = input.assigned_to
    if (input.completed_at !== undefined)
      fields.completedAt = input.completed_at ? Timestamp.fromDate(new Date(input.completed_at)) : null
    if (input.status === "done" && input.completed_at === undefined) fields.completedAt = serverTimestamp()

    await writeBatch(db).set(ref, fields, { merge: true }).commit()
    const snap = await getDoc(ref)
    if (!snap.exists()) return { data: null, error: { message: "Task instance not found" } }
    return { data: toTaskInstance(homeId, snap.id, snap.data()), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to update task instance" } }
  }
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
  // Single choke point for every check-off surface (Home, Tasks, Care, bulk…).
  track("task_checked", { home_id: homeId, task_instance_id: taskInstanceId })

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
  try {
    const now = serverTimestamp()
    const batch = writeBatch(db)
    // Soft-delete open instances (status filtered client-side to avoid a
    // composite index on taskTemplateId + status).
    const openSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId))
    )
    for (const d of openSnap.docs) {
      const x = d.data()
      if ((x.status === "scheduled" || x.status === "snoozed") && x.deletedAt == null) {
        batch.set(d.ref, { deletedAt: now, updatedAt: now }, { merge: true })
      }
    }
    // Deactivate the template (kept for history).
    batch.set(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`), { isActive: false, updatedAt: now }, { merge: true })
    await batch.commit()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to archive task" }
  }
}

/**
 * Soft-deletes a task_template and hard-deletes its task_instances. The schedule
 * is inlined on the template, so there's no separate schedule_rule to remove.
 */
export async function deleteTaskTemplate(
  homeId: string,
  taskTemplateId: string
): Promise<DeleteTaskTemplateResult> {
  try {
    const batch = writeBatch(db)
    // Hard-delete every instance of this template.
    const instSnap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId))
    )
    for (const d of instSnap.docs) batch.delete(d.ref)
    // Soft-delete the template.
    batch.set(
      doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`),
      { deletedAt: serverTimestamp(), isActive: false, updatedAt: serverTimestamp() },
      { merge: true }
    )
    await batch.commit()
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete task" }
  }
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
  try {
    // tierChangeLog docs (homes/{homeId}/tierChangeLog) carry the template ref;
    // resolve title + item scope from the template to filter to this item.
    const snap = await getDocs(collection(db, `homes/${homeId}/tierChangeLog`))
    const logs = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .sort((a, b) => (tiIso(b.data.createdAt) ?? "").localeCompare(tiIso(a.data.createdAt) ?? ""))

    const entries: TierChangeHistoryEntry[] = []
    for (const { id, data: row } of logs) {
      const tplId: string = row.taskTemplateId ?? ""
      if (!tplId) continue
      const tplSnap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${tplId}`))
      if (!tplSnap.exists()) continue
      const tpl = tplSnap.data()
      if ((tpl.itemUnitId ?? null) !== itemUnitId) continue
      entries.push({
        id,
        taskTemplateId: tplId,
        taskTitle: tpl.title ?? "",
        oldTier: row.oldTier as PriorityTier,
        newTier: row.newTier as PriorityTier,
        source: row.source ?? "manual",
        changedAt: tiIso(row.createdAt) ?? "",
      })
      if (entries.length >= (limit ?? 20)) break
    }
    return { data: entries, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load tier history" } }
  }
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
  try {
    // Done instances carry denorm title/priorityTier + itemUnitId — no template
    // join needed. Equality on status only (avoids a composite index); the item
    // scope + ordering are applied client-side.
    const snap = await getDocs(
      query(collection(db, `homes/${homeId}/taskInstances`), where("status", "==", "done"))
    )
    const entries: CompletionHistoryEntry[] = snap.docs
      .filter((d) => {
        const x = d.data()
        return x.deletedAt == null && (x.itemUnitId ?? null) === itemUnitId
      })
      .sort((a, b) => (tiIso(b.data().completedAt) ?? "").localeCompare(tiIso(a.data().completedAt) ?? ""))
      .slice(0, limit ?? 20)
      .map((d) => {
        const x = d.data()
        return {
          instanceId: d.id,
          taskTitle: x.title ?? "",
          priorityTier: (x.priorityTier ?? "recommended") as PriorityTier,
          completedAt: tiIso(x.completedAt) ?? "",
          completionNotes: x.completionNotes ?? null,
        }
      })
    return { data: entries, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load completion history" } }
  }
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
  try {
    // Denormalize the template's display fields onto the done instance so it
    // shows in completion history (getCompletionHistory reads the denorm set).
    const tplSnap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
    const tpl = tplSnap.exists() ? tplSnap.data() : {}
    const sched = tpl.schedule as { scheduleType?: string } | null
    const ref = doc(collection(db, `homes/${homeId}/taskInstances`))
    const now = serverTimestamp()
    await writeBatch(db)
      .set(ref, {
        taskTemplateId,
        itemUnitId: itemUnitId ?? null,
        status: "done",
        dueDate: completedAt.slice(0, 10),
        windowStart: null,
        windowEnd: null,
        snoozedUntil: null,
        priorityScore: 0,
        isSafetyCritical: false,
        completedAt: Timestamp.fromDate(new Date(completedAt)),
        completionNotes: completionNotes ?? null,
        completionPhotos: [],
        assignedTo: null,
        title: tpl.title ?? "",
        priorityTier: tpl.priorityTier ?? "recommended",
        careType: tpl.careType ?? null,
        scopeType: tpl.scopeType ?? (itemUnitId ? "item_unit" : "home"),
        estimatedMinutes: tpl.estimatedMinutes ?? null,
        scheduleType: sched?.scheduleType ?? null,
        itemName: null,
        roomName: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .commit()
    const snap = await getDoc(ref)
    return { data: toTaskInstance(homeId, ref.id, snap.data() ?? {}), error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to log completion" } }
  }
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
