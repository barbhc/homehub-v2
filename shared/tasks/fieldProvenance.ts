/**
 * Per-field provenance on a task template — owner decision C, step 1
 * (docs/decisions/task-consistency-decisions.md §C, "Keep mine, show
 * differences").
 *
 * For each of the four fields a re-scan used to overwrite — priority
 * (`priorityTier`), cadence (`schedule`: type, interval, season), reminder
 * (`remindEnabled`) and kind (`careType`) — a template records WHO set the
 * value it holds now, and the manual's latest suggestion for it:
 *
 *   fieldSources: {
 *     priorityTier?:  FieldSource | null,
 *     schedule?:      FieldSource | null,
 *     remindEnabled?: FieldSource | null,
 *     careType?:      FieldSource | null,
 *   }
 *   FieldSource = { by: "manual" | "user" | "system",
 *                   uid: string | null,       // the member, iff by === "user"
 *                   at:  Timestamp,
 *                   via: ProvenanceVia,       // which writer stamped it
 *                   value: <the value stamped> }
 *
 *   manualSuggestion: { priorityTier, careType, remindEnabled,
 *                       schedule: { scheduleType, intervalDays, season },
 *                       manualId, at } | null
 *
 * Step 1 only RECORDS. Nothing reads these to decide anything yet, and the
 * re-scan still overwrites exactly as before (it now also refreshes
 * `manualSuggestion` and stamps "manual"). Step 2 switches the re-scan to
 * update only the suggestion and shows "You chose X · the manual now says Y".
 *
 * WHY EACH STAMP CARRIES ITS `value`. A stamp is a claim about the value next
 * to it, and any writer that changes the value without restamping — an ops
 * script, the v1 import, a functions build older than this, a writer added
 * later that forgets — would leave a stamp describing a value that is gone.
 * `sourceOf` therefore trusts a stamp only while its `value` still equals the
 * stored field; otherwise the provenance is unknown. Un-stamped writers fail
 * SAFE (unknown), never into a confident wrong "you chose this". This is the
 * denormalized-drift lesson (denormSync.ts) applied up front.
 *
 * Missing provenance — every task written before this shipped — is unknown.
 * Whether a task with `userModifiedAt` should count as the owner's for all
 * four fields is the open step-2 question; nothing here guesses.
 *
 * WHO "by" names (the rule every writer follows; docs/firestore-model.md §2):
 *  - "user":   a signed-in member acted on THIS task's field — an editor, a
 *              confirmed sweep row, accepting a value offered on screen
 *              (a proposed reminder, a library backstop), or creating the
 *              task with values they picked.
 *  - "manual": the parser wrote it from a manual (commitDraft): the model's
 *              value after the deterministic taxonomy, or a review row the
 *              reviewer left as the draft had it.
 *  - "system": a rule or default nobody chose for this task: a learned house
 *              rule re-applied at parse time, the AI classifier backfill, the
 *              library's defaults on a task added from it, a placeholder
 *              written at creation.
 *
 * Pure — no Firestore — so the client services and the Functions both stamp
 * and read through it. Timestamps are generic (`At`): the web SDK writes a
 * serverTimestamp() sentinel, the Admin SDK a Timestamp.
 */
import { looksLikeSetupStep } from "./houseRules.js"
import { isCadenceSeason, type CadenceSeason } from "./cadenceChange.js"

export const PROVENANCE_FIELDS = ["priorityTier", "schedule", "remindEnabled", "careType"] as const
export type ProvenanceField = (typeof PROVENANCE_FIELDS)[number]

export type ProvenanceBy = "manual" | "user" | "system"

/** The writer that stamped a field — one name per code path, so a stamp can
 *  be traced to the exact function that wrote it. */
export type ProvenanceVia =
  | "commitDraft" // the parser (worker or reviewed commit): the manual's value
  | "parseReview" // a reviewer's edit to a draft row, committed by commitManualDraft
  | "houseRule" // a learned house rule re-applied during a parse
  | "setTaskReminder" // the reminder switch (task page, Your reminders)
  | "setTaskCadence" // Your reminders, a library backstop the user accepted, a custom task's cadence
  | "updateTaskSchedule" // "This isn't right" feedback (primary + the similar tasks she ticked)
  | "updateTaskCareType"
  | "saveItemTaskReview" // Review tasks on an item
  | "applyCleanupPlan" // the confirm-first cleanup sweep
  | "createTaskTemplate"
  | "createScheduleRule" // the add-item Plan step's cadence (createTasksFromEditable)
  | "routineTemplate" // Settings / Deep clean routines
  | "library" // a task added from the care library
  | "classifyExistingTasks" // the admin AI backfill

/** The cadence as provenance sees it: the three stored parts a person picks. */
export interface CadenceValue {
  scheduleType: string | null
  intervalDays: number | null
  season: string | null
}

export interface ProvenanceValues {
  priorityTier: string | null
  schedule: CadenceValue
  remindEnabled: boolean | null
  careType: string | null
}

export type ProvenanceValue<F extends ProvenanceField> = ProvenanceValues[F]

