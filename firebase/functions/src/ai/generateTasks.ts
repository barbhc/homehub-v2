/**
 * generateTasks — port of v1 supabase/functions/generate-tasks (Claude task
 * generation from an optional manual PDF). Pure compute (no Firestore): the
 * client edits the returned tasks then writes them via createTasksFromEditable.
 *
 * The category config + prompt text are ported VERBATIM from v1 — task quality
 * depends on the exact wording. `runGenerateTasks` is the injectable, emulator-
 * testable core.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { makeCallClaudeText, extractJsonObject, fetchPdfBase64, type CallClaudeText } from "./claude.js"
import { requireAnyMembership } from "../lib/membership.js"
import { consumeDailyAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

type TaskGenCfg = { defaultTier: string; min: number; max: number; ctx: string }

const TASK_GEN: Record<string, TaskGenCfg> = {
  major_appliance: { defaultTier: "essential", min: 6, max: 12, ctx: "This is a major appliance requiring scheduled filter/coil/vent maintenance, professional service, and cleaning cycles." },
  small_appliance: { defaultTier: "optional", min: 2, max: 4, ctx: "This is a small appliance. Only suggest tasks that are genuinely useful — descaling for water-contact appliances, filter replacement if applicable. Most small appliances need minimal maintenance. Do NOT suggest tasks just to fill a list." },
  fixture: { defaultTier: "optional", min: 2, max: 4, ctx: "This is a home fixture. Suggest practical inspection and cleaning tasks only where they matter." },
  system: { defaultTier: "essential", min: 4, max: 8, ctx: "This is a home system requiring professional inspections and scheduled service." },
  structure: { defaultTier: "recommended", min: 3, max: 6, ctx: "This is a structural home element. Focus on inspection, weather sealing, and seasonal upkeep." },
  outdoor: { defaultTier: "recommended", min: 4, max: 8, ctx: "This is outdoor or yard equipment. Include seasonal prep, blade/belt service, and battery/fuel care where relevant." },
  furniture: { defaultTier: "optional", min: 1, max: 3, ctx: "This is furniture. Only suggest genuinely useful care tasks — leather conditioning, mattress flipping, fabric protection. Keep it minimal." },
  media: { defaultTier: "optional", min: 1, max: 3, ctx: "This is media or entertainment gear. Keep maintenance tasks minimal and practical." },
  smart_home: { defaultTier: "recommended", min: 3, max: 5, ctx: "This is a smart home/networking device. Focus on firmware updates, battery replacement (if battery-powered), password rotation, and connectivity health checks." },
}
const DEFAULT_GEN: TaskGenCfg = { defaultTier: "recommended", min: 4, max: 8, ctx: "Suggest practical home maintenance tasks appropriate for this item." }

const MAJOR_IDS = new Set(["refrigerator", "dishwasher", "oven-range", "microwave", "washing-machine", "dryer", "hvac-furnace", "air-conditioner", "water-heater", "garbage-disposal"])

function inferCategoryFromApplianceTypeId(applianceTypeId: string): string | null {
  if (!applianceTypeId || applianceTypeId === "other") return null
  if (applianceTypeId === "television") return "media"
  if (MAJOR_IDS.has(applianceTypeId)) return "major_appliance"
  return null
}
function resolveTaskGen(itemCategory: string | null | undefined, applianceTypeId: string): TaskGenCfg {
  const key = itemCategory?.trim() || inferCategoryFromApplianceTypeId(applianceTypeId)
  if (key && TASK_GEN[key]) return TASK_GEN[key]
  return DEFAULT_GEN
}
function formatCategoryFields(cf: unknown): string {
  if (!cf || typeof cf !== "object") return ""
  const entries = Object.entries(cf as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "")
  if (entries.length === 0) return ""
  const lines = entries.map(([k, v]) => {
    const label = k.replace(/_/g, " ")
    if (Array.isArray(v)) return `${label}: ${v.join(", ")}`
    return `${label}: ${String(v)}`
  })
  return `Additional context from the owner:\n${lines.join("\n")}`
}

export interface GenerateTasksInput {
  itemName?: string
  brand?: string
  applianceTypeId?: string
  manualUrl?: string | null
  itemCategory?: string | null
  subType?: string | null
  categoryFields?: unknown
}
export interface GeneratedTaskOut {
  id: string
  title: string
  frequencyValue: number | null
  frequencyUnit: string | null
  type: string
  instructions: string
  priority: string
  effort: string
}
export interface GenerateTasksResult {
  tasks: GeneratedTaskOut[]
  troubleshooting: Array<{ problem: string; cause: string; solution: string }>
}

function buildPrompt(gen: TaskGenCfg, hasPdf: boolean, brand: string, itemName: string, catLabel: string, typeLabel: string, fieldsBlock: string): string {
  const openingContext = gen.ctx ? `${gen.ctx}\n\n` : ""
  const fieldsSection = fieldsBlock ? `${fieldsBlock}\n\n` : ""
  const countRule = `Generate between ${gen.min} and ${gen.max} tasks (stay within this range).`
  const defaultPriorityRule = `Default priority guidance for this item: prefer "${gen.defaultTier}" when choosing task priority unless the manual clearly indicates otherwise.`
  return hasPdf
    ? `You are a home maintenance expert. I've attached the owner's manual for my ${brand ? brand + " " : ""}${itemName} (category: ${catLabel}, type: ${typeLabel}).

${openingContext}${fieldsSection}${countRule}
${defaultPriorityRule}

Read the manual carefully and extract:

1. **Maintenance tasks**: Every maintenance and cleaning task mentioned in the manual. Include filter changes, cleaning schedules, inspections, part replacements, seasonal tasks, etc. Be specific to THIS appliance — use the exact part names, settings, and procedures from the manual.

2. **Troubleshooting tips**: Key troubleshooting entries from the manual — common problems, their likely causes, and solutions.

Respond with ONLY a JSON object in this exact format (no other text):
{
  "tasks": [
    {
      "title": "specific task name from manual",
      "frequencyValue": 3,
      "frequencyUnit": "months",
      "type": "cleaning",
      "instructions": "plain-language how-to: what the user physically does, no jargon; keep 'do not / never' warnings as separate sentences, never numbered among the steps",
      "priority": "essential",
      "effort": "short"
    }
  ],
  "troubleshooting": [
    {
      "problem": "description of the problem",
      "cause": "likely cause",
      "solution": "what to do"
    }
  ]
}

Rules for tasks:
- frequencyValue: number (or null for one-time tasks)
- frequencyUnit: "days" | "weeks" | "months" | "years" (or null for one-time)
- type — REQUIRED. Use exactly one of:
  - "cleaning" — Cosmetic or hygienic-only. Skipping affects appearance or hygiene, NOT appliance function (e.g. wipe exterior surfaces, polish door panel, clean fingerprints, wipe down drawer fronts, clean gasket for appearance). These are good habits, not deadlines.
  - "inspection" — Check or test without intervention (e.g. inspect hoses for cracks, test smoke alarm, check water pressure).
  - "maintenance" — Function-preserving, lifespan-critical, or warranty-relevant. Skipping risks failure, voided warranty, or efficiency loss (e.g. replace HVAC filter, descale water heater, clean dryer vent, flush sediment, lubricate moving parts). Note: cleaning that IS function-preserving (cleaning condenser coils, cleaning dishwasher filter) is "maintenance", not "cleaning".
  - "replacement" — Part replacement (filters, belts, bulbs, batteries, gaskets).
- **priority** (REQUIRED for each task): Use exactly one of these three values:
  - "essential" — Safety-critical or damage-risk tasks. Skipping causes failure, voided warranty, or hazard (e.g. replace HVAC filter, clean dryer vent, descale water heater). Default here when in doubt for recurring maintenance.
  - "recommended" — Extends lifespan or efficiency. Low risk if skipped occasionally (e.g. clean refrigerator coils, flush water heater, wipe door gaskets).
  - "optional" — Cosmetic or comfort-only. No real consequence if skipped (e.g. polish exterior, clean control panel).
- **effort** (REQUIRED for each task): Estimate time: "short" (<5 min), "medium" (5-20 min), "long" (>20 min)
- **instructions**: plain-language how-to in concrete steps (what the user DOES), no jargon. Keep warnings ("do not / never / avoid") OUT of the steps — state them as their own sentences so they don't read as a numbered step.
- Respect the min/max task count above. Most recurring maintenance from the manual should be "essential" or "recommended" — reserve "optional" only for truly cosmetic tasks.
- Use the manual's recommended frequencies when specified`
    : `You are a home maintenance expert. I have a ${brand ? brand + " " : ""}${itemName} (category: ${catLabel}, type: ${typeLabel}) but no manual is available.

${openingContext}${fieldsSection}${countRule}
${defaultPriorityRule}

Based on your knowledge of this type of item, suggest standard maintenance tasks.

Respond with ONLY a JSON object in this exact format (no other text):
{
  "tasks": [
    {
      "title": "task name",
      "frequencyValue": 3,
      "frequencyUnit": "months",
      "type": "cleaning",
      "instructions": "plain-language how-to: what the user physically does, no jargon; keep 'do not / never' warnings as separate sentences, never numbered among the steps",
      "priority": "recommended",
      "effort": "short"
    }
  ],
  "troubleshooting": []
}

Rules for tasks:
- frequencyValue: number (or null for one-time tasks)
- frequencyUnit: "days" | "weeks" | "months" | "years" (or null for one-time)
- type — REQUIRED. Use exactly one of:
  - "cleaning" — Cosmetic or hygienic-only. Skipping affects appearance, NOT function (e.g. wipe exterior, polish, clean fingerprints, wipe drawer fronts).
  - "inspection" — Check or test without intervention (e.g. inspect hoses, test alarms, check pressures).
  - "maintenance" — Function-preserving or lifespan-critical. Skipping risks failure or efficiency loss (e.g. replace filters, descale, clean vents/coils, lubricate). Cleaning that IS function-preserving (dishwasher filter, condenser coils) is "maintenance".
  - "replacement" — Part replacement (filters, belts, bulbs, batteries).
- **priority** (REQUIRED): Use exactly one of: "essential" | "recommended" | "optional"
  - "essential" — Safety-critical or damage-risk tasks (default for recurring maintenance when unsure)
  - "recommended" — Extends lifespan, low risk if occasionally skipped
  - "optional" — Cosmetic only, no real consequence if skipped
- **effort** (REQUIRED): "short" | "medium" | "long" — estimate time for each task
- Respect the min/max task count above. Align priorities with the default priority guidance when reasonable.`
}

const VALID_UNITS = ["days", "weeks", "months", "years"]
const VALID_TYPES = ["cleaning", "inspection", "maintenance", "replacement"]
const VALID_PRIORITIES = ["essential", "recommended", "optional"]
const VALID_EFFORTS = ["short", "medium", "long"]

/** Injectable core. `newId` defaults to crypto.randomUUID (kept injectable for
 *  deterministic tests). */
