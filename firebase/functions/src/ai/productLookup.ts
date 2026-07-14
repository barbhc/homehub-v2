/**
 * productLookup — port of v1 supabase/functions/product-lookup. Given a brand +
 * model (+ optional category hint), Claude (Haiku, forced tool-use) returns a
 * two-tier payload: "safe" fields (category/subType) that callers may auto-apply
 * and "candidate" numeric specs the user must accept per-field (we never
 * silently write a hallucinated filter size — invariant: no guessed numerics).
 *
 * v1 cached in a service-role Postgres table + rate-limited via an atomic RPC.
 * v2 caches in the server-only `productLookupCache/{cacheKey}` collection and
 * enforces a per-user daily quota with a Firestore transaction. `runProductLookup`
 * is the injectable, emulator-testable core (fixture tool input → validated result).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { createHash } from "node:crypto"
import { makeCallClaudeTool, type CallClaudeTool } from "./claude.js"
import { requireAnyMembership } from "../lib/membership.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

/** Bump when prompt/schema/model change in a way that invalidates cache. */
const PROMPT_VERSION = 1
const DAILY_LIMIT = 50
const CACHE_TTL_DAYS = 30

const CATEGORY_IDS = [
  "major_appliance", "small_appliance", "fixture", "system", "structure",
  "outdoor", "furniture", "media", "smart_home",
] as const
type CategoryId = (typeof CATEGORY_IDS)[number]
type KnowledgeConfidence = "high" | "medium" | "low"

export type SafeFields = { category: CategoryId | null; subType: string | null }
export type CandidateField = {
  key: string
  label: string
  value: string | number | boolean
  rationale: string | null
}
export type ProductLookupCore = {
  safe: SafeFields
  candidates: CandidateField[]
  knowledgeConfidence: KnowledgeConfidence
}
export type ProductLookupResult = ProductLookupCore & {
  source: "llm" | "cache"
  cacheHit: boolean
}

const CLAIM_TOOL = {
  name: "record_product_specs",
  description:
    "Record what you know with high confidence about a product given its brand and model. OMIT any field you are not certain about — do not guess.",
  input_schema: {
    type: "object",
    properties: {
      category: {
        type: ["string", "null"],
        enum: [...CATEGORY_IDS, null],
        description: "The Homehub category id that best fits this product. Null if unsure.",
      },
      sub_type: {
        type: ["string", "null"],
        description:
          "A specific sub-type slug (e.g. 'air-purifier', 'refrigerator', 'tankless-water-heater'). Null if unsure.",
      },
      candidate_fields: {
        type: "array",
        description:
          "Specific numeric or textual specs the user should REVIEW before applying. Only include fields you can source to the product's public spec sheet. Typical keys: wattage, filter_type, filter_size, merv, voltage, dimensions, capacity_gallons, fuel_type, tonnage, seer, hspf, btu, cadr.",
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "Snake_case field key, e.g. 'wattage', 'filter_size'." },
            label: { type: "string", description: "Short human label shown in the review card." },
            value: {
              description:
                "The spec value. Use a number for pure numerics (wattage, merv); otherwise use a string.",
            },
            rationale: {
              type: ["string", "null"],
              description:
                "Optional one-sentence justification ('Coway AP-1512HH product page lists 60W').",
            },
          },
          required: ["key", "label", "value"],
          additionalProperties: false,
        },
      },
      knowledge_confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "Overall confidence that you have recognized this exact product. 'low' means you don't actually recognize the model; return no candidate_fields in that case.",
      },
    },
    required: ["category", "sub_type", "candidate_fields", "knowledge_confidence"],
    additionalProperties: false,
  },
} as const

function buildPrompt(brand: string, model: string, category: string | null): string {
  return `You are a product spec database for a home inventory app. Given a brand and model number, return ONLY what you know with high confidence.

RULES (critical):
- Only record fields you are HIGHLY confident about. If uncertain, OMIT the field.
- NEVER guess numeric specs (wattage, filter_size, MERV, dimensions). Wrong numbers cause users to buy the wrong replacement parts.
- If you don't actually recognize this exact model, set knowledge_confidence="low" and return an empty candidate_fields array.
- Prefer specific sub_types ("air-purifier" not "small_appliance"; "tankless-water-heater" not "water-heater").
- For filter-related fields, consider: filter_type (HEPA, MERV-rated, carbon), filter_size ("20x25x1" — ONLY if known exactly), merv (8-16).
- For electrical items: wattage, voltage.
- For HVAC: tonnage, seer, hspf, btu, fuel_type.
- For water heaters: capacity_gallons, fuel_type.
- Never include dimensions unless you know the exact measurements — do not estimate.

Brand: ${brand}
Model: ${model}
User-selected category (hint): ${category ?? "unknown"}

Call the record_product_specs tool with your answer.`
}

function normalize(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim().replace(/\s+/g, " ")
}

export function cacheKey(brand: string, model: string, category: string | null, subType: string | null): string {
  const parts = [normalize(brand), normalize(model), normalize(category), normalize(subType), String(PROMPT_VERSION)]
  return createHash("sha256").update(parts.join("::")).digest("hex")
}

/** Strip control chars + enforce length cap (prompt-injection guard). */
function sanitizeInput(s: unknown, maxLen = 100): string | null {
  if (typeof s !== "string") return null
  // eslint-disable-next-line no-control-regex
  const stripped = s.replace(/[\x00-\x1F\x7F]/g, " ").trim()
  if (!stripped) return null
  return stripped.slice(0, maxLen)
}