export interface FieldSource<At = unknown, V = unknown> {
  by: ProvenanceBy
  /** The member who set it; null unless `by` is "user". */
  uid: string | null
  at: At
  via: ProvenanceVia
  /** The value this stamp describes (see the file header). */
  value: V
}

export type FieldSources<At = unknown> = {
  [F in ProvenanceField]?: FieldSource<At, ProvenanceValue<F>> | null
}

/** The manual's latest suggestion for the four fields, from the most recent
 *  parse of `manualId` that matched this task. */
export interface ManualSuggestion<At = unknown> extends ProvenanceValues {
  manualId: string
  at: At
}

/** Who is stamping: a member, the parser, or a named rule. */
export type ProvenanceActor =
  | { by: "user"; uid: string }
  | { by: "manual" }
  | { by: "system" }

const nul = <T>(v: T | null | undefined): T | null => (v === undefined ? null : v)

/** A cadence normalized for comparison and storage: every part present. */
export function cadenceValue(s: { scheduleType?: unknown; intervalDays?: unknown; season?: unknown } | null | undefined): CadenceValue {
  return {
    scheduleType: typeof s?.scheduleType === "string" ? s.scheduleType : null,
    intervalDays: typeof s?.intervalDays === "number" ? s.intervalDays : null,
    season: typeof s?.season === "string" ? s.season : null,
  }
}

/** The four values as a template document stores them (camelCase). */
export function storedValues(tpl: Record<string, unknown> | null | undefined): ProvenanceValues {
  return {
    priorityTier: typeof tpl?.priorityTier === "string" ? tpl.priorityTier : null,
    schedule: cadenceValue(tpl?.schedule as Record<string, unknown> | null | undefined),
    remindEnabled: typeof tpl?.remindEnabled === "boolean" ? tpl.remindEnabled : null,
    careType: typeof tpl?.careType === "string" ? tpl.careType : null,
  }
}

/** Strict equality of one field's value: every stored part, nulls normalized. */
export function sameValue<F extends ProvenanceField>(field: F, a: ProvenanceValue<F> | undefined, b: ProvenanceValue<F> | undefined): boolean {
  if (field === "schedule") {
    const x = cadenceValue(a as CadenceValue | undefined)
    const y = cadenceValue(b as CadenceValue | undefined)
    return x.scheduleType === y.scheduleType && x.intervalDays === y.intervalDays && x.season === y.season
  }
  return nul(a) === nul(b)
}

/** One field's stamp. Always writes every key, so a set(merge) — which
 *  deep-merges maps — can never leave a previous stamp's `uid` behind. */
export function stampFor<F extends ProvenanceField, At>(
  field: F,
  actor: ProvenanceActor,
  via: ProvenanceVia,
  value: ProvenanceValue<F>,
  at: At,
): FieldSource<At, ProvenanceValue<F>> {
  const v = field === "schedule" ? (cadenceValue(value as CadenceValue) as ProvenanceValue<F>) : (nul(value) as ProvenanceValue<F>)
  return { by: actor.by, uid: actor.by === "user" ? actor.uid : null, at, via, value: v }
}

/**
 * The `fieldSources` patch for a set(merge) / transaction set(merge): one
 * stamp per field in `values`, nested (never dotted keys — under set(merge) a
 * dotted key is a literal field NAME). Fields absent from `values` are not
 * touched. Returns {} when there is nothing to stamp.
 */
export function provenancePatch<At>(
  actor: ProvenanceActor,
  via: ProvenanceVia,
  values: Partial<ProvenanceValues>,
  at: At,
): { fieldSources?: FieldSources<At> } {
  const out: FieldSources<At> = {}
  let any = false
  for (const f of PROVENANCE_FIELDS) {
    if (!(f in values)) continue
    // Each branch is typed to its field; a loop over the union can't be.
    if (f === "priorityTier") out.priorityTier = stampFor("priorityTier", actor, via, nul(values.priorityTier), at)
    else if (f === "schedule") out.schedule = stampFor("schedule", actor, via, cadenceValue(values.schedule), at)
    else if (f === "remindEnabled") out.remindEnabled = stampFor("remindEnabled", actor, via, nul(values.remindEnabled), at)
    else out.careType = stampFor("careType", actor, via, nul(values.careType), at)
    any = true
  }
  return any ? { fieldSources: out } : {}
}

/** The same stamps as dotted paths, for Admin/web `update()` — which REPLACES
 *  a nested map given whole, so `{ fieldSources: {...} }` there would wipe the
 *  other fields' stamps. */
export function provenanceUpdatePaths<At>(
  actor: ProvenanceActor,
  via: ProvenanceVia,
  values: Partial<ProvenanceValues>,
  at: At,
): Record<string, FieldSource<At>> {
  const patch = provenancePatch(actor, via, values, at).fieldSources ?? {}
  const out: Record<string, FieldSource<At>> = {}
  for (const [f, stamp] of Object.entries(patch)) if (stamp) out[`fieldSources.${f}`] = stamp as FieldSource<At>
  return out
}

