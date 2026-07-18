/**
 * Task-feedback loop — Phase A (no AI).
 *
 * A homeowner gives feedback on a task via reason chips; each chip resolves to a
 * deterministic action (archive / re-tier / re-cadence / re-season). We:
 *   1. apply the action to the primary task and any CONFIRMED similar tasks,
 *   2. append an immutable `taskFeedback` ledger doc (the audit trail),
 *   3. record a visible, reversible `houseRule` (the learned decision) that
 *      Phase B will re-apply to future parses.
 *
 * House-scoped collections are small, so lists read the whole collection and
 * filter/sort client-side (same idiom as getTierChangeHistory / archiveTask
 * Template) — no new composite index required.
 */
import { collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch, Timestamp, type DocumentData } from "firebase/firestore"
import { db } from "@/integrations/firebase"
import type { PriorityTier, ScheduleType, Season } from "@/integrations/types"
import { computeNextDueDate } from "./nextDueDate"
import { archiveTaskTemplate } from "./taskService"
import { updateTaskSchedule } from "./taskScheduleService"
import type { ServiceResult } from "./careNoteService"
import { ruleMatchFor, matchLabel, findSimilar, type RuleMatch, type TaskLike } from "@/lib/taskSimilarity"

export type { RuleMatch } from "@/lib/taskSimilarity"

/** The five deterministic Phase-A chips ("Discuss…" is AI, Phase C). */
export type FeedbackChip = "not_relevant" | "wrong_priority" | "too_often" | "wrong_season" | "duplicate"

/** The concrete action a chip resolves to. */
export type Resolution =
  | { action: "suppress" }
  | { action: "archive_duplicate" }
  | { action: "tier_remap"; toTier: PriorityTier }
  | { action: "cadence"; scheduleType: ScheduleType; intervalDays: number | null }
  | { action: "reschedule_season"; season: Season }

/** A learned rule, as surfaced in Settings › House rules. */
export type HouseRuleKind = "suppress" | "tier_remap" | "cadence" | "season"
export interface HouseRule {
  id: string
  kind: HouseRuleKind
  match: RuleMatch
  toTier: PriorityTier | null
  scheduleType: ScheduleType | null
  intervalDays: number | null
  season: Season | null
  reason: string
  sourceFeedbackId: string
  createdBy: string
  createdAt: string
  isActive: boolean
}

export interface SimilarTask {
  taskTemplateId: string
  title: string
}

export interface FeedbackContext {
  /** The task feedback was opened on. */
  primary: TaskLike
  /** Visibly-similar tasks the sweep could also touch (excludes the primary). */
  similar: SimilarTask[]
  /** The predicate a resulting rule/sweep would use (for the provenance sentence). */
  match: RuleMatch
}

export interface SubmitFeedbackInput {
  homeId: string
  uid: string
  primary: { taskTemplateId: string; taskInstanceId: string | null; title: string }
  chip: FeedbackChip
  resolution: Resolution
  note: string | null
  /** Similar tasks the user CONFIRMED to also apply the action to (excludes primary). */
  sweepTemplateIds: string[]
  /** The rule predicate computed from the primary (null → no rule; e.g. duplicate). */
  match: RuleMatch | null
}

export interface SubmitFeedbackResult {
  feedbackId: string
  ruleId: string | null
  affected: number
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}
function tiIso(v: unknown): string | null {
  if (v instanceof Timestamp) return v.toDate().toISOString()
  return typeof v === "string" ? v : null
}

/** A live (active, not-deleted) template doc → the minimal shape the matcher reads. */
function toTaskLike(id: string, d: DocumentData): TaskLike {
  const sched = (d.schedule ?? null) as { scheduleType?: string; season?: Season | null } | null
  return {
    taskTemplateId: id,
    title: d.title ?? "",
    symptomTags: Array.isArray(d.symptomTags) ? d.symptomTags : [],
    scheduleType: sched?.scheduleType ?? null,
    season: sched?.season ?? null,
  }
}

async function loadLiveTemplates(homeId: string): Promise<Map<string, TaskLike>> {
  const snap = await getDocs(collection(db, `homes/${homeId}/taskTemplates`))
  const out = new Map<string, TaskLike>()
  for (const dsnap of snap.docs) {
    const d = dsnap.data()
    if (d.isActive === false || d.deletedAt != null) continue
    out.set(dsnap.id, toTaskLike(dsnap.id, d))
  }
  return out
}