export async function runGenerateTasks(
  callClaude: CallClaudeText,
  input: GenerateTasksInput,
  deps?: { fetchPdf?: (url: string) => Promise<string | null>; newId?: () => string }
): Promise<GenerateTasksResult> {
  const fetchPdf = deps?.fetchPdf ?? fetchPdfBase64
  const newId = deps?.newId ?? (() => crypto.randomUUID())

  const itemName = input.itemName ?? "Appliance"
  const brand = input.brand ?? ""
  const applianceTypeId = input.applianceTypeId ?? "other"
  const gen = resolveTaskGen(input.itemCategory, applianceTypeId)
  const typeLabel = input.subType ?? applianceTypeId
  const catLabel = input.itemCategory ?? inferCategoryFromApplianceTypeId(applianceTypeId) ?? "unspecified"
  const fieldsBlock = formatCategoryFields(input.categoryFields)

  const content: Array<Record<string, unknown>> = []
  let hasPdf = false
  if (input.manualUrl) {
    const pdf = await fetchPdf(input.manualUrl) // throws on SSRF-blocked URL
    if (pdf) {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf } })
      hasPdf = true
    }
  }
  content.push({ type: "text", text: buildPrompt(gen, hasPdf, brand, itemName, catLabel, typeLabel, fieldsBlock) })

  const rawText = await callClaude({ model: "claude-sonnet-4-6", maxTokens: 4096, content })
  let parsed: { tasks?: unknown[]; troubleshooting?: unknown[] } = {}
  try {
    parsed = JSON.parse(extractJsonObject(rawText))
  } catch {
    parsed = {}
  }

  const tasks: GeneratedTaskOut[] = (Array.isArray(parsed.tasks) ? parsed.tasks : []).slice(0, gen.max).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>
    return {
      id: newId(),
      title: String(t.title ?? "Maintenance task").slice(0, 200),
      frequencyValue: typeof t.frequencyValue === "number" ? t.frequencyValue : null,
      frequencyUnit: VALID_UNITS.includes(String(t.frequencyUnit ?? "")) ? String(t.frequencyUnit) : null,
      type: VALID_TYPES.includes(String(t.type ?? "")) ? String(t.type) : "maintenance",
      instructions: String(t.instructions ?? "").slice(0, 500),
      priority: VALID_PRIORITIES.includes(String(t.priority ?? "")) ? String(t.priority) : "recommended",
      effort: VALID_EFFORTS.includes(String(t.effort ?? "")) ? String(t.effort) : "medium",
    }
  })
  const troubleshooting = (Array.isArray(parsed.troubleshooting) ? parsed.troubleshooting : []).slice(0, 20).map((raw) => {
    const t = (raw ?? {}) as Record<string, unknown>
    return {
      problem: String(t.problem ?? "").slice(0, 300),
      cause: String(t.cause ?? "").slice(0, 300),
      solution: String(t.solution ?? "").slice(0, 500),
    }
  })
  return { tasks, troubleshooting }
}

export const generateTasks = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 }, async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
  await requireAnyMembership(getFirestore(), request.auth.uid)
  await consumeDailyAiQuota(getFirestore(), request.auth.uid, "generateTasks")
  try {
    return await runGenerateTasks(makeCallClaudeText(ANTHROPIC_API_KEY.value()), (request.data ?? {}) as GenerateTasksInput)
  } catch (e) {
    if (e instanceof Error && e.message.includes("URL not allowed")) throw new HttpsError("permission-denied", e.message)
    throw new HttpsError("internal", e instanceof Error ? e.message : "Task generation failed")
  }
})
