/**
 * classifyExistingTasks — port of v1 classify-existing-tasks. Re-runnable backfill
 * that classifies existing taskTemplates on 4 axes (is_reference / care_type /
 * schedule_type / symptom_tags) with a consequence-based rubric.
 *
 * v2 differences: schedule is INLINED on the template (schedule.scheduleType) —
 * there is no schedule_rule table — so the classifier reads/writes
 * schedule.scheduleType directly. Targets rows where justification == null AND
 * careTypeOverriddenAt == null AND deletedAt == null. dry_run returns the report;
 * apply writes (reference rows → isActive=false). The SYSTEM_PROMPT + the pure
 * parseClassifierOutput are ported VERBATIM (classification quality depends on it).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import Anthropic from "@anthropic-ai/sdk"
import { chargeAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"
const MODEL = "claude-haiku-4-5-20251001"
const BATCH_SIZE = 25

type CareType = "cleaning" | "maintenance" | "mixed"
const VALID_CARE_TYPES: CareType[] = ["cleaning", "maintenance", "mixed"]

type ScheduleType =
  | "after_each_use" | "weekly" | "monthly" | "quarterly" | "semiannual"
  | "annual" | "seasonal" | "every_n_days" | "as_needed" | "setup"
const VALID_SCHEDULE_TYPES: ScheduleType[] = [
  "after_each_use", "weekly", "monthly", "quarterly", "semiannual",
  "annual", "seasonal", "every_n_days", "as_needed", "setup",
]

const VALID_SYMPTOM_TAGS = [
  "vibration", "drainage", "electrical", "noise", "wont_start",
  "overheating", "leaking", "odor", "error_code", "wont_clean",
  "performance_drop", "physical_damage",
] as const
type SymptomTag = (typeof VALID_SYMPTOM_TAGS)[number]

const SYSTEM_PROMPT = `You classify recurring home-appliance tasks. Before classifying, you also detect rows that aren't actually recurring tasks at all — those get flagged for deactivation, not classification.

═══════════════════════════════════════════════════════════════════
AXIS 0 — is this actually a recurring task? (PRE-CHECK)
═══════════════════════════════════════════════════════════════════

Before classifying care_type and schedule_type, ask: "Is this a real recurring task, or operational reference content?"

A REAL TASK is something the user DOES TO the appliance on a recurring basis to keep it working / clean / safe / setup-correct:
- "Replace HVAC filter every 90 days" ✓
- "Run dishwasher clean cycle every 30 washes" ✓
- "Empty lint trap after each load" ✓
- "Wipe waveguide cover after each use" ✓ (still a real task even if classified as cleaning)
- "Verify washer is level" ✓ (setup task)
- "Test smoke detector battery quarterly" ✓
- "Check drain hose position and security" ✓
- "Inspect vents for blockage" ✓

OPERATIONAL REFERENCE is HOW-TO content describing how to USE the appliance — not maintenance, not cleaning, not setup. These rows should never have been task_template entries. Flag them:
- "Empty pockets and secure items before washing" ✗ (laundry technique)
- "Release gas buildup before refrigerating blended contents" ✗ (usage step)
- "Unload dishwasher in correct order" ✗ (usage technique)
- "Use oven probe for temperature monitoring" ✗ (feature instruction)
- "Add ingredients in correct order" ✗ (operating step)
- "Insert frozen pint into base before churning" ✗ (operating step)
- "Remove and replace oven racks" ✗ (operating instruction, not maintenance)

IMPORTANT CARVE-OUT — before-extended-absence / pre-vacation tasks ARE real tasks:
- "Empty and clean machine before extended non-use" ✓ (real task; event-triggered → as_needed, care_type=cleaning or maintenance depending on consequence)
- "Unplug unit before extended absence" ✓ (real task; safety/warranty concern → as_needed)
- Any task that tells the user to prepare the appliance before going away for an extended period IS a real task with an event trigger. Classify it as cleaning or maintenance (whichever applies) with schedule_type as_needed. Do NOT flag as reference.

CONSISTENCY RULE — same task, similar appliances:
When the same task title appears on two similar appliances (e.g., Range and Cafe Range), use consistent care_type classification unless you have specific manual context showing the consequence differs. If you classified a task as cleaning on one appliance, don't classify it as maintenance on an identical appliance without a clear reason from the manual text.

If a row is operational reference content, output:
  "proposed_is_reference": true
  And echo current_care_type and current_schedule_type unchanged (they don't matter — the row will be deactivated, not reclassified).

When proposed_is_reference is true, the apply path will set is_active=false on the task_template row. The row stays in the database for reversibility; it just stops showing up in the task feed. The information isn't lost — the user can still ask the AI about it via chat with the manual context.

DEFAULT: proposed_is_reference: false. Only flag this when the row is clearly NOT something the user would benefit from a recurring reminder about. When in doubt, keep the row as a real task.

═══════════════════════════════════════════════════════════════════
For rows where proposed_is_reference is FALSE, classify on TWO axes:
═══════════════════════════════════════════════════════════════════


═══════════════════════════════════════════════════════════════════
AXIS 1 — care_type (cleaning vs maintenance vs mixed)
═══════════════════════════════════════════════════════════════════

Apply this test: "If the user skips this for a year, what happens?"

- maintenance: function-preserving, warranty-relevant, or lifespan-affecting. Skipping damages the appliance, voids warranty, reduces efficiency, or causes failure. The word "clean" in the title does NOT automatically make a task cleaning — many cleaning actions (filter cleaning, descaling, run-cycles) are function-preserving maintenance.
- cleaning: cosmetic, hygienic, or "good practice that nobody actually does every use." Skipping affects appearance, not function (or has only slow/aggregate function effect).
- mixed: genuinely both — a maintenance action that includes cleaning steps as the method (e.g. "Inspect and clean condenser coils"). Use sparingly.

DEFAULT FOR SCHEDULED TASKS (weekly/monthly/quarterly/annual): when ambiguous, choose maintenance. False positives are visible and recoverable; false negatives hide real obligations.

SPECIAL RULE FOR HABIT-SHAPED TASKS (after_each_use, as_needed):
A "maintenance" label is only warranted when ALL THREE are true:
  1. Consequence is SHARP and IMMEDIATE (not "eventually" / "over time" / "aggregate buildup")
  2. Safety, warranty, or lifespan severity is real and specific
  3. The habit is REALISTIC for a typical user — i.e. people actually do this every use

If any one of these is missing → choose CLEANING. Preserve the consequence in the justification field so the user still gets the information ("food spatter buildup can pose fire risk over long periods") without it pressuring them as a maintenance obligation. The Habits & Reminders surface shows cleaning items too — softer treatment, same visibility.

This guards against the failure mode where a real-but-unrealistic habit (wipe waveguide every use, polish gasket every load) gets elevated to safety-critical maintenance and just becomes guilt-inducing noise the user ignores.

═══════════════════════════════════════════════════════════════════
AXIS 2 — schedule_type (when does this task happen?)
═══════════════════════════════════════════════════════════════════

CONSERVATIVE RULE: prefer keeping the current_schedule_type unchanged. Only propose a different schedule when the task description, manual content, or instructions clearly contradict the current schedule. If you're unsure, output the current value.

Categories:
- after_each_use: task happens after every use of the appliance ("after every load," "after each cycle," "after each use"). NOT a calendar cadence — too frequent to track on a schedule.
- as_needed: task is condition-triggered or "when you notice" ("as needed," "when debris accumulates," "if you see scale," "periodically" with no specific cadence). Reference content, not a tracked recurring task.
- weekly | monthly | quarterly | semiannual | annual | seasonal: task has a manufacturer-specified calendar cadence. Use ONLY when the manual states that exact cadence.
- every_n_days: task uses a custom interval (e.g. "every 30 wash cycles"). Don't propose this as a CHANGE — leave existing every_n_days values alone.
- setup: install-time task done ONCE when the appliance is set up; re-triggered only on disturbance (item moved/reinstalled) or symptom. NOT a recurring task. Routes to the Setup Checklist surface.

DETECT SETUP TASKS — propose schedule_type: "setup" when the task is clearly install-time:
- Leveling / orientation: "Level the washer," "Verify the unit sits flat"
- Position / connection: "Check drain hose position," "Verify gas connection," "Inspect water supply line"
- Grounding / electrical: "Verify proper grounding," "Confirm dedicated circuit"
- First-use ventilation / clearance: "Inspect vents for blockage" (if framed as install check)
- Calibration / first-run: "Calibrate before first use," "Run initial cycle empty"

DEFAULT: do NOT propose-change to "setup" unless the task clearly matches the patterns above. Most tasks remain recurring (calendar/habit/as_needed).

Common parser errors to look for and correct:
- A task with "as needed" / "when you notice" / "periodically" wording given a calendar cadence (weekly, monthly) — should be as_needed.
- A task that happens after every use given a calendar cadence — should be after_each_use.
- An install-time task (level, verify grounding, check drain hose) given annual/as_needed — should be setup.
- A task with a clear manufacturer cadence stated as as_needed — should match the manufacturer cadence.

When in doubt: output current_schedule_type unchanged. We'd rather under-correct than disrupt cadences that were already right.

═══════════════════════════════════════════════════════════════════
AXIS 3 — symptom_tags (the integration key for troubleshooting)
═══════════════════════════════════════════════════════════════════

For each task, propose 0–3 canonical symptom tags from this fixed list:
  vibration, drainage, electrical, noise, wont_start, overheating, leaking, odor,
  error_code, wont_clean, performance_drop, physical_damage

Tags connect setup tasks ↔ maintenance tasks ↔ knowledge chunks for the troubleshooting flow. A task gets a symptom tag when SKIPPING the task could plausibly cause that symptom, OR when the task is meant to FIX/PREVENT that symptom.

EXAMPLES:
- "Replace HVAC filter" → ["overheating", "performance_drop"]
- "Clean dishwasher filter" → ["drainage", "wont_clean", "odor"]
- "Run washing machine clean cycle" → ["odor", "performance_drop"]
- "Test smoke detector battery" → [] (safety task; no consumer-facing symptom fits)
- "Wipe exterior" → [] (cosmetic; no symptom)
- "Level the washer" (setup) → ["vibration", "noise"]
- "Inspect vents for blockage" (setup) → ["overheating", "performance_drop"]
- "Verify proper grounding" (setup) → ["electrical"]
- "Check drain hose position" (setup) → ["leaking"]

DEFAULT: empty array. Only tag a symptom when there's a clear cause-effect link.

═══════════════════════════════════════════════════════════════════
EXAMPLES (showing both axes — habit examples follow the realism rule)
═══════════════════════════════════════════════════════════════════

SCHEDULED tasks (default to maintenance when ambiguous):
- "Clean dishwasher filter monthly" → maintenance, monthly (sharp consequence: pump damage)
- "Run washing machine clean cycle every 30 washes" → maintenance, every_n_days (interval=30; biofilm; manufacturer-specified)
- "Replace HVAC filter every 90 days" → maintenance, every_n_days (efficiency loss; premature wear)
- "Test smoke detector battery quarterly" → maintenance, quarterly (safety; realistic schedule)
- "Inspect and clean condenser coils annually" → mixed, annual (inspect+clean; manufacturer cadence)
- "Polish stainless steel surfaces monthly" → cleaning, monthly (cosmetic; routes to Deep Clean)

HABIT-SHAPED tasks (apply the three-test rule):
- "Empty lint trap after each load" → maintenance + safety, after_each_use ✅ (sharp + safety + REALISTIC — people actually do this; preventable fire risk)
- "Wipe waveguide cover after each use" → cleaning, after_each_use (real fire risk over LONG periods of buildup, but unrealistic to expect every-use wipedown — preserve the consequence in justification: "Food spatter buildup over time can pose fire risk")
- "Wipe interior surfaces after each use" → cleaning, after_each_use (slow/aggregate consequence; cosmetic primary purpose)
- "Clean drawer guides as needed" → cleaning, as_needed (slow degradation; fix when felt)
- "Wipe exterior with damp cloth" → cleaning, as_needed (cosmetic only)
- "Don't overload washer" → cleaning, as_needed (informational; not really a task)

BEFORE-EXTENDED-ABSENCE tasks (event-triggered, as_needed — NOT references):
- "Empty and clean Nespresso before extended non-use" → cleaning, as_needed (real task; event trigger is travel/extended absence; preserves machine quality)
- "Unplug unit before extended absence" → maintenance, as_needed (real task; safety/warranty concern; event-triggered)
- "Run a cleaning cycle before storage" → maintenance, as_needed (real task; prevents scale/mold during dormancy)

═══════════════════════════════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════

Return ONLY a JSON array (no markdown, no commentary). For each input task:
{
  "task_template_id": "<echoed>",
  "proposed_is_reference": false,
  "proposed_care_type": "cleaning|maintenance|mixed",
  "proposed_schedule_type": "after_each_use|weekly|monthly|quarterly|semiannual|annual|seasonal|every_n_days|as_needed|setup",
  "proposed_symptom_tags": ["canonical_tag_or_empty"],
  "justification": "<one short sentence stating consequence of skipping, OR (when is_reference=true) a one-sentence reason this isn't a real recurring task>"
}

Every input task MUST have exactly one output entry. Pre-check first (is this even a real task?), then classify the remaining axes if it is. For habit-shaped tasks, default to cleaning unless ALL THREE habit-maintenance conditions are met. For scheduled tasks, default to maintenance when ambiguous. For schedule_type, echo current_schedule_type when ambiguous. For proposed_is_reference, default to false; only flag clear operational how-tos. For proposed_symptom_tags, default to empty array; only tag when there's a clear cause-effect link to a canonical symptom.`

interface ClassifierOutput {
  task_template_id: string
  proposed_is_reference: boolean
  proposed_care_type: CareType
  proposed_schedule_type: ScheduleType | null
  proposed_symptom_tags: SymptomTag[]
  justification: string
}

export interface ClassifyResultRow {
  task_template_id: string
  title: string
  item_name: string | null
  current_schedule_type: string | null
  proposed_schedule_type: string | null
  current_care_type: CareType
  proposed_care_type: CareType
  current_symptom_tags: string[]
  proposed_symptom_tags: string[]
  justification: string
  care_change: boolean
  schedule_change: boolean
  symptom_tags_change: boolean
  proposed_is_reference: boolean
  change: boolean
}

/** Set-equality comparison for two string arrays. Order-independent, dedupe-safe. */
export function arraysEqualSet(a: readonly string[], b: readonly string[]): boolean {
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const v of setA) if (!setB.has(v)) return false
  return true
}

