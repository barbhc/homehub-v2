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
import { db, callable } from "@/integrations/firebase"
import type { PriorityTier, ScheduleType, Season } from "@/integrations/types"
import { archiveTaskTemplate } from "./taskService"
import { updateTaskSchedule } from "./taskScheduleService"
import type { ServiceResult } from "./careNoteService"
import { ruleMatchFor, matchLabel, findSimilar, seasonalFamily, type RuleMatch, type TaskLike } from "@/lib/taskSimilarity"
import { isAsNeededColdStorage } from "../../../../shared/tasks/houseRules"
import { cadenceLabel } from "../../../../shared/tasks/cadenceLabel"
import { patternKeyOf, type FeedbackPattern } from "../../../../shared/tasks/graduation"
import { isCadenceSeason } from "../../../../shared/tasks/cadenceChange"

export type { RuleMatch } from "@/lib/taskSimilarity"

/** The five deterministic Phase-A chips ("Discuss…" is AI, Phase C). */
export type FeedbackChip = "not_relevant" | "wrong_priority" | "too_often" | "wrong_season" | "duplicate"

/** The concrete action a chip resolves to. */
export type Resolution =
  | { action: "suppress" }
  | { action: "archive_duplicate" }
  | { action: "tier_remap"; toTier: PriorityTier }
  | {
      action: "cadence"
      scheduleType: ScheduleType
      intervalDays: number | null
      /** Seasonal only: the season the sheet asked for (or the task's own). */
      season?: Season | null
    }
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
  /** How the decision was reached — a chip, the AI "Discuss" conversation, or
   *  the Settings climate answer's winterizing offer (HH-166). */
  via?: "chip" | "discuss" | "climate"
  /** True when the user overrode a hazard-task safety warning; logged, never silent. */
  hazardOverride?: boolean
}

