/**
 * discussTask — the Phase-C "Discuss with the assistant" callable for the task
 * feedback loop. Given a task and the homeowner's message, it explains why the
 * task exists (grounded in the item's manual chunks + the home profile) and may
 * propose ONE concrete edit, expressed in the same vocabulary as the
 * deterministic feedback chips (suppress / tier_remap / cadence /
 * reschedule_season) so the client can hand it straight to `submitTaskFeedback`.
 *
 * Forced tool-use gives a typed {explanation, proposal?} back; `runDiscussTask`
 * is the injectable, emulator-testable core (a fixture CallClaudeTool → no API).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, type Firestore } from "firebase-admin/firestore"
import { makeCallClaudeTool, type CallClaudeTool } from "./claude.js"
import { rankChunks } from "./chunkRanking.js"
import { consumeDailyAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"
const MODEL = "claude-sonnet-4-6"
const MAX_SIBLING_CHUNKS = 4

export interface DiscussInput {
  homeId: string
  taskTemplateId: string
  question: string
  history?: { role: "user" | "assistant"; content: string }[]
}
export interface DiscussProposal {
  action: "suppress" | "tier_remap" | "cadence" | "reschedule_season"
  toTier?: "essential" | "recommended" | "optional"
  scheduleType?: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual"
  season?: "spring" | "summer" | "fall" | "winter"
  rationale: string
}
export interface DiscussResult {
  explanation: string
  proposal: DiscussProposal | null
}

const DISCUSS_TOOL = {
  name: "task_guidance",
  description: "Answer the homeowner about this maintenance task and optionally propose ONE concrete edit to it.",
  input_schema: {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        description:
          "A warm, concrete 2-4 sentence answer grounded in the manual excerpt and the task's own details. If you use the manual, cite the page like '(manual p.31)'. Never invent specifics (part numbers, intervals, warnings) not present in the context.",
      },
      proposal: {
        type: "object",
        description: "Include ONLY if the homeowner's point genuinely warrants changing the task. Omit entirely otherwise.",
        properties: {
          action: { type: "string", enum: ["suppress", "tier_remap", "cadence", "reschedule_season"] },
          toTier: { type: "string", enum: ["essential", "recommended", "optional"] },
          scheduleType: { type: "string", enum: ["weekly", "monthly", "quarterly", "semiannual", "annual"] },
          season: { type: "string", enum: ["spring", "summer", "fall", "winter"] },
          rationale: { type: "string", description: "One short sentence on why this edit fits." },
        },
        required: ["action", "rationale"],
      },
    },
    required: ["explanation"],
  },
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

export async function runDiscussTask(
  callClaudeTool: CallClaudeTool,
  db: Firestore,
  input: DiscussInput,
): Promise<DiscussResult> {
  const { homeId, taskTemplateId, question } = input
  const tplSnap = await db.doc(`homes/${homeId}/taskTemplates/${taskTemplateId}`).get()
  if (!tplSnap.exists) throw new Error("Task not found")
  const tpl = tplSnap.data() as Record<string, unknown>

  // ── Manual grounding: the task's instruction chunk + the most relevant siblings ──
  const manualId = str(tpl.manualId)
  const chunkTexts: string[] = []
  let citedPage: number | null = typeof tpl.sourcePage === "number" ? tpl.sourcePage : null
  if (manualId) {
    const instrId = str(tpl.instructionsChunkId)
    if (instrId) {
      const c = await db.doc(`homes/${homeId}/manuals/${manualId}/chunks/${instrId}`).get()
      if (c.exists) {
        const cd = c.data() as Record<string, unknown>
        if (str(cd.content)) chunkTexts.push(str(cd.content))
        const sp = cd.sourcePages
        if (citedPage == null && Array.isArray(sp) && typeof sp[0] === "number") citedPage = sp[0]
      }
    }
    const all = await db.collection(`homes/${homeId}/manuals/${manualId}/chunks`).where("deletedAt", "==", null).get()
    const candidates = all.docs.map((d) => {
      const cd = d.data()
      return {
        strong: `${str(cd.title)} ${Array.isArray(cd.tags) ? cd.tags.join(" ") : ""}`.toLowerCase(),
        body: str(cd.content).toLowerCase(),
        content: str(cd.content),
      }
    })
    for (const c of rankChunks(question, candidates, MAX_SIBLING_CHUNKS)) {
      if (c.content && !chunkTexts.includes(c.content)) chunkTexts.push(c.content)
    }
  }

  // ── Home-profile grounding (folded onto the home doc) ──
  const home = (await db.doc(`homes/${homeId}`).get()).data() ?? {}
  const profile = {
    homeType: home.homeType ?? null,
    ownership: home.ownership ?? null,
    climate: home.climate ?? null,
    freezeRisk: home.freezeRisk ?? null,
  }

  const manualExcerpt = chunkTexts.length
    ? chunkTexts.map((t) => t.slice(0, 1200)).join("\n---\n").slice(0, 6000)
    : "(no manual excerpt available)"

  const system = `You are Homehub's home-care assistant, helping a homeowner understand and tune ONE maintenance task.
Be warm, concise, and honest. Ground every claim in the provided manual excerpt or the task's own details — never invent specifics (part numbers, intervals, warnings) that aren't given. When the manual supports a point, cite the page as "(manual p.N)".
The homeowner's judgment about THEIR home wins: if their point is reasonable, propose the matching edit. If they'd be dropping a genuine safety task, say so plainly once — then still respect their choice; do not refuse.
Include a "proposal" only when a concrete change is warranted. Call the task_guidance tool exactly once.`

  const taskBlock = `TASK
Title: ${str(tpl.title)}
Why it matters: ${str(tpl.justification) || "(none given)"}
Priority: ${str(tpl.priorityTier)} · Risk: ${str(tpl.riskLevel)} · Schedule: ${JSON.stringify(tpl.schedule ?? {})}
${citedPage != null ? `Manual page: ${citedPage}` : ""}

HOME PROFILE
${JSON.stringify(profile)}

MANUAL EXCERPT
${manualExcerpt}`

  const historyText = (input.history ?? [])
    .slice(-6)
    .map((m) => `${m.role === "user" ? "Homeowner" : "Assistant"}: ${m.content}`)
    .join("\n")

  const content = [
    {
      type: "text",
      text: `${taskBlock}\n\n${historyText ? `CONVERSATION SO FAR\n${historyText}\n\n` : ""}HOMEOWNER'S MESSAGE\n${question}`,
    },
  ]

  const out = await callClaudeTool({ model: MODEL, maxTokens: 700, system, tool: DISCUSS_TOOL, content })
  const explanation = str(out?.explanation).slice(0, 1500) || "Sorry — I couldn't answer that. Try rephrasing."
  return { explanation, proposal: parseProposal(out?.proposal) }
}

/** Validate the model's proposed edit against the allowed vocabulary; null if invalid/absent. */
function parseProposal(p: unknown): DiscussProposal | null {
  if (!p || typeof p !== "object") return null
  const o = p as Record<string, unknown>
  const action = str(o.action)
  if (!["suppress", "tier_remap", "cadence", "reschedule_season"].includes(action)) return null
  const proposal: DiscussProposal = { action: action as DiscussProposal["action"], rationale: str(o.rationale).slice(0, 300) }
  if (action === "tier_remap") {
    if (!["essential", "recommended", "optional"].includes(str(o.toTier))) return null
    proposal.toTier = str(o.toTier) as DiscussProposal["toTier"]
  }
  if (action === "cadence") {
    if (!["weekly", "monthly", "quarterly", "semiannual", "annual"].includes(str(o.scheduleType))) return null
    proposal.scheduleType = str(o.scheduleType) as DiscussProposal["scheduleType"]
  }
  if (action === "reschedule_season") {
    if (!["spring", "summer", "fall", "winter"].includes(str(o.season))) return null
    proposal.season = str(o.season) as DiscussProposal["season"]
  }
  return proposal
}

export const discussTask = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, taskTemplateId, question, history } = (request.data ?? {}) as Partial<DiscussInput>
  if (!homeId || !taskTemplateId || !question?.trim()) {
    throw new HttpsError("invalid-argument", "homeId, taskTemplateId and question are required.")
  }
  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home.")
  await consumeDailyAiQuota(db, uid, "discussTask")
  try {
    return await runDiscussTask(makeCallClaudeTool(ANTHROPIC_API_KEY.value()), db, {
      homeId,
      taskTemplateId,
      question: question.trim(),
      history: Array.isArray(history) ? history : [],
    })
  } catch (e) {
    throw new HttpsError("internal", e instanceof Error ? e.message : "discussTask failed")
  }
})