/** Pure core — ported verbatim from v1. Tolerates fences/prose; validates each
 *  entry against the taxonomies. Returns null if nothing usable parsed. */
export function parseClassifierOutput(text: string): ClassifierOutput[] | null {
  let trimmed = text.trim()
  if (trimmed.startsWith("```")) {
    trimmed = trimmed.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
  }
  const arrStart = trimmed.indexOf("[")
  const arrEnd = trimmed.lastIndexOf("]")
  if (arrStart === -1 || arrEnd === -1 || arrEnd < arrStart) return null
  const slice = trimmed.slice(arrStart, arrEnd + 1)

  let raw: unknown
  try {
    raw = JSON.parse(slice)
  } catch {
    return null
  }
  if (!Array.isArray(raw)) return null

  const out: ClassifierOutput[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const obj = item as Record<string, unknown>
    const id = typeof obj.task_template_id === "string" ? obj.task_template_id : null
    const careType = typeof obj.proposed_care_type === "string" ? obj.proposed_care_type : null
    const scheduleType = typeof obj.proposed_schedule_type === "string" ? obj.proposed_schedule_type : null
    const justification = typeof obj.justification === "string" ? obj.justification.trim() : ""
    const isReference = obj.proposed_is_reference === true
    if (!id || !careType || !VALID_CARE_TYPES.includes(careType as CareType)) continue
    if (!justification) continue
    const validSchedule =
      scheduleType && VALID_SCHEDULE_TYPES.includes(scheduleType as ScheduleType) ? (scheduleType as ScheduleType) : null
    const rawTags = Array.isArray(obj.proposed_symptom_tags) ? obj.proposed_symptom_tags : []
    const symptomTags = [
      ...new Set(
        rawTags
          .filter((s): s is string => typeof s === "string")
          .filter((s) => (VALID_SYMPTOM_TAGS as readonly string[]).includes(s)),
      ),
    ].slice(0, 3) as SymptomTag[]
    out.push({
      task_template_id: id,
      proposed_is_reference: isReference,
      proposed_care_type: careType as CareType,
      proposed_schedule_type: validSchedule,
      proposed_symptom_tags: symptomTags,
      justification: justification.slice(0, 500),
    })
  }
  return out.length > 0 ? out : null
}

