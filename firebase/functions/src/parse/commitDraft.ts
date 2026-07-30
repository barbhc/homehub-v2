/**
 * commitDraft — the Firestore executor for a parse result. Executes the pure
 * `planTaskReconciliation` plan + the chunk swap (docs/firestore-model.md §7),
 * idempotent by `requestId`. Invariants: never delete a completion-bearing task
 * (the planner guarantees this); chunks are hard-delete + reinsert (lossless);
 * tasks are upsert-by-externalKey (preserves instance/completion history).
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore"
import {
  planTaskReconciliation,
  extKey,
  type NormalizedTaskRow,
  type ReconcileExisting,
} from "../../../../shared/parse/parseCore.js"
import type { ParseItemFacts } from "./parseTypes.js"
import { seasonForTask, seasonalNextDue } from "../schedule/cadence.js"
import { applyHouseRules, type HouseRuleLike } from "../../../../shared/tasks/houseRules.js"

/** normalizeChunkRow output (snake_case) → Firestore chunk doc (camelCase). */
type NormalizedChunk = ReturnType<typeof import("../../../../shared/parse/parseCore.js").normalizeChunkRow>

export interface CommitInput {
  homeId: string
  manualId: string
  item: ParseItemFacts
  requestId: string
  chunks: NormalizedChunk[]
  tasks: NormalizedTaskRow[]
  /** "today" anchor for schedules/instances — injectable for deterministic tests. */
  now: Date
}

export interface CommitResult {
  chunks: number
  tasks: number
  matched: number
  inserted: number
  flagged: number
  deleted: number
}

/** Schedule types that produce a recurring due date → get an initial instance.
 *  as_needed / setup / after_each_use route to setup/troubleshoot surfaces, not
 *  the recurring feed, so they don't seed an instance. */
const RECURRING = new Set(["weekly", "monthly", "quarterly", "semiannual", "annual", "seasonal", "every_n_days"])

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function priorityScoreFor(tier: string): number {
  return tier === "essential" ? 100 : tier === "recommended" ? 50 : 10
}

