/**
 * Clean Session data layer — CHO Data Model v1.1
 * Cleaning tasks from task_instance (includes routine templates after instance generation)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
  Timestamp,
  type DocumentData,
} from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { ScheduleType } from "@/integrations/types"
import { generateTaskInstances } from "@/modules/care"

/** Timestamp | ISO string → ISO string ("" when absent). */
function clnIso(v: unknown): string {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : ""
}

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

/**
 * Fetches tasks for a clean session: task_instance filtered by care_type (cleaning+mixed or maintenance+mixed) + routine templates.
 * Routine = scope_type home, item_unit_id null, source user (user-created home tasks).
 */
export async function getCleaningTasks(
  homeId: string,
  mode: CleanSessionMode = "cleaning"
): Promise<CleanTask[]> {
  const today = todayStr()
  const careTypes = mode === "cleaning" ? ["cleaning", "mixed"] : ["maintenance", "mixed"]

  // One pass over the home's instances, templates, and items. The instance
  // carries the denormalized display set (title/careType/scopeType/scheduleType/
  // itemName/roomName); the template map adds description + instructions, the
  // item map adds room_id (not denormalized onto the instance).
  const [doneSnap, tplSnap, instSnap, itemSnap] = await Promise.all([
    getDocs(query(collection(db, `homes/${homeId}/taskInstances`), where("status", "==", "done"))),
    getDocs(collection(db, `homes/${homeId}/taskTemplates`)),
    getDocs(collection(db, `homes/${homeId}/taskInstances`)),
    getDocs(collection(db, `homes/${homeId}/items`)),
  ])

  // 1. Completion map: templateId → last completed calendar date.
  const lastByTemplate = new Map<string, string>()
  doneSnap.docs
    .map((d) => d.data())
    .filter((x) => x.completedAt != null)
    .sort((a, b) => clnIso(b.completedAt).localeCompare(clnIso(a.completedAt)))
    .forEach((x) => {
      if (!lastByTemplate.has(x.taskTemplateId)) lastByTemplate.set(x.taskTemplateId, clnIso(x.completedAt).slice(0, 10))
    })

  // 2. Template + item maps.
  const tplById = new Map<string, DocumentData>()
  const activeTpls: Array<{ id: string; itemUnitId: string | null }> = []
  tplSnap.docs.forEach((d) => {
    const x = d.data()
    tplById.set(d.id, x)
    if ((x.isActive ?? true) && x.deletedAt == null && careTypes.includes(x.careType)) {
      activeTpls.push({ id: d.id, itemUnitId: x.itemUnitId ?? null })
    }
  })
  const roomIdByItem = new Map<string, string | null>()
  itemSnap.docs.forEach((d) => roomIdByItem.set(d.id, d.data().roomId ?? null))

  // 3. Ensure every active template has a scheduled instance (best-effort;
  // generateTaskInstances is a no-op until the create subsystem lands, and the
  // seed already carries one instance per template).
  const scheduledTemplateIds = new Set(
    instSnap.docs.filter((d) => d.data().status === "scheduled" && d.data().deletedAt == null).map((d) => d.data().taskTemplateId)
  )
  const needInstances = activeTpls.filter((t) => !scheduledTemplateIds.has(t.id))
  if (needInstances.length > 0) {
    await Promise.all(
      needInstances.map((t) =>
        generateTaskInstances({ task_template_id: t.id, home_id: homeId, item_unit_id: t.itemUnitId ?? undefined })
      )
    )
  }

  // 4. Compose from scheduled/snoozed instances whose (denorm) care_type matches.
  const instanceTasks: CleanTask[] = instSnap.docs
    .map((d) => ({ id: d.id, x: d.data() }))
    .filter(({ x }) => (x.status === "scheduled" || x.status === "snoozed") && x.deletedAt == null && careTypes.includes(x.careType))
    .map(({ id, x }) => {
      const tpl = tplById.get(x.taskTemplateId)
      const isRoutine = x.scopeType === "home" && (x.itemUnitId ?? null) == null
      const due: string = x.dueDate ?? ""
      const lastDone = lastByTemplate.get(x.taskTemplateId) ?? null
      const staleDays = lastDone ? daysBetween(lastDone, today) : 9999
      const isOverdue = due !== "" && due < today
      const instructions = tpl?.instructionsOverride ?? null
      const t: Omit<CleanTask, "priorityScore"> = {
        id,
        source: isRoutine ? "routine" : "instance",
        title: x.title ?? tpl?.title ?? "Task",
        description: tpl?.description ?? null,
        instructions,
        itemUnitId: isRoutine ? null : (x.itemUnitId ?? tpl?.itemUnitId ?? null),
        itemName: isRoutine ? null : (x.itemName ?? null),
        roomId: isRoutine ? null : (x.itemUnitId ? roomIdByItem.get(x.itemUnitId) ?? null : null),
        roomName: isRoutine ? "Routine" : (x.roomName ?? null),
        dueDate: due,
        estimatedMinutes: x.estimatedMinutes ?? tpl?.estimatedMinutes ?? null,
        scheduleType: x.scheduleType ?? (tpl?.schedule as { scheduleType?: string } | null)?.scheduleType ?? null,
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
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/taskTemplates`))
    return snap.docs
      .map((d) => ({ id: d.id, x: d.data() }))
      .filter(
        ({ x }) =>
          x.scopeType === "home" &&
          (x.itemUnitId ?? null) == null &&
          x.source === "user" &&
          (x.isActive ?? true) &&
          x.deletedAt == null
      )
      .sort((a, b) => clnIso(b.x.createdAt).localeCompare(clnIso(a.x.createdAt)))
      .map(({ id, x }) => ({
        task_template_id: id,
        title: x.title ?? "",
        schedule_type: (x.schedule as { scheduleType?: string } | null)?.scheduleType ?? "monthly",
        estimated_minutes: x.estimatedMinutes ?? null,
      }))
  } catch (e) {
    throw new Error(`Failed to load routine templates: ${e instanceof Error ? e.message : "unknown"}`)
  }
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
  try {
    // Cleaning templates for the item (care_type/active filtered client-side to
    // avoid a composite index). steps + supplies are inlined on the template.
    const [tplSnap, itemSnap] = await Promise.all([
      getDocs(query(collection(db, `homes/${homeId}/taskTemplates`), where("itemUnitId", "==", itemUnitId))),
      getDoc(doc(db, `homes/${homeId}/items/${itemUnitId}`)),
    ])
    const rows = tplSnap.docs
      .map((d) => ({ id: d.id, x: d.data() }))
      .filter(({ x }) => ["cleaning", "mixed"].includes(x.careType) && (x.isActive ?? true) && x.deletedAt == null)
      .sort((a, b) => clnIso(a.x.createdAt).localeCompare(clnIso(b.x.createdAt)))
    if (rows.length === 0) return null

    // Item name + room from the item doc (+ its room), not the template.
    const itemData = itemSnap.exists() ? itemSnap.data() : null
    let roomName: string | null = null
    if (itemData?.roomId) {
      const roomSnap = await getDoc(doc(db, `homes/${homeId}/rooms/${itemData.roomId}`))
      roomName = roomSnap.exists() ? (roomSnap.data().name ?? null) : null
    }

    const tasks: CleanGuideStep[] = rows.map(({ id, x }) => {
      const rawSteps = Array.isArray(x.steps) ? x.steps.map((s: unknown) => String(s).trim()).filter(Boolean) : null
      const supplies = ((x.supplies ?? []) as Array<{ name?: string }>)
        .map((s) => (s.name ?? "").trim())
        .filter(Boolean)
      return {
        taskTemplateId: id,
        title: x.title ?? "Cleaning step",
        instructions: x.instructionsOverride ?? null,
        steps: rawSteps && rawSteps.length > 0 ? rawSteps : null,
        supplies,
        estimatedMinutes: x.estimatedMinutes ?? null,
      }
    })

    return {
      itemUnitId,
      itemName: itemData?.displayName ?? "Item",
      roomName,
      totalMinutes: tasks.reduce((a, t) => a + (t.estimatedMinutes ?? 0), 0),
      tasks,
    }
  } catch (e) {
    throw new Error(`Failed to load clean guide: ${e instanceof Error ? e.message : "unknown"}`)
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

  try {
    const ref = doc(collection(db, `homes/${homeId}/taskTemplates`))
    await writeBatch(db)
      .set(ref, {
        ...routineTemplateDoc({ title: title.trim(), careType: "cleaning", priorityTier: "recommended", estimatedMinutes, roomId: null, scheduleType: st }),
      })
      .commit()
    return { task_template_id: ref.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create template" }
  }
}

/** Shared home-scoped template doc (inlined schedule) for the two save helpers. */
function routineTemplateDoc(o: {
  title: string
  careType: "cleaning" | "maintenance" | "mixed"
  priorityTier: "essential" | "recommended" | "optional"
  estimatedMinutes: number | null
  roomId: string | null
  scheduleType: ScheduleType
}): DocumentData {
  const now = serverTimestamp()
  return {
    scopeType: "home",
    itemUnitId: null,
    roomId: o.roomId,
    title: o.title,
    description: null,
    careType: o.careType,
    careTypeOverriddenAt: null,
    justification: null,
    symptomTags: [],
    reCheckTriggers: [],
    priorityTier: o.priorityTier,
    riskLevel: "comfort",
    estimatedMinutes: o.estimatedMinutes,
    defaultAssignee: null,
    instructionsChunkId: null,
    instructionsOverride: null,
    steps: null,
    sourcePage: null,
    suppliesMode: "none",
    supplies: [],
    source: "user",
    isUserEditable: true,
    userModifiedAt: null,
    isActive: true,
    metadata: {},
    manualId: null,
    externalKey: null,
    schedule: {
      scheduleType: o.scheduleType,
      intervalDays: null,
      anchorDate: todayStr(),
      season: null,
      windowDaysBefore: 7,
      windowDaysAfter: 14,
    },
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }
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

  try {
    const ref = doc(collection(db, `homes/${homeId}/taskTemplates`))
    await writeBatch(db)
      .set(ref, routineTemplateDoc({
        title: opts.title.trim(),
        careType: opts.careType,
        priorityTier: opts.priorityTier,
        estimatedMinutes: opts.estimatedMinutes,
        roomId: opts.roomId,
        scheduleType: st,
      }))
      .commit()
    return { task_template_id: ref.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to create template" }
  }
}

/**
 * Soft-deletes a task_template.
 */
export async function deleteRoutineTask(homeId: string, templateId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await writeBatch(db)
      .set(doc(db, `homes/${homeId}/taskTemplates/${templateId}`), { deletedAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true })
      .commit()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete template" }
  }
}