/**
 * Everything the feedback sheet needs to show the confirm-first sweep: the
 * primary task and the visibly-similar live tasks. Loads all live templates once.
 */
export async function getFeedbackContext(
  homeId: string,
  taskTemplateId: string
): Promise<ServiceResult<FeedbackContext>> {
  try {
    const live = await loadLiveTemplates(homeId)
    const primary = live.get(taskTemplateId)
    if (!primary) return { data: null, error: { message: "Task not found" } }
    const similar = findSimilar(primary, [...live.values()])
    return {
      data: {
        primary,
        match: ruleMatchFor(primary),
        similar: similar.map((t) => ({ taskTemplateId: t.taskTemplateId, title: t.title })),
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load feedback context" } }
  }
}

/** Sets a template to seasonal + re-anchors its open instances to that season. */
async function applySeason(homeId: string, taskTemplateId: string, season: Season): Promise<void> {
  const tplRef = doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`)
  const snap = await getDoc(tplRef)
  if (!snap.exists()) throw new Error("Task template not found")
  const existing = (snap.data().schedule ?? {}) as Record<string, unknown>
  const nextDue = computeNextDueDate("seasonal", todayStr(), { season })

  const batch = writeBatch(db)
  batch.set(
    tplRef,
    { schedule: { ...existing, scheduleType: "seasonal", season }, updatedAt: serverTimestamp() },
    { merge: true }
  )
  const openSnap = await getDocs(
    query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", taskTemplateId))
  )
  for (const d of openSnap.docs) {
    const x = d.data()
    if ((x.status === "scheduled" || x.status === "snoozed") && x.deletedAt == null && nextDue) {
      batch.set(d.ref, { dueDate: nextDue, scheduleType: "seasonal", updatedAt: serverTimestamp() }, { merge: true })
    }
  }
  await batch.commit()
}

/** Applies one resolution to one template, throwing on failure (caller reports). */
async function applyResolution(homeId: string, taskTemplateId: string, r: Resolution): Promise<void> {
  switch (r.action) {
    case "suppress":
    case "archive_duplicate": {
      const res = await archiveTaskTemplate(homeId, taskTemplateId)
      if (!res.success) throw new Error(res.error)
      return
    }
    case "tier_remap": {
      const res = await updateTaskSchedule(homeId, taskTemplateId, { priorityTier: r.toTier }, "feedback")
      if (res.error) throw new Error(res.error.message)
      return
    }
    case "cadence": {
      const res = await updateTaskSchedule(
        homeId,
        taskTemplateId,
        { schedule: { scheduleType: r.scheduleType, intervalDays: r.intervalDays ?? undefined } },
        "feedback"
      )
      if (res.error) throw new Error(res.error.message)
      return
    }
    case "reschedule_season":
      await applySeason(homeId, taskTemplateId, r.season)
      return
  }
}

const RULE_KIND: Record<Resolution["action"], HouseRuleKind | null> = {
  suppress: "suppress",
  archive_duplicate: null, // a one-off dedup — no learned rule
  tier_remap: "tier_remap",
  cadence: "cadence",
  reschedule_season: "season",
}

const CADENCE_LABEL: Partial<Record<ScheduleType, string>> = {
  weekly: "weekly", monthly: "monthly", quarterly: "every 3 months",
  semiannual: "every 6 months", annual: "yearly",
}

/** A plain-English provenance sentence for the rule, shown in Settings. */
function buildReason(title: string, match: RuleMatch, r: Resolution): string {
  const group = matchLabel(match)
  switch (r.action) {
    case "suppress":
      return `Hide ${group} — you marked "${title}" not relevant to your home.`
    case "tier_remap":
      return `Set ${group} to ${r.toTier} — you changed the priority of "${title}".`
    case "cadence":
      return `Do ${group} ${CADENCE_LABEL[r.scheduleType] ?? "less often"} — you said "${title}" was too often.`
    case "reschedule_season":
      return `Schedule ${group} in ${r.season} — you corrected the timing of "${title}".`
    case "archive_duplicate":
      return `Removed "${title}" as a duplicate.`
  }
}

/**
 * Applies the resolution to the primary + confirmed similar tasks, then records
 * the ledger + (unless it's a one-off) the learned house rule.
 *
 * Not a single transaction: each task mutation reuses the existing per-task
 * services (independently valid). If one throws we stop and surface the error;
 * the ledger is written only after the mutations succeed, so it never claims a
 * change that didn't land.
 */
export async function submitTaskFeedback(input: SubmitFeedbackInput): Promise<ServiceResult<SubmitFeedbackResult>> {
  const { homeId, uid, primary, chip, resolution, note, sweepTemplateIds, match } = input
  try {
    const targets = [primary.taskTemplateId, ...sweepTemplateIds]
    for (const tplId of targets) {
      await applyResolution(homeId, tplId, resolution)
    }

    // Pre-generate ids so the ledger and rule can cross-reference without a
    // follow-up write (the ledger is append-only — rules forbid updates).
    const fbRef = doc(collection(db, `homes/${homeId}/taskFeedback`))
    const kind = RULE_KIND[resolution.action]
    // A `template`-scoped match can't generalize (it names one now-changed task),
    // so it earns a ledger entry but not a visible, reusable house rule.
    const rulable = !!match && match.by !== "template"
    const ruleRef = kind && rulable ? doc(collection(db, `homes/${homeId}/houseRules`)) : null

    if (ruleRef && kind && match) {
      await setDoc(ruleRef, {
        kind,
        match,
        toTier: resolution.action === "tier_remap" ? resolution.toTier : null,
        scheduleType: resolution.action === "cadence" ? resolution.scheduleType : null,
        intervalDays: resolution.action === "cadence" ? (resolution.intervalDays ?? null) : null,
        season: resolution.action === "reschedule_season" ? resolution.season : null,
        reason: buildReason(primary.title, match, resolution),
        sourceFeedbackId: fbRef.id,
        createdBy: uid,
        createdAt: serverTimestamp(),
        isActive: true,
        deletedAt: null,
      })
    }

    await setDoc(fbRef, {
      taskTemplateId: primary.taskTemplateId,
      taskInstanceId: primary.taskInstanceId ?? null,
      chip,
      note: note ?? null,
      resolution: {
        action: resolution.action,
        sweptTemplateIds: sweepTemplateIds,
        ruleId: ruleRef?.id ?? null,
      },
      createdBy: uid,
      createdAt: serverTimestamp(),
      deletedAt: null,
    })

    return { data: { feedbackId: fbRef.id, ruleId: ruleRef?.id ?? null, affected: targets.length }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to submit feedback" } }
  }
}

function toHouseRule(id: string, d: DocumentData): HouseRule {
  return {
    id,
    kind: (d.kind ?? "suppress") as HouseRuleKind,
    match: d.match as RuleMatch,
    toTier: (d.toTier ?? null) as PriorityTier | null,
    scheduleType: (d.scheduleType ?? null) as ScheduleType | null,
    intervalDays: d.intervalDays ?? null,
    season: (d.season ?? null) as Season | null,
    reason: d.reason ?? "",
    sourceFeedbackId: d.sourceFeedbackId ?? "",
    createdBy: d.createdBy ?? "",
    createdAt: tiIso(d.createdAt) ?? "",
    isActive: d.isActive !== false,
  }
}

/** Active learned rules, newest first (for Settings › House rules). */
export async function listHouseRules(homeId: string): Promise<ServiceResult<HouseRule[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/houseRules`))
    const rules = snap.docs
      .filter((d) => d.data().isActive !== false && d.data().deletedAt == null)
      .map((d) => toHouseRule(d.id, d.data()))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { data: rules, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to load house rules" } }
  }
}

/**
 * Deactivates a rule (soft delete). Per the scope doc this only STOPS future
 * application — it does not resurrect already-archived tasks.
 */
export async function deleteHouseRule(homeId: string, ruleId: string): Promise<ServiceResult<true>> {
  try {
    await setDoc(
      doc(db, `homes/${homeId}/houseRules/${ruleId}`),
      { isActive: false, deletedAt: serverTimestamp(), updatedAt: serverTimestamp() },
      { merge: true }
    )
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to delete rule" } }
  }
}
