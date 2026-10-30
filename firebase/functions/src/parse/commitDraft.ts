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
  titleSimilarity,
  TITLE_MATCH_THRESHOLD,
  type NormalizedTaskRow,
  type ReconcileExisting,
} from "../../../../shared/parse/parseCore.js"
import type { ParseItemFacts } from "./parseTypes.js"
import { addCadence, seasonForTask, seasonalNextDue, type Season } from "../schedule/cadence.js"
import { applyHouseRules, type HouseRuleLike } from "../../../../shared/tasks/houseRules.js"
import { storedCount } from "../lib/validate.js"
import {
  PROVENANCE_FIELDS,
  sameValue,
  stampFor,
  type FieldSources,
  type ManualSuggestion,
  type ProvenanceValues,
} from "../../../../shared/tasks/fieldProvenance.js"

/** normalizeChunkRow output (snake_case) → Firestore chunk doc (camelCase). */
type NormalizedChunk = ReturnType<typeof import("../../../../shared/parse/parseCore.js").normalizeChunkRow>

export interface CommitInput {
  homeId: string
  manualId: string
  item: ParseItemFacts
  requestId: string
  chunks: NormalizedChunk[]
  /** The reviewer's per-task reminder choice rides alongside the normalized row;
   *  absent on the worker path (a fresh parse never sets it), which correctly
   *  leaves it null so the tier default applies. */
  tasks: (NormalizedTaskRow & {
    remind_enabled?: boolean | null
    /** A seasonal row's season as the reviewer set it (commitManualDraft).
     *  seasonForTask() reads it ahead of the title inference; absent or null
     *  (the worker path, or a review that never asked) → the title decides. */
    season?: Season | null
    /** "I've been doing this already" from the review screen — the date the
     *  user says they last did this work. Already validated by the caller
     *  (parseLastDone); null means anchor on today, the shipped behaviour. */
    last_done_on?: string | null
    /**
     * Provenance (decision C, step 1): the MANUAL's own version of this row,
     * when the row is not it. commitManualDraft sends the reviewed row and
     * sets this to the draft row the parser wrote (as an untouched review
     * row would have come back), or null when no draft row matches — then
     * the manual's suggestion is unknown. Absent on the worker path, where
     * the row IS the manual's suggestion.
     */
    manual_suggestion_row?: SuggestionRow | null
  })[]
  /** The member whose review is being committed (commitManualDraft). Absent
   *  on the worker path: nobody chose anything there. */
  reviewerUid?: string | null
  /** "today" anchor for schedules/instances — injectable for deterministic tests. */
  now: Date
}

/** The fields of a task row provenance reads. */
export interface SuggestionRow {
  title: string
  tags?: string[] | null
  description?: string | null
  care_type: string
  priority_tier: string
  schedule_type: string
  interval_days: number | null
  season?: string | null
  remind_enabled?: boolean | null
}

/** A row's four values exactly as templateDoc() stores them. */
function rowValues(t: SuggestionRow): ProvenanceValues {
  return {
    priorityTier: t.priority_tier,
    careType: t.care_type,
    remindEnabled: t.remind_enabled ?? null,
    schedule: { scheduleType: t.schedule_type, intervalDays: t.interval_days ?? null, season: seasonForTask(t) },
  }
}