/** The fields whose value differs between two value sets (a review row vs the
 *  stored task, say) — the only fields a re-saving editor may stamp. */
export function changedFields(before: ProvenanceValues, after: Partial<ProvenanceValues>): ProvenanceField[] {
  return PROVENANCE_FIELDS.filter((f) => f in after && !sameValue(f, before[f], after[f] as never))
}

/** `values` restricted to `fields`. */
export function pick(values: Partial<ProvenanceValues>, fields: readonly ProvenanceField[]): Partial<ProvenanceValues> {
  const out: Partial<ProvenanceValues> = {}
  for (const f of fields) if (f in values) (out as Record<string, unknown>)[f] = values[f]
  return out
}

/**
 * Who set this field's CURRENT value, or null when unknown: no stamp (every
 * task from before provenance), a malformed one, or a stamp whose `value` no
 * longer matches the stored field (a writer changed it without restamping).
 * The one reader rule — step 2 decides through this.
 */
export function sourceOf<F extends ProvenanceField>(
  tpl: Record<string, unknown> | null | undefined,
  field: F,
): FieldSource<unknown, ProvenanceValue<F>> | null {
  const all = tpl?.fieldSources as Record<string, unknown> | null | undefined
  const raw = all && typeof all === "object" ? (all[field] as Record<string, unknown> | null | undefined) : null
  if (!raw || typeof raw !== "object") return null
  const by = raw.by
  if (by !== "manual" && by !== "user" && by !== "system") return null
  if (by === "user" && (typeof raw.uid !== "string" || raw.uid === "")) return null
  if (!("value" in raw)) return null
  if (!sameValue(field, raw.value as ProvenanceValue<F>, storedValues(tpl)[field])) return null
  return raw as unknown as FieldSource<unknown, ProvenanceValue<F>>
}

// ── The reviewed-draft commit (commitManualDraft) ────────────────────────────

/** The fields of a parser draft row the review's untouched values come from. */
export interface DraftRowLike {
  title: string
  description?: string | null
  tags?: string[] | null
  instructions_override?: string | null
  instructions_text?: string | null
  care_type?: string | null
  priority_tier?: string | null
  schedule_type?: string | null
  interval_days?: number | null
  season?: string | null
  remind_enabled?: boolean | null
}

/**
 * A parser draft row as the review sheet sends it back when the reviewer
 * leaves it alone — so commitManualDraft can tell what the REVIEWER changed
 * from what the manual said. Mirrors, deliberately and only:
 *  - reviewRows.correctDraft: a step that reads as first-use setup is moved
 *    to `setup` before anyone sees it (a deterministic correction of the
 *    parser, so still the manual's suggestion);
 *  - TaskReviewSheet.handleSave: kind is cleaning or maintenance (a draft's
 *    "mixed" goes back as maintenance); the reminder is "never chose";
 *  - normalizeTaskRow: an interval survives only on every_n_days;
 *  - commitManualDraft: a season counts only on a seasonal row (the sheet
 *    sends the draft's own season back, `null` when it had none, and the
 *    commit then infers it from the title for both sides alike).
 * src/components/manuals/reviewProvenance.test.ts pins it to rowsFrom.
 */
export function draftRowAsReviewed(d: DraftRowLike): {
  title: string
  description: string | null
  tags: string[]
  care_type: string
  priority_tier: string
  schedule_type: string
  interval_days: number | null
  season: CadenceSeason | null
  remind_enabled: boolean | null
} {
  const schedule = d.schedule_type ?? "as_needed"
  const text = [d.title, d.description ?? "", d.instructions_text ?? d.instructions_override ?? ""].join(" ")
  const scheduleType = schedule !== "setup" && looksLikeSetupStep(text) ? "setup" : schedule
  return {
    title: d.title,
    description: d.description ?? null,
    tags: Array.isArray(d.tags) ? d.tags : [],
    care_type: d.care_type === "cleaning" ? "cleaning" : "maintenance",
    priority_tier: d.priority_tier ?? "recommended",
    schedule_type: scheduleType,
    interval_days: scheduleType === "every_n_days" && typeof d.interval_days === "number" ? d.interval_days : null,
    season: scheduleType === "seasonal" && isCadenceSeason(d.season) ? d.season : null,
    remind_enabled: null,
  }
}

/**
 * For each reviewed row, the draft row it came from, as an untouched review
 * would have sent it — or null when no draft row has its title (the manual's
 * suggestion is then unknown). Titles are the key because the review has no
 * title editor and a fresh draft has no ids; each draft row pairs once.
 */
export function pairReviewedWithDraft(
  reviewedTitles: string[],
  draft: DraftRowLike[],
): (ReturnType<typeof draftRowAsReviewed> | null)[] {
  const used = new Set<number>()
  return reviewedTitles.map((title) => {
    const i = draft.findIndex((d, j) => !used.has(j) && d.title === title)
    if (i < 0) return null
    used.add(i)
    return draftRowAsReviewed(draft[i])
  })
}