export interface SubmitFeedbackResult {
  feedbackId: string
  ruleId: string | null
  affected: number
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

/** Sets a template to seasonal in `season`. Its open occurrence moves by the
 *  one cadence rule (shared/tasks/cadenceChange.ts): the season's next window
 *  after the last completion — it used to count from today, so a task done
 *  this fall was put back on for this fall. */
async function applySeason(homeId: string, taskTemplateId: string, season: Season): Promise<void> {
  const res = await updateTaskSchedule(homeId, taskTemplateId, { schedule: { scheduleType: "seasonal", season } }, "feedback")
  if (res.error) throw new Error(res.error.message)
}

/** `asked`, unless the template already has a season of its own (then null:
 *  the cadence rule uses the stored one). */
async function seasonUnlessKnown(homeId: string, taskTemplateId: string, asked: Season): Promise<Season | null> {
  const snap = await getDoc(doc(db, `homes/${homeId}/taskTemplates/${taskTemplateId}`))
  const stored = (snap.data()?.schedule as { season?: unknown } | undefined)?.season
  return isCadenceSeason(stored) ? null : asked
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
      // The season the sheet asked for fills in a task that has NONE; a task
      // (primary or swept) that already knows its season keeps it — the
      // owner answered for the task in front of her, not for every similar one.
      const season = r.season ? await seasonUnlessKnown(homeId, taskTemplateId, r.season) : null
      const res = await updateTaskSchedule(
        homeId,
        taskTemplateId,
        { schedule: { scheduleType: r.scheduleType, intervalDays: r.intervalDays ?? undefined, season } },
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
  const { homeId, primary, resolution, sweepTemplateIds } = input
  try {
    const targets = [primary.taskTemplateId, ...sweepTemplateIds]
    for (const tplId of targets) {
      await applyResolution(homeId, tplId, resolution)
    }

    const rec = feedbackRecords(input)
    if (rec.rule) await setDoc(rec.rule.ref, rec.rule.data)
    await setDoc(rec.ledger.ref, rec.ledger.data)

    return { data: { feedbackId: rec.ledger.ref.id, ruleId: rec.rule?.ref.id ?? null, affected: targets.length }, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Failed to submit feedback" } }
  }
}

/**
 * The house rule (when the feedback generalizes) and the ledger entry a
 * feedback decision records — built once, so submitTaskFeedback and the
 * climate turn-off (which writes them in its own single batch) cannot drift.
 */
function feedbackRecords(input: SubmitFeedbackInput) {
  const { homeId, uid, primary, chip, resolution, note, sweepTemplateIds, match } = input
  // Pre-generate ids so the ledger and rule can cross-reference without a
  // follow-up write (the ledger is append-only — rules forbid updates).
  const fbRef = doc(collection(db, `homes/${homeId}/taskFeedback`))
  const kind = RULE_KIND[resolution.action]
  // A `template`-scoped match can't generalize (it names one now-changed task),
  // so it earns a ledger entry but not a visible, reusable house rule.
  const rulable = !!match && match.by !== "template"
  const ruleRef = kind && rulable ? doc(collection(db, `homes/${homeId}/houseRules`)) : null

  const rule = ruleRef && kind && match
    ? {
        ref: ruleRef,
        data: {
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
        },
      }
    : null

  // Cross-home graduation signature (Phase D): the home-independent pattern of
  // this feedback, so a scheduled job can spot the same correction recurring
  // across many homes. patternKey is null for home-specific/one-off feedback.
  const pattern: FeedbackPattern = {
    chip,
    action: resolution.action,
    match,
    toTier: resolution.action === "tier_remap" ? resolution.toTier : null,
    scheduleType: resolution.action === "cadence" ? resolution.scheduleType : null,
    season: resolution.action === "reschedule_season" ? resolution.season : null,
  }

  const ledger = {
    ref: fbRef,
    data: {
      taskTemplateId: primary.taskTemplateId,
      taskInstanceId: primary.taskInstanceId ?? null,
      chip,
      note: note ?? null,
      resolution: {
        action: resolution.action,
        sweptTemplateIds: sweepTemplateIds,
        ruleId: ruleRef?.id ?? null,
      },
      via: input.via ?? "chip",
      hazardOverride: input.hazardOverride ?? false,
      pattern,
      patternKey: patternKeyOf(pattern),
      title: primary.title,
      createdBy: uid,
      createdAt: serverTimestamp(),
      deletedAt: null,
    },
  }
  return { rule, ledger }
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

// ── Climate sweep (HH-166) ───────────────────────────────────────────────────

/** A live winterizing task, as the Settings climate offer lists it. */
export interface WinterizingTask {
  taskTemplateId: string
  title: string
  /** The item's name, "Home" for a home-wide task, null when the item is gone. */
  where: string | null
  /** Human cadence ("Seasonal", "When needed" for cold-storage winterizing). */
  cadence: string
}

/**
 * The home's live winterizing tasks — the freeze_prep family, by the SAME
 * matcher the feedback sweep and the parse-time climate suppression use.
 *
 * HH-166: the climate answer only ever filtered manuals scanned after it, so a
 * home set to mild kept every winterizing task it already had. Settings lists
 * these after a Mild/Hot save and offers to turn them off; nothing is turned
 * off without the owner ticking it.
 */
export async function getWinterizingTasks(homeId: string): Promise<ServiceResult<WinterizingTask[]>> {
  try {
    const snap = await getDocs(collection(db, `homes/${homeId}/taskTemplates`))
    const found = snap.docs.filter((d) => {
      const x = d.data()
      return x.isActive !== false && x.deletedAt == null && seasonalFamily(String(x.title ?? "")) === "freeze_prep"
    })
    const itemIds = [...new Set(found.map((d) => d.get("itemUnitId")).filter((v): v is string => typeof v === "string" && v !== ""))]
    const names = new Map<string, string | null>()
    await Promise.all(itemIds.map(async (id) => {
      const item = await getDoc(doc(db, `homes/${homeId}/items/${id}`))
      const name = item.exists() ? item.get("displayName") : null
      names.set(id, typeof name === "string" && name ? name : null)
    }))
    const tasks = found.map((d) => {
      const x = d.data()
      const title = String(x.title ?? "")
      const sched = (x.schedule ?? {}) as { scheduleType?: unknown; intervalDays?: unknown }
      const scheduleType = typeof sched.scheduleType === "string" ? sched.scheduleType : "as_needed"
      const intervalDays = typeof sched.intervalDays === "number" ? sched.intervalDays : null
      const itemUnitId = typeof x.itemUnitId === "string" ? x.itemUnitId : null
      return {
        taskTemplateId: d.id,
        title,
        where: itemUnitId ? (names.get(itemUnitId) ?? null) : x.scopeType === "home" ? "Home" : null,
        // The offer only follows a freeze-free save, so cold-storage
        // winterizing reads as the as-needed job it is there, not "Seasonal".
        cadence: isAsNeededColdStorage({ title, scheduleType, freezeFree: true })
          ? cadenceLabel("as_needed")
          : cadenceLabel(scheduleType, intervalDays),
      }
    })
    tasks.sort((a, b) => (a.where ?? "").localeCompare(b.where ?? "") || a.title.localeCompare(b.title))
    return { data: tasks, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't look for winterizing tasks" } }
  }
}

/** Firestore's per-batch write limit. */
const MAX_BATCH_WRITES = 500

/**
 * Turns off the winterizing tasks the owner ticked, with the same writes the
 * feedback sheet's "Not relevant" sweep makes on a winterizing task: each
 * template archived exactly as archiveTaskTemplate does (isActive:false, kept;
 * its open instances soft-deleted; completion history untouched), the visible
 * "Hide winterizing / freeze-protection tasks" house rule, and the ledger
 * entry — built by the same feedbackRecords, so both doors reach one result.
 *
 * Unlike submitTaskFeedback (one batch per task, then the rule, then the
 * ledger), it is ONE writeBatch (gate-1 review): a failure part-way can no
 * longer leave some tasks off with no rule, or instances soft-deleted that the
 * Undo never learned about. All or nothing; the ids Undo needs are the ids
 * this batch wrote.
 */
export async function turnOffWinterizingTasks(
  homeId: string,
  uid: string,
  tasks: { taskTemplateId: string; title: string }[],
): Promise<ServiceResult<TurnOffResult>> {
  const [primary, ...rest] = tasks
  if (!primary) return { data: null, error: { message: "Pick at least one task to turn off." } }
  try {
    // The open instances to soft-delete — archiveTaskTemplate's own filter.
    const snaps = await Promise.all(tasks.map((t) =>
      getDocs(query(collection(db, `homes/${homeId}/taskInstances`), where("taskTemplateId", "==", t.taskTemplateId))),
    ))
    const instanceIds = snaps.flatMap((s) => s.docs
      .filter((d) => {
        const x = d.data()
        return (x.status === "scheduled" || x.status === "snoozed") && x.deletedAt == null
      })
      .map((d) => d.id))

    const rec = feedbackRecords({
      homeId,
      uid,
      primary: { taskTemplateId: primary.taskTemplateId, taskInstanceId: null, title: primary.title },
      chip: "not_relevant",
      resolution: { action: "suppress" },
      note: null,
      sweepTemplateIds: rest.map((t) => t.taskTemplateId),
      match: { by: "seasonalFamily", family: "freeze_prep" },
      via: "climate",
    })

    // + the rule, the ledger, and the home's "offer answered" marker.
    const writes = tasks.length + instanceIds.length + (rec.rule ? 1 : 0) + 2
    if (writes > MAX_BATCH_WRITES) {
      return { data: null, error: { message: "That's too many tasks to turn off at once. Untick some and try again." } }
    }
    const now = serverTimestamp()
    const batch = writeBatch(db)
    for (const id of instanceIds) {
      batch.set(doc(db, `homes/${homeId}/taskInstances/${id}`), { deletedAt: now, updatedAt: now }, { merge: true })
    }
    for (const t of tasks) {
      batch.set(doc(db, `homes/${homeId}/taskTemplates/${t.taskTemplateId}`), { isActive: false, updatedAt: now }, { merge: true })
    }
    if (rec.rule) batch.set(rec.rule.ref, rec.rule.data)
    batch.set(rec.ledger.ref, rec.ledger.data)
    // The offer is answered (homeProfileService.markWinterizingOfferAnswered's
    // field — and, like it, never `updatedAt`, the profile form's CAS guard).
    batch.set(doc(db, `homes/${homeId}`), { winterizingOfferAnsweredAt: now }, { merge: true })
    await batch.commit()

    return {
      data: {
        feedbackId: rec.ledger.ref.id,
        ruleId: rec.rule?.ref.id ?? null,
        affected: tasks.length,
        templateIds: tasks.map((t) => t.taskTemplateId),
        instanceIds,
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't turn them off" } }
  }
}

/** A turn-off, with what Undo needs to put it back exactly. */
export interface TurnOffResult extends SubmitFeedbackResult {
  templateIds: string[]
  /** The open instances the archive soft-deleted. */
  instanceIds: string[]
}

/**
 * Undo a climate turn-off: reactivate exactly those templates, restore the
 * open instances the archive soft-deleted, and retire the house rule it added
 * (the same soft delete as deleteHouseRule). One batch, so it is all or none.
 *
 * The `taskFeedback` ledger entry stays: firestore.rules make that collection
 * append-only (an audit trail — "a correction is a new entry"), and nothing in
 * the app has ever reversed a feedback sweep, so there is no reversal entry to
 * follow. It records what she did; Undo is recorded by the rule going inactive.
 */
export async function undoTurnOffWinterizing(homeId: string, r: TurnOffResult): Promise<ServiceResult<true>> {
  try {
    const now = serverTimestamp()
    const batch = writeBatch(db)
    for (const id of r.templateIds) {
      batch.set(doc(db, `homes/${homeId}/taskTemplates/${id}`), { isActive: true, updatedAt: now }, { merge: true })
    }
    for (const id of r.instanceIds) {
      batch.set(doc(db, `homes/${homeId}/taskInstances/${id}`), { deletedAt: null, updatedAt: now }, { merge: true })
    }
    if (r.ruleId) {
      batch.set(doc(db, `homes/${homeId}/houseRules/${r.ruleId}`), { isActive: false, deletedAt: now, updatedAt: now }, { merge: true })
    }
    await batch.commit()
    return { data: true, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "Couldn't undo" } }
  }
}

// ── Discuss (Phase C — AI) ───────────────────────────────────────────────────

export interface DiscussMessage {
  role: "user" | "assistant"
  content: string
}
export interface DiscussProposal {
  action: "suppress" | "tier_remap" | "cadence" | "reschedule_season"
  toTier?: PriorityTier
  scheduleType?: ScheduleType
  season?: Season
  rationale: string
}
export interface DiscussResult {
  explanation: string
  proposal: DiscussProposal | null
}

const discussTaskCallable = callable<
  { homeId: string; taskTemplateId: string; question: string; history: DiscussMessage[] },
  DiscussResult
>("discussTask")

/** Ask the assistant about a task (grounded in its manual + the home profile). */
export async function discussTask(
  homeId: string,
  taskTemplateId: string,
  question: string,
  history: DiscussMessage[],
): Promise<ServiceResult<DiscussResult>> {
  try {
    const res = await discussTaskCallable({ homeId, taskTemplateId, question, history })
    return { data: res, error: null }
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : "The assistant is unavailable right now." } }
  }
}

/** Map an AI proposal onto the deterministic Resolution the sheet already applies. */
export function proposalToResolution(p: DiscussProposal): Resolution | null {
  switch (p.action) {
    case "suppress":
      return { action: "suppress" }
    case "tier_remap":
      return p.toTier ? { action: "tier_remap", toTier: p.toTier } : null
    case "cadence":
      return p.scheduleType ? { action: "cadence", scheduleType: p.scheduleType, intervalDays: null } : null
    case "reschedule_season":
      return p.season ? { action: "reschedule_season", season: p.season } : null
  }
}