type TemplateRow = {
  id: string
  title: string
  description: string | null
  instructions: string | null
  careType: CareType
  symptomTags: string[]
  scheduleType: string | null
  itemUnitId: string | null
}

function buildUserPrompt(batch: TemplateRow[], itemMap: Map<string, string>): string {
  const payload = batch.map((t) => ({
    task_template_id: t.id,
    item: t.itemUnitId ? itemMap.get(t.itemUnitId) ?? "(unknown item)" : "(home-level task)",
    title: t.title,
    description: t.description ?? null,
    instructions: t.instructions ? t.instructions.slice(0, 600) : null,
    current_care_type: t.careType,
    current_schedule_type: t.scheduleType,
    current_symptom_tags: t.symptomTags,
  }))
  return `Classify the following ${batch.length} tasks on all axes (is_reference, care_type, schedule_type, symptom_tags). Return a JSON array of length ${batch.length}, with one object per task in the same order. Echo the task_template_id exactly.

Reminders:
- Prefer keeping current_schedule_type unchanged when ambiguous; only propose a schedule change when you're confident.
- Only propose schedule_type "setup" when the task clearly matches install-time patterns (level/verify/check at install).
- For symptom_tags, default to empty array; only tag when there's a clear cause-effect link to a canonical symptom.

${JSON.stringify(payload, null, 2)}`
}