export interface CommitResult {
  /** Incoming tasks declined because this item already had a near-identical
   *  task from a DIFFERENT manual. Counted, never silent. */
  duplicatesSkipped?: number
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

/** How long a commit claim is trusted before another attempt may take it over.
 *  Longer than commitManualDraft's 120s timeout and the worker's attempt
 *  deadline, so an attempt that is still alive is never displaced — and one
 *  that died between claiming and committing stops blocking its own retry
 *  instead of wedging the manual for good. */
export const COMMIT_CLAIM_TTL_MS = 5 * 60 * 1000

/** Another attempt holds the commit. Thrown rather than returned because every
 *  caller must do something visible with it: the review says so, the worker
 *  retries. */
export class CommitInProgressError extends Error {
  constructor(readonly heldBy: string) {
    super("This manual is already being saved. Give it a moment and try again.")
    this.name = "CommitInProgressError"
  }
}

/** `parse.commitClaim` as stored — member-writable data, so it is read, never
 *  cast: anything that is not {requestId: string, at: Timestamp} is no claim. */
function readClaim(raw: unknown): { requestId: string; atMs: number } | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { requestId?: unknown; at?: unknown }
  if (typeof r.requestId !== "string" || !r.requestId) return null
  return { requestId: r.requestId, atMs: r.at instanceof Timestamp ? r.at.toMillis() : 0 }
}

type ClaimOutcome =
  | { kind: "claimed" }
  | { kind: "already_committed"; result: CommitResult }
  | { kind: "in_progress"; heldBy: string }

/**
 * Take exclusive ownership of this manual's commit, atomically.
 *
 * What this replaced was a plain read of `parse.committedRequestId` followed,
 * hundreds of lines later, by a batch write of it. Two saves of the same review
 * therefore both read "nothing committed yet" and both inserted every task, so
 * the household saw each upkeep task twice (Codex review 2026-10-29, finding 2).
 * Reading and stamping in one transaction is what makes "exactly one of us
 * commits" true instead of merely likely.
 *
 * The claim expires on purpose: an attempt that dies after claiming must not
 * wedge the manual, because silently losing a paid parse is worse than the
 * duplicate this guards against.
 */
async function claimCommit(
  db: Firestore,
  manualRef: FirebaseFirestore.DocumentReference,
  requestId: string,
  nowMs: number,
): Promise<ClaimOutcome> {
  return db.runTransaction<ClaimOutcome>(async (tx) => {
    const snap = await tx.get(manualRef)
    if (snap.get("parse.committedRequestId") === requestId) {
      return {
        kind: "already_committed",
        result: {
          chunks: storedCount(snap.get("parse.summary.chunks")) ?? 0,
          tasks: storedCount(snap.get("parse.summary.tasks")) ?? 0,
          matched: 0,
          inserted: 0,
          flagged: 0,
          deleted: 0,
        },
      }
    }
    const held = readClaim(snap.get("parse.commitClaim"))
    if (held && nowMs - held.atMs < COMMIT_CLAIM_TTL_MS) return { kind: "in_progress", heldBy: held.requestId }
    tx.set(manualRef, { parse: { commitClaim: { requestId, at: Timestamp.fromMillis(nowMs) } } }, { merge: true })
    return { kind: "claimed" }
  })
}

/** Hand the claim back so this request's own retry is not locked out for the
 *  whole TTL. Only ever clears OUR claim — an attempt that took over after ours
 *  expired keeps its own. */
async function releaseCommitClaim(
  db: Firestore,
  manualRef: FirebaseFirestore.DocumentReference,
  requestId: string,
): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(manualRef)
      if (readClaim(snap.get("parse.commitClaim"))?.requestId !== requestId) return
      tx.set(manualRef, { parse: { commitClaim: null } }, { merge: true })
    })
  } catch (e) {
    // The caller is already failing; a failed release only costs the TTL.
    console.error(`[commitDraft] could not release commit claim on ${manualRef.path}:`, e)
  }
}

export async function commitDraft(db: Firestore, input: CommitInput): Promise<CommitResult> {
  const { homeId, manualId, requestId, now } = input
  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)

  const claim = await claimCommit(db, manualRef, requestId, now.getTime())
  if (claim.kind === "already_committed") return claim.result
  if (claim.kind === "in_progress") throw new CommitInProgressError(claim.heldBy)

  try {
    return await executeCommit(db, input, manualRef)
  } catch (e) {
    await releaseCommitClaim(db, manualRef, requestId)
    throw e
  }
}

