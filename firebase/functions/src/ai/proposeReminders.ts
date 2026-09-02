/**
 * proposeReminders — "Tell us what you want to stay on top of" → a shortlist
 * drawn ONLY from the home's existing task templates.
 *
 * Shape follows classifyExistingTasks (auth → membership → quota with refund
 * on throw) with two deliberate differences:
 *
 *  1. A FORCED tool call (makeCallClaudeTool), not JSON-in-text. The Boundary
 *     rule: structured output from a model is a tool call with a schema.
 *  2. ZERO writes, by construction. There is no dryRun flag because there is
 *     nothing to dry-run: the callable returns proposals and the client
 *     applies "Turn these on" through the audited writers (setTaskReminder,
 *     setTaskCadence). Curation can never delete or hide the corpus from here.
 *
 * "Existing templates only" is enforced server-side, never trusted: every id
 * the model returns is checked against the fetched set and dropped otherwise.
 *
 * And not every existing template is a candidate. Seen live 2026-09-02:
 * "Descale the Machine · Nespresso Coffee · when needed" was proposed, ticked
 * and turned on — and could never notify, because a task with no recurring
 * schedule never produces a due occurrence. The client's pick list already
 * refused such tasks (`offerable` in YourReminders.tsx); this path now applies
 * the same two rules BEFORE the model sees the list, so it cannot propose what
 * the lanes would never send.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { withAiQuota } from "../lib/quota.js"
import { makeCallClaudeTool, type CallClaudeTool } from "./claude.js"
import { isRecurring, RECURRING_SCHEDULES } from "../../../../shared/tasks/reviewBuckets.js"
import { isAgendaEligible } from "../../../../shared/tasks/agendaEligibility.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"
const MODEL = "claude-haiku-4-5-20251001"
export const MAX_PROPOSALS = 15
const MAX_TEMPLATES = 400
const MAX_FOCUS_CHARS = 2000

export type TemplateRow = {
  id: string
  title: string
  itemName: string | null
  careType: string | null
  scopeType: string | null
  priorityTier: string
  scheduleType: string | null
  intervalDays: number | null
  remindEnabled: boolean | null
}

export type ProposedRow = {
  task_template_id: string
  title: string
  item_name: string | null
  reason: string
  current_schedule_type: string | null
  current_interval_days: number | null
  suggested_schedule_type: string | null
  suggested_interval_days: number | null
  remind_already_on: boolean
  priority_tier: string
}

/**
 * What the model may be OFFERED — the same two rules as the client's pick list
 * (`offerable`, src/pages/YourReminders.tsx), for the same reason:
 *
 * 1. Only tasks that recur. A reminder is a promise about WHEN; as_needed,
 *    after_each_use, setup and unscheduled tasks never come due, so a reminder
 *    on one is a silent no-op. Nothing is deleted — they stay on the item page.
 * 2. Only tasks that would actually notify. The week and the push lanes read
 *    the agenda, which excludes item-scoped cleaning by the owner's rule.
 */
export function offerableRow(r: Pick<TemplateRow, "scheduleType" | "careType" | "scopeType">): boolean {
  return isRecurring(r.scheduleType) && isAgendaEligible({ careType: r.careType, scopeType: r.scopeType })
}

export const PROPOSE_TOOL = {
  name: "propose_reminders",
  description: "Choose which of the home's EXISTING tasks match what the owner said they want to stay on top of.",
  input_schema: {
    type: "object",
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        maxItems: MAX_PROPOSALS,
        items: {
          type: "object",
          required: ["task_template_id", "reason"],
          properties: {
            task_template_id: { type: "string", description: "An id from the provided task list. Never invent one." },
            reason: { type: "string", description: "One calm sentence, in the owner's own terms, on why this matches. No urgency, no 'should'." },
            // Only cadences that come due. A reminder cannot be "as needed".
            suggested_schedule_type: { type: "string", enum: [...RECURRING_SCHEDULES] },
            suggested_interval_days: { type: "number", description: "Only with every_n_days." },
          },
        },
      },
    },
  },
} as const

const SYSTEM_PROMPT = `You help a homeowner pick a SHORT list of recurring reminders from tasks Homehub already knows about their home.

Rules:
- Propose ONLY task_template_ids from the list you are given. Never invent a task or an id.
- Pick what matches what they said they care about — their words, their priorities. Cover each thing they named with the closest existing task; skip what they did not mention unless it is clearly the same concern.
- Prefer at most ${MAX_PROPOSALS}. Fewer, well-matched, beats many.
- Keep the task's current schedule unless the owner clearly asked for a different rhythm; if you suggest every_n_days you must give suggested_interval_days.
- reason: one calm sentence, no urgency, no "you should".`

function buildUserPrompt(rows: TemplateRow[], focusText: string): string {
  const list = rows.map((r) => ({
    task_template_id: r.id,
    title: r.title,
    item: r.itemName,
    kind: r.careType,
    tier: r.priorityTier,
    schedule: r.scheduleType,
    interval_days: r.intervalDays,
    reminder_on: r.remindEnabled === true,
  }))
  return `What the owner said they want to stay on top of:\n"""${focusText}"""\n\nTasks Homehub already has for this home (choose from these ids only):\n${JSON.stringify(list)}`
}

/**
 * The testable core: rows + the owner's words + a (possibly fake) tool call →
 * validated proposals. Every safety rule lives here, not in the prompt: the
 * offerable filter runs here too, so a caller that forgets it still cannot
 * put a "when needed" task in front of the model, and an id for one is
 * dropped on the way back exactly like a hallucinated id.
 */