export const classifyExistingTasks = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
    const { homeId, dryRun: dryRunRaw, results: precomputed } = (request.data ?? {}) as {
      homeId?: string
      dryRun?: boolean
      results?: ClassifyResultRow[]
    }
    if (!homeId) throw new HttpsError("invalid-argument", "homeId is required")
    const dryRun = dryRunRaw !== false // default true for safety

    const db = getFirestore()
    const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
    if (!member.exists) throw new HttpsError("permission-denied", "Forbidden — not a member of this home")

    const templatesCol = db.collection(`homes/${homeId}/taskTemplates`)

    let results: ClassifyResultRow[]
    const precomputedResults =
      !dryRun && Array.isArray(precomputed) && precomputed.length > 0 ? precomputed : null

    if (precomputedResults) {
      results = precomputedResults
    } else {
      // Candidate rows: justification null + no override + not deleted.
      const snap = await templatesCol
        .where("justification", "==", null)
        .where("careTypeOverriddenAt", "==", null)
        .where("deletedAt", "==", null)
        .get()
      const rows: TemplateRow[] = snap.docs.map((d) => ({
        id: d.id,
        title: (d.get("title") as string) ?? "",
        description: (d.get("description") as string | null) ?? null,
        instructions: (d.get("instructionsOverride") as string | null) ?? null,
        careType: ((d.get("careType") as CareType) ?? "maintenance"),
        symptomTags: Array.isArray(d.get("symptomTags")) ? (d.get("symptomTags") as string[]) : [],
        scheduleType: (d.get("schedule")?.scheduleType as string | null) ?? null,
        itemUnitId: (d.get("itemUnitId") as string | null) ?? null,
      }))
      if (rows.length === 0) {
        return { ok: true, dry_run: dryRun, total: 0, changes: 0, results: [], writes: 0 }
      }
      // Quota only on the Claude path — applying precomputed results costs nothing.
      // Item display names for context.
      const itemMap = new Map<string, string>()
      const itemIds = [...new Set(rows.map((r) => r.itemUnitId).filter((x): x is string => !!x))]
      await Promise.all(
        itemIds.map(async (id) => {
          const it = await db.doc(`homes/${homeId}/items/${id}`).get()
          if (it.exists) itemMap.set(id, (it.get("displayName") as string) ?? "")
        }),
      )

      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const allOutputs = new Map<string, ClassifierOutput>()
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        // Charged per batch, not per request: this loop makes one Claude call
        // for every BATCH_SIZE tasks, so a big backlog is a big bill. A single
        // charge up front priced a 500-task home the same as a 10-task one.
        const hold = await chargeAiQuota(db, uid, "classifyExistingTasks")
        let res: Anthropic.Message
        try {
          res = await client.messages.create({
            model: MODEL,
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: buildUserPrompt(batch, itemMap) }],
          })
        } catch (e) {
          // No output, no charge.
          await hold.refund()
          throw e
        }
        const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("")
        const parsed = parseClassifierOutput(text)
        // Not refunded: Claude answered, we were billed, it just answered badly.
        if (!parsed) throw new HttpsError("unavailable", "Classifier returned malformed JSON")
        for (const entry of parsed) allOutputs.set(entry.task_template_id, entry)
      }

      const computed: ClassifyResultRow[] = []
      for (const t of rows) {
        const out = allOutputs.get(t.id)
        if (!out) continue
        const currentSchedule = t.scheduleType
        const proposedSchedule = out.proposed_schedule_type ?? currentSchedule
        // Never propose a change INTO every_n_days (no interval context).
        const safeProposedSchedule =
          proposedSchedule === "every_n_days" && currentSchedule !== "every_n_days" ? currentSchedule : proposedSchedule
        const isReference = out.proposed_is_reference === true
        const careChange = !isReference && out.proposed_care_type !== t.careType
        const scheduleChange = !isReference && safeProposedSchedule !== null && safeProposedSchedule !== currentSchedule
        const currentTags = t.symptomTags
        const proposedTags = isReference ? currentTags : out.proposed_symptom_tags
        const symptomTagsChange = !isReference && !arraysEqualSet(currentTags, proposedTags)
        computed.push({
          task_template_id: t.id,
          title: t.title,
          item_name: t.itemUnitId ? itemMap.get(t.itemUnitId) ?? null : null,
          current_schedule_type: currentSchedule,
          proposed_schedule_type: isReference ? currentSchedule : safeProposedSchedule,
          current_care_type: t.careType,
          proposed_care_type: isReference ? t.careType : out.proposed_care_type,
          current_symptom_tags: currentTags,
          proposed_symptom_tags: proposedTags,
          justification: out.justification,
          care_change: careChange,
          schedule_change: scheduleChange,
          symptom_tags_change: symptomTagsChange,
          proposed_is_reference: isReference,
          change: careChange || scheduleChange || symptomTagsChange || isReference,
        })
      }
      results = computed
    }

    const summary = {
      changes: results.filter((r) => r.change).length,
      care_changes: results.filter((r) => r.care_change).length,
      schedule_changes: results.filter((r) => r.schedule_change).length,
      symptom_tag_changes: results.filter((r) => r.symptom_tags_change).length,
      reference_count: results.filter((r) => r.proposed_is_reference).length,
    }

    if (dryRun) {
      return { ok: true, dry_run: true, total: results.length, ...summary, writes: 0, results }
    }

    // Apply. Idempotency guard: only write rows still justification==null &
    // careTypeOverriddenAt==null (re-read inside a transaction per row).
    const now = FieldValue.serverTimestamp()
    let writes = 0
    for (const r of results) {
      const ref = templatesCol.doc(r.task_template_id)
      const ok = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) return false
        if (snap.get("justification") != null || snap.get("careTypeOverriddenAt") != null) return false
        if (r.proposed_is_reference) {
          tx.set(ref, { isActive: false, justification: r.justification, updatedAt: now }, { merge: true })
          return true
        }
        const update: Record<string, unknown> = { justification: r.justification, updatedAt: now }
        if (r.care_change) update.careType = r.proposed_care_type
        if (r.symptom_tags_change) update.symptomTags = r.proposed_symptom_tags
        if (r.schedule_change && r.proposed_schedule_type) {
          update["schedule.scheduleType"] = r.proposed_schedule_type
          update["schedule.intervalDays"] = null
        }
        tx.update(ref, update)
        return true
      })
      if (ok) writes++
    }

    return { ok: true, dry_run: false, total: results.length, ...summary, writes, results }
  },
)