export async function commitDraft(db: Firestore, input: CommitInput): Promise<CommitResult> {
  const { homeId, manualId, item, requestId, chunks, now } = input
  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)

  // Idempotency: a redelivered task whose requestId already committed is a no-op.
  const manualSnap = await manualRef.get()
  const committed = manualSnap.get("parse.committedRequestId")
  if (committed === requestId) {
    const s = manualSnap.get("parse.summary") as { chunks?: number; tasks?: number } | undefined
    return { chunks: s?.chunks ?? 0, tasks: s?.tasks ?? 0, matched: 0, inserted: 0, flagged: 0, deleted: 0 }
  }

  // ── Apply the home's learned house rules + climate to the extracted rows,
  // BEFORE reconciliation (Phase B). Suppressed titles never become templates;
  // tier/cadence/season rules rewrite the row in place. planTaskReconciliation
  // stays pure — it only ever sees the post-rule task set. ───────────────────
  const rulesSnap = await db.collection(`homes/${homeId}/houseRules`).get()
  const activeRules: HouseRuleLike[] = rulesSnap.docs
    .filter((d) => d.get("isActive") !== false && d.get("deletedAt") == null && d.get("match"))
    .map((d) => ({
      kind: d.get("kind"),
      match: d.get("match"),
      toTier: d.get("toTier") ?? null,
      scheduleType: d.get("scheduleType") ?? null,
      intervalDays: d.get("intervalDays") ?? null,
      season: d.get("season") ?? null,
    }))
  const freezeRiskFalse = (await db.doc(`homes/${homeId}`).get()).get("freezeRisk") === false
  const ruled = applyHouseRules(input.tasks, activeRules, { freezeRiskFalse })
  const tasks = ruled.kept

  const nowTs = Timestamp.fromDate(now)
  const today = ymd(now)
  const chunksCol = manualRef.collection("chunks")
  const templatesCol = db.collection(`homes/${homeId}/taskTemplates`)
  const instancesCol = db.collection(`homes/${homeId}/taskInstances`)

  // ── Chunk swap: hard delete existing + reinsert (single batch; sets ≤60) ──
  const existingChunks = await chunksCol.get()
  const chunkBatch = db.batch()
  for (const d of existingChunks.docs) chunkBatch.delete(d.ref)
  for (const c of chunks) {
    chunkBatch.set(chunksCol.doc(), {
      manualId,
      chunkType: c.chunk_type,
      contentLevel: c.content_level,
      title: c.title,
      content: c.content,
      tags: c.tags,
      scenarios: c.scenarios,
      sourcePages: c.source_pages,
      appliesTo: c.applies_to,
      sectionCategory: null,
      externalKey: null,
      embeddingRef: null,
      metadata: c.metadata,
      createdAt: nowTs,
      updatedAt: nowTs,
      deletedAt: null,
    })
  }
  await chunkBatch.commit()

  // ── Task reconciliation ──
  // Existing templates sourced from THIS manual (rescan scope).
  const existingSnap = await templatesCol
    .where("manualId", "==", manualId)
    .where("deletedAt", "==", null)
    .get()

  const existing: ReconcileExisting[] = []
  for (const d of existingSnap.docs) {
    // hasCompletions: any done instance for this template → never auto-delete.
    const done = await instancesCol
      .where("taskTemplateId", "==", d.id)
      .where("status", "==", "done")
      .limit(1)
      .get()
    existing.push({
      id: d.id,
      title: d.get("title") ?? "",
      externalKey: d.get("externalKey") ?? null,
      isLegacy: (d.get("externalKey") ?? null) === null,
      missedScans: d.get("missedScans") ?? 0,
      hasCompletions: !done.empty,
    })
  }

  const incomingTitles = tasks.map((t) => t.title)
  const plan = planTaskReconciliation(item.itemUnitId, incomingTitles, existing)

  const batch = db.batch()

  const templateDoc = (t: NormalizedTaskRow) => ({
    scopeType: "item_unit" as const,
    itemUnitId: item.itemUnitId,
    roomId: null,
    title: t.title,
    description: t.description,
    careType: t.care_type,
    careTypeOverriddenAt: null,
    justification: t.justification,
    symptomTags: t.symptom_tags,
    reCheckTriggers: t.re_check_triggers,
    priorityTier: t.priority_tier,
    // Set when the taxonomy demoted a model-marked "essential" that missed the
    // safety/prevent-damage floor ("hygiene" | "manual_emphasis"). The user can
    // promote it back to Essential per-task; null means no pending suggestion.
    essentialCandidate: t.essential_candidate ?? null,
    riskLevel: t.risk_level,
    estimatedMinutes: t.estimated_minutes,
    defaultAssignee: null,
    instructionsChunkId: null,
    instructionsOverride: t.instructions_override,
    steps: t.steps,
    sourcePage: t.source_page,
    suppliesMode: t.supplies.length > 0 ? ("suggested" as const) : ("none" as const),
    supplies: t.supplies.map((s) => ({ name: s.name, category: s.category, partNumber: s.part_number })),
    source: "manual" as const,
    isUserEditable: true,
    isActive: true,
    metadata: { diagram_pages: t.diagram_pages },
    manualId,
    externalKey: extKey(item.itemUnitId, null, t.title),
    appliesTo: t.applies_to,
    missedScans: 0,
    schedule: {
      scheduleType: t.schedule_type,
      intervalDays: t.interval_days,
      anchorDate: today,
      season: seasonForTask(t),
      windowDaysBefore: 7,
      windowDaysAfter: 14,
    },
    updatedAt: nowTs,
  })

  // matches: UPDATE in place (keep instances), re-stamp externalKey, reset missedScans.
  for (const m of plan.matches) {
    const t = tasks[m.incomingIndex]
    batch.set(templatesCol.doc(m.existingId), templateDoc(t), { merge: true })
  }

  // inserts: new template + (for recurring) an initial scheduled instance w/ denorm.
  let inserted = 0
  for (const i of plan.inserts) {
    const t = tasks[i]
    const tplRef = templatesCol.doc()
    batch.set(tplRef, { ...templateDoc(t), createdAt: nowTs, userModifiedAt: null, deletedAt: null })
    inserted++
    // Seasonal tasks anchor to their season (winterize → next fall), NOT the
    // parse date — else a winterize task lands "due today" in July. Unknown-season
    // seasonal tasks get no due-now instance (the template still exists; it can be
    // scheduled once the season/feedback is known) rather than being dumped on today.
    const initialDue: string | null =
      t.schedule_type === "seasonal" ? seasonalNextDue(seasonForTask(t) ?? "", today) : today
    if (RECURRING.has(t.schedule_type) && initialDue) {
      batch.set(instancesCol.doc(), {
        taskTemplateId: tplRef.id,
        itemUnitId: item.itemUnitId,
        status: "scheduled",
        dueDate: initialDue,
        windowStart: null,
        windowEnd: null,
        snoozedUntil: null,
        priorityScore: priorityScoreFor(t.priority_tier),
        isSafetyCritical: t.risk_level === "safety",
        completedAt: null,
        completionNotes: null,
        completionPhotos: [],
        assignedTo: null,
        // denorm (§5)
        title: t.title,
        priorityTier: t.priority_tier,
        careType: t.care_type,
        scopeType: "item_unit",
        estimatedMinutes: t.estimated_minutes,
        scheduleType: t.schedule_type,
        itemName: item.display_name ?? null,
        roomName: null,
        createdAt: nowTs,
        updatedAt: nowTs,
        deletedAt: null,
      })
    }
  }

  // flags: increment missed_scans (keep the task).
  for (const f of plan.flags) {
    batch.set(templatesCol.doc(f.existingId), { missedScans: f.missedScans, updatedAt: nowTs }, { merge: true })
  }

  // deletes: soft-delete template + its OPEN instances (never completion-bearing).
  for (const id of plan.deletes) {
    batch.set(templatesCol.doc(id), { deletedAt: nowTs, isActive: false, updatedAt: nowTs }, { merge: true })
  }

  // Manual: record commit + summary; clear the draft.
  batch.set(
    manualRef,
    {
      parsedAt: nowTs,
      draft: null,
      parse: { committedRequestId: requestId },
      updatedAt: nowTs,
    },
    { merge: true }
  )

  await batch.commit()

  // Soft-delete open instances for deleted templates (separate query pass).
  if (plan.deletes.length) {
    const delBatch = db.batch()
    for (const id of plan.deletes) {
      const open = await instancesCol
        .where("taskTemplateId", "==", id)
        .where("status", "in", ["scheduled", "snoozed"])
        .get()
      for (const d of open.docs) delBatch.set(d.ref, { deletedAt: nowTs, updatedAt: nowTs }, { merge: true })
    }
    await delBatch.commit()
  }

  return {
    chunks: chunks.length,
    tasks: tasks.length,
    matched: plan.matches.length,
    inserted,
    flagged: plan.flags.length,
    deleted: plan.deletes.length,
  }
}