export async function proposeCore(rows: TemplateRow[], focusText: string, callTool: CallClaudeTool): Promise<ProposedRow[]> {
  const offered = rows.filter(offerableRow)
  // Nothing to choose from → nothing to ask. The model is not called.
  if (offered.length === 0) return []
  const byId = new Map(offered.map((r) => [r.id, r]))
  const raw = await callTool({
    model: MODEL,
    maxTokens: 2048,
    system: SYSTEM_PROMPT,
    tool: PROPOSE_TOOL as unknown as Record<string, unknown>,
    content: [{ type: "text", text: buildUserPrompt(offered, focusText) }],
  })
  const list = Array.isArray((raw as { proposals?: unknown })?.proposals) ? ((raw as { proposals: unknown[] }).proposals) : []

  const seen = new Set<string>()
  const out: ProposedRow[] = []
  for (const p of list) {
    if (!p || typeof p !== "object") continue
    const o = p as Record<string, unknown>
    const id = typeof o.task_template_id === "string" ? o.task_template_id : null
    if (!id || seen.has(id)) continue
    const row = byId.get(id)
    if (!row) continue // hallucinated, not in this home, or not offerable — dropped, never trusted
    seen.add(id)

    // A suggested cadence must itself come due: as_needed / after_each_use /
    // setup are refused here even though the schema never offers them.
    let sched = typeof o.suggested_schedule_type === "string" && isRecurring(o.suggested_schedule_type)
      ? o.suggested_schedule_type : null
    let interval = typeof o.suggested_interval_days === "number" && Number.isFinite(o.suggested_interval_days) && o.suggested_interval_days > 0
      ? Math.round(o.suggested_interval_days) : null
    // every_n_days without an interval is not a schedule — mirror classify's guard.
    if (sched === "every_n_days" && interval == null) { sched = null; interval = null }
    if (sched === row.scheduleType && (sched !== "every_n_days" || interval === row.intervalDays)) { sched = null; interval = null }
    if (sched !== "every_n_days") interval = null

    out.push({
      task_template_id: id,
      title: row.title,
      item_name: row.itemName,
      reason: typeof o.reason === "string" && o.reason.trim() ? o.reason.trim() : "Matches what you said you care about.",
      current_schedule_type: row.scheduleType,
      current_interval_days: row.intervalDays,
      suggested_schedule_type: sched,
      suggested_interval_days: interval,
      remind_already_on: row.remindEnabled === true,
      priority_tier: row.priorityTier,
    })
    if (out.length >= MAX_PROPOSALS) break
  }
  return out
}

export const proposeReminders = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 },
  async (request) => {
    const uid = request.auth?.uid
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
    const { homeId, focusText } = (request.data ?? {}) as { homeId?: unknown; focusText?: unknown }
    if (typeof homeId !== "string" || !homeId) throw new HttpsError("invalid-argument", "homeId is required")
    if (typeof focusText !== "string" || !focusText.trim()) throw new HttpsError("invalid-argument", "Tell us what you want to stay on top of.")
    if (focusText.length > MAX_FOCUS_CHARS) throw new HttpsError("invalid-argument", `Keep it under ${MAX_FOCUS_CHARS} characters.`)

    const db = getFirestore()
    const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
    if (!member.exists) throw new HttpsError("permission-denied", "Forbidden — not a member of this home")

    // Active templates + item names. Read once; cap so one runaway home cannot
    // turn a shortlist into a 10k-token prompt.
    const [tplSnap, itemSnap] = await Promise.all([
      db.collection(`homes/${homeId}/taskTemplates`).where("deletedAt", "==", null).get(),
      db.collection(`homes/${homeId}/items`).where("deletedAt", "==", null).get(),
    ])
    const itemName = new Map(itemSnap.docs.map((d) => [d.id, (d.get("displayName") as string | null) ?? null]))
    const rows: TemplateRow[] = tplSnap.docs
      .filter((d) => d.get("isActive") !== false)
      .slice(0, MAX_TEMPLATES)
      .map((d) => {
        const sched = d.get("schedule") as { scheduleType?: string | null; intervalDays?: number | null } | null
        const re = d.get("remindEnabled")
        return {
          id: d.id,
          title: (d.get("title") as string) ?? "",
          itemName: d.get("itemUnitId") ? itemName.get(d.get("itemUnitId") as string) ?? null : null,
          careType: (d.get("careType") as string | null) ?? null,
          scopeType: (d.get("scopeType") as string | null) ?? null,
          priorityTier: (d.get("priorityTier") as string | null) ?? "recommended",
          scheduleType: sched?.scheduleType ?? null,
          intervalDays: sched?.intervalDays ?? null,
          remindEnabled: typeof re === "boolean" ? re : null,
        }
      })
    // A home with nothing offerable gets an honest empty list without spending
    // a quota unit on a model call that has nothing to choose from.
    const offered = rows.filter(offerableRow)
    if (offered.length === 0) return { ok: true as const, total_templates: rows.length, proposals: [] }

    const proposals = await withAiQuota(db, uid, "proposeReminders", () =>
      proposeCore(offered, focusText.trim(), makeCallClaudeTool(ANTHROPIC_API_KEY.value())),
    )
    return { ok: true as const, total_templates: rows.length, proposals }
  },
)