async function executeCommit(
  db: Firestore,
  input: CommitInput,
  manualRef: FirebaseFirestore.DocumentReference,
): Promise<CommitResult> {
  const { homeId, manualId, item, requestId, chunks, now } = input

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
  // Each row carries its pre-rule self through applyHouseRules (which spreads
  // the row), so provenance can tell a house rule's rewrite from the manual's
  // value and from the reviewer's edit.
  const ruled = applyHouseRules(
    input.tasks.map((t) => ({ ...t, preRule: t as SuggestionRow })),
    activeRules,
    { freezeRiskFalse },
  )
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

  /**
   * Who set each of the four fields this commit writes, and the manual's
   * suggestion for them (decision C, step 1 — shared/tasks/fieldProvenance.ts).
   * Recorded only: what is WRITTEN is unchanged, so a re-scan still
   * overwrites the task's values exactly as before. Per field:
   *  - a house rule rewrote it (written ≠ the row before rules) → "system";
   *  - the manual's suggestion is unknown → null (unknown);
   *  - it is the manual's value → "manual";
   *  - otherwise the reviewer changed it in the review → "user" (their uid).
   */
  const provenanceOf = (t: (typeof tasks)[number]): { fieldSources: FieldSources<Timestamp>; manualSuggestion?: ManualSuggestion<Timestamp> } => {
    const written = rowValues(t)
    const pre = rowValues(t.preRule)
    const suggested =
      t.manual_suggestion_row === undefined ? pre : t.manual_suggestion_row === null ? null : rowValues(t.manual_suggestion_row)
    const fieldSources: Record<string, unknown> = {}
    for (const f of PROVENANCE_FIELDS) {
      const value = written[f]
      fieldSources[f] = !sameValue(f, value, pre[f])
        ? stampFor(f, { by: "system" }, "houseRule", value, nowTs)
        : suggested === null
          ? null
          : sameValue(f, value, suggested[f])
            ? stampFor(f, { by: "manual" }, "commitDraft", value, nowTs)
            : input.reviewerUid
              ? stampFor(f, { by: "user", uid: input.reviewerUid }, "parseReview", value, nowTs)
              : null
    }
    // An unknown suggestion (a reviewed row with no draft counterpart) writes
    // NO manualSuggestion, so a matched task keeps the one an earlier parse
    // recorded — the manual's last known word is still the best we have. A
    // new task gets null (unknown) at insert.
    return suggested
      ? { fieldSources: fieldSources as FieldSources<Timestamp>, manualSuggestion: { ...suggested, manualId, at: nowTs } }
      : { fieldSources: fieldSources as FieldSources<Timestamp> }
  }

  const templateDoc = (t: (typeof tasks)[number]) => ({
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
    // Whether this task reminds you — independent of priorityTier, so a
    // Recommended task can be given a reminder without inflating its priority.
    // null = the user never chose; shared/tasks/reviewBuckets applies the tier
    // default. Deliberately NOT denormalized onto taskInstances: nothing reads it
    // there yet, and an unread denorm copy is precisely how the agenda drifted
    // out of sync with its templates before.
    remindEnabled: t.remind_enabled ?? null,
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
      // The manual's stated range, when it gave one — drives the due window.
      intervalDaysMin: t.interval_days_min ?? null,
      intervalDaysMax: t.interval_days_max ?? null,
      anchorDate: today,
      season: seasonForTask(t),
      windowDaysBefore: 7,
      windowDaysAfter: 14,
    },
    ...provenanceOf(t),
    updatedAt: nowTs,
  })

  // matches: UPDATE in place (keep instances), re-stamp externalKey, reset missedScans.
  for (const m of plan.matches) {
    const t = tasks[m.incomingIndex]
    batch.set(templatesCol.doc(m.existingId), templateDoc(t), { merge: true })
  }

  // Tasks this ITEM already has from OTHER manuals. Reconciliation above is
  // deliberately scoped to THIS manual — a rescan of manual A must never delete
  // manual B's tasks — but that scope also made a second manual blind to what
  // was already there, so parsing a replacement PDF could only ADD. A tester
  // ended up with "Clean Baskets and Crisper Plates" twice, worded differently,
  // one from each attempt, and asked us to catch exactly this.
  //
  // Suppression, not deletion: we decline to CREATE a near-duplicate. Nothing
  // existing is touched, so the "never delete completion-bearing tasks"
  // invariant is untouched too.
  const otherSnap = await templatesCol
    .where("itemUnitId", "==", item.itemUnitId)
    .where("deletedAt", "==", null)
    .get()
  const otherTitles = otherSnap.docs
    .filter((d) => d.get("manualId") !== manualId)
    .map((d) => String(d.get("title") ?? ""))
    .filter(Boolean)

  const isCrossManualDuplicate = (title: string) =>
    otherTitles.some((existingTitle) => titleSimilarity(title, existingTitle) >= TITLE_MATCH_THRESHOLD)

  // inserts: new template + (for recurring) an initial scheduled instance w/ denorm.
  let inserted = 0
  let duplicatesSkipped = 0
  for (const i of plan.inserts) {
    const t = tasks[i]
    if (isCrossManualDuplicate(t.title)) {
      duplicatesSkipped++
      continue
    }
    const tplRef = templatesCol.doc()
    batch.set(tplRef, { manualSuggestion: null, ...templateDoc(t), createdAt: nowTs, userModifiedAt: null, deletedAt: null })
    inserted++
    // Seasonal tasks anchor to their season (winterize → next fall), NOT the
    // parse date — else a winterize task lands "due today" in July. Unknown-season
    // seasonal tasks get no due-now instance (the template still exists; it can be
    // scheduled once the season/feedback is known) rather than being dumped on today.
    //
    // Everything else starts ONE CADENCE FROM TODAY, not today. Seeding
    // dueDate=today put a tester's freshly parsed air purifier on Home with
    // seven tasks "due Today" — including a YEARLY HEPA replacement on an
    // appliance he had just added. Adding an item is the moment the clock
    // starts, not the moment everything falls due; assuming a backlog of
    // neglect is precisely the "never assert what we haven't verified" failure,
    // and it floods the agenda with urgency the user learns to ignore.
    //
    // AND THE CLOCK STARTS WHERE THE USER SAYS IT DOES. An appliance someone
    // has owned for eight months has a history the add date knows nothing
    // about; starting its filter schedule from today is as wrong in the other
    // direction as dumping it all on today was. `last_done_on` is their answer
    // to "have you been doing this already", and the next window comes off it
    // through the SAME addCadence — so a task last done outside its interval
    // lands with a target already behind it, which the due-window layer renders
    // as "been a while" rather than red. That is the honest reading, and it is
    // why this needed no special case.
    const anchor = t.last_done_on ?? today
    const initialDue: string | null =
      t.schedule_type === "seasonal"
        ? seasonalNextDue(seasonForTask(t) ?? "", today)
        : addCadence(anchor, t.schedule_type, t.interval_days ?? null)
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
        intervalDaysMin: t.interval_days_min ?? null,
        intervalDaysMax: t.interval_days_max ?? null,
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
      // The claim is released by the same write that records the commit, so
      // there is no window where this manual is committed but still claimed.
      parse: { committedRequestId: requestId, commitClaim: null },
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

  if (duplicatesSkipped > 0) {
    console.info("[commitDraft] skipped cross-manual duplicates", {
      itemUnitId: item.itemUnitId,
      manualId,
      duplicatesSkipped,
    })
  }

  return {
    chunks: chunks.length,
    tasks: tasks.length,
    matched: plan.matches.length,
    inserted,
    duplicatesSkipped,
    flagged: plan.flags.length,
    deleted: plan.deletes.length,
  }
}