/** Validate the tool_use input into the two-tier core payload. */
function parseToolInput(input: Record<string, unknown> | null): ProductLookupCore {
  if (!input) return { safe: { category: null, subType: null }, candidates: [], knowledgeConfidence: "low" }

  const rawCategory = input.category
  const category =
    typeof rawCategory === "string" && (CATEGORY_IDS as readonly string[]).includes(rawCategory)
      ? (rawCategory as CategoryId)
      : null
  const rawSubType = input.sub_type
  const subType = typeof rawSubType === "string" && rawSubType.trim() ? rawSubType.trim().slice(0, 80) : null
  const rawConfidence = input.knowledge_confidence
  const confidence: KnowledgeConfidence = rawConfidence === "high" || rawConfidence === "medium" ? rawConfidence : "low"

  const candidates: CandidateField[] = []
  const rawCandidates = input.candidate_fields
  if (Array.isArray(rawCandidates)) {
    for (const raw of rawCandidates) {
      if (!raw || typeof raw !== "object") continue
      const r = raw as Record<string, unknown>
      const key = typeof r.key === "string" ? r.key.trim().toLowerCase() : ""
      const label = typeof r.label === "string" ? r.label.trim() : ""
      const val = r.value
      if (!key || !label) continue
      if (!/^[a-z0-9_]+$/.test(key)) continue
      let value: string | number | boolean
      if (typeof val === "number" && Number.isFinite(val)) value = val
      else if (typeof val === "boolean") value = val
      else if (typeof val === "string" && val.trim()) value = val.trim().slice(0, 200)
      else continue
      const rationale =
        typeof r.rationale === "string" && r.rationale.trim() ? r.rationale.trim().slice(0, 300) : null
      candidates.push({ key, label: label.slice(0, 80), value, rationale })
      if (candidates.length >= 12) break
    }
  }

  // Low confidence → refuse candidates + subType (they would be fabricated).
  const finalCandidates = confidence === "low" ? [] : candidates
  return {
    safe: { category, subType: confidence === "low" ? null : subType },
    candidates: finalCandidates,
    knowledgeConfidence: confidence,
  }
}

/** Injectable core: brand/model → validated two-tier payload (no cache/Firestore). */
export async function runProductLookup(
  callTool: CallClaudeTool,
  brand: string,
  model: string,
  category: string | null,
): Promise<ProductLookupCore> {
  const input = await callTool({
    model: "claude-3-5-haiku-20241022",
    maxTokens: 800,
    tool: CLAIM_TOOL as unknown as Record<string, unknown>,
    content: [{ type: "text", text: buildPrompt(brand, model, category) }],
  })
  return parseToolInput(input)
}

/** Atomic per-user daily quota via a Firestore transaction. Returns true if allowed. */
async function checkDailyQuota(uid: string, dayKey: string): Promise<boolean> {
  const db = getFirestore()
  const ref = db.collection("productLookupCache").doc(`quota__${uid}__${dayKey}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const count = snap.exists ? Number(snap.get("count") ?? 0) : 0
    if (count >= DAILY_LIMIT) return false
    // Quota docs self-expire after 2 days via a TTL policy on expiresAt (best-effort).
    tx.set(ref, { count: count + 1, expiresAt: Timestamp.fromMillis(Date.now() + 2 * 86400_000) }, { merge: true })
    return true
  })
}

export const productLookup = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
    const uid = request.auth.uid
    // Before the quota check — the per-uid quota is meaningless for identities
    // that can be minted freely (anonymous); membership is the real gate.
    await requireAnyMembership(getFirestore(), uid)
    const b = (request.data ?? {}) as Record<string, unknown>
    const brand = sanitizeInput(b.brand)
    const model = sanitizeInput(b.model)
    const category = sanitizeInput(b.category, 40)
    const subType = sanitizeInput(b.subType, 80)
    if (!brand || !model) throw new HttpsError("invalid-argument", "brand and model required")
    if (brand.length < 2 || model.length < 2)
      throw new HttpsError("invalid-argument", "brand and model must be at least 2 characters")

    const db = getFirestore()
    const key = cacheKey(brand, model, category, subType)
    const cacheRef = db.collection("productLookupCache").doc(key)

    // Cache hit → still counts against quota (stops runaway cached pulls).
    const cachedSnap = await cacheRef.get()
    const now = Date.now()
    if (cachedSnap.exists) {
      const expiresAt = cachedSnap.get("expiresAt") as Timestamp | undefined
      const stored = cachedSnap.get("result") as ProductLookupCore | undefined
      if (stored && (!expiresAt || expiresAt.toMillis() > now)) {
        const dayKey = new Date(now).toISOString().slice(0, 10)
        if (!(await checkDailyQuota(uid, dayKey)))
          throw new HttpsError("resource-exhausted", "Daily product-lookup quota reached. Try again tomorrow.")
        return { ...stored, source: "cache", cacheHit: true } satisfies ProductLookupResult
      }
    }

    // Miss → quota-check BEFORE the paid Claude call.
    const dayKey = new Date(now).toISOString().slice(0, 10)
    if (!(await checkDailyQuota(uid, dayKey)))
      throw new HttpsError("resource-exhausted", "Daily product-lookup quota reached. Try again tomorrow.")

    let core: ProductLookupCore
    try {
      core = await runProductLookup(makeCallClaudeTool(ANTHROPIC_API_KEY.value()), brand, model, category)
    } catch (e) {
      throw new HttpsError("unavailable", e instanceof Error ? e.message : "Product lookup failed")
    }

    // Persist (best-effort; a failed write just means the next request retries).
    try {
      await cacheRef.set({
        brand, model, category, subType, promptVersion: PROMPT_VERSION,
        result: core,
        expiresAt: Timestamp.fromMillis(now + CACHE_TTL_DAYS * 86400_000),
      })
    } catch {
      /* non-fatal */
    }

    return { ...core, source: "llm", cacheHit: false } satisfies ProductLookupResult
  },
)
