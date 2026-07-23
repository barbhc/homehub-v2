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
import { defineSecret, defineString } from "firebase-functions/params"
import { getFirestore, Timestamp } from "firebase-admin/firestore"
import { createHash } from "node:crypto"
import { makeCallClaudeTool, type CallClaudeTool } from "./claude.js"
import {
  resolveExternalIdentity,
  normalizeModel,
  type ProductIdentity,
  type VariantCandidate,
} from "./identityResolver.js"
import { requireAnyMembership } from "../lib/membership.js"
import { consumeDailyAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
// Brave is a SECRET, matching chatQuery + searchProductImages, which already
// declare this exact name via defineSecret — it lives in Secret Manager, not an
// .env file. Declaring the same name as a defineString param here would read
// empty and silently disable the layer.
const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
// Icecat username is not a credential (and Open Icecat's free catalog turned out
// to be too thin for home appliances), so it stays a plain param, default "" =
// layer dormant. Value would live in firebase/functions/.env.<project>.
const ICECAT_USERNAME = defineString("ICECAT_USERNAME", { default: "" })
const REGION = "us-central1"

/** Bump when prompt/schema/model change in a way that invalidates cache.
 *  v2: identity layers + variant candidates added to the payload. */
const PROMPT_VERSION = 2
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
  /** Full model numbers this partial model might be (family variants). */
  variantCandidates: VariantCandidate[]
}
export type ProductLookupResult = ProductLookupCore & {
  /** Layered identity resolution (Icecat → Brave → Haiku); null = genuine miss. */
  identity: ProductIdentity | null
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
      variant_candidates: {
        type: "array",
        description:
          "ONLY when the given model looks like a PARTIAL model-family prefix (e.g. 'WM4000H' for LG's WM4000HWA/WM4000HBA): up to 3 full model numbers you know from that family, each with a short differentiator (color/finish/size). Empty array when the model is complete or you don't recognize the family.",
        items: {
          type: "object",
          properties: {
            model: { type: "string", description: "Full model number, e.g. 'WM4000HWA'." },
            differentiator: {
              type: ["string", "null"],
              description: "Short human difference, e.g. 'White' or 'Black steel'. Null if unknown.",
            },
          },
          required: ["model", "differentiator"],
          additionalProperties: false,
        },
      },
    },
    required: ["category", "sub_type", "candidate_fields", "knowledge_confidence", "variant_candidates"],
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
function parseToolInput(input: Record<string, unknown> | null, typedModel: string): ProductLookupCore {
  if (!input)
    return { safe: { category: null, subType: null }, candidates: [], knowledgeConfidence: "low", variantCandidates: [] }

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

  // Variant candidates: must genuinely EXTEND the typed model (same normalized
  // prefix, longer) — anything else is a hallucinated family. Deduped, cap 3.
  // Allowed even at low confidence: "I know the family but not this exact model"
  // is precisely the fuzzy case the variants exist for.
  const typedNorm = normalizeModel(typedModel)
  const variantCandidates: VariantCandidate[] = []
  const seenVariants = new Set<string>()
  const rawVariants = input.variant_candidates
  if (Array.isArray(rawVariants) && typedNorm.length >= 4) {
    for (const raw of rawVariants) {
      const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null
      const vModel = typeof r?.model === "string" ? r.model.trim().slice(0, 40) : ""
      if (!vModel) continue
      const vNorm = normalizeModel(vModel)
      if (!vNorm.startsWith(typedNorm) || vNorm.length <= typedNorm.length) continue
      if (vNorm.length > typedNorm.length + 8 || seenVariants.has(vNorm)) continue
      seenVariants.add(vNorm)
      const differentiator =
        typeof r?.differentiator === "string" && r.differentiator.trim()
          ? r.differentiator.trim().slice(0, 60)
          : null
      variantCandidates.push({ model: vModel, differentiator })
      if (variantCandidates.length >= 3) break
    }
  }

  // Low confidence → refuse candidates + subType (they would be fabricated).
  const finalCandidates = confidence === "low" ? [] : candidates
  return {
    safe: { category, subType: confidence === "low" ? null : subType },
    candidates: finalCandidates,
    knowledgeConfidence: confidence,
    variantCandidates,
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
  return parseToolInput(input, model)
}

/**
 * Haiku-derived identity — the last layer. Only when the spec lookup actually
 * recognized the product (medium/high): name composes from what the user typed,
 * category hint from the safe fields.
 */
export function haikuIdentity(core: ProductLookupCore, brand: string, model: string): ProductIdentity | null {
  if (core.knowledgeConfidence === "low") return null
  return {
    name: `${brand} ${model}`.slice(0, 120),
    rawCategory: core.safe.subType ?? core.safe.category,
    source: "claude",
    confidence: core.knowledgeConfidence,
  }
}

export const productLookup = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY, BRAVE_SEARCH_API_KEY], timeoutSeconds: 60 },
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
    // Misses are cached too (identity:null) — "we don't recognize this" is an
    // answer worth not re-asking three data sources for on every keystroke.
    const cachedSnap = await cacheRef.get()
    const now = Date.now()
    if (cachedSnap.exists) {
      const expiresAt = cachedSnap.get("expiresAt") as Timestamp | undefined
      const stored = cachedSnap.get("result") as ProductLookupCore | undefined
      if (stored && (!expiresAt || expiresAt.toMillis() > now)) {
        await consumeDailyAiQuota(db, uid, "productLookup")
        const identity = (cachedSnap.get("identity") as ProductIdentity | null | undefined) ?? null
        return {
          ...stored,
          variantCandidates: stored.variantCandidates ?? [],
          identity,
          source: "cache",
          cacheHit: true,
        } satisfies ProductLookupResult
      }
    }

    // Miss → quota-check BEFORE the paid Claude call.
    await consumeDailyAiQuota(db, uid, "productLookup")

    // Identity layers (Icecat → Brave, sequential first-hit-wins; dormant
    // without keys) run in parallel with the Haiku spec lookup — Haiku's
    // candidates are wanted either way, and it doubles as the last identity
    // source. External layers are fail-open (null), never fatal.
    const externalPromise = resolveExternalIdentity(
      {
        fetchJson: fetch,
        icecatUsername: ICECAT_USERNAME.value().trim() || null,
        braveApiKey: BRAVE_SEARCH_API_KEY.value().trim() || null,
      },
      brand,
      model,
    )

    let core: ProductLookupCore
    try {
      core = await runProductLookup(makeCallClaudeTool(ANTHROPIC_API_KEY.value()), brand, model, category)
    } catch (e) {
      throw new HttpsError("unavailable", e instanceof Error ? e.message : "Product lookup failed")
    }
    const external = await externalPromise

    const identity = external.identity ?? haikuIdentity(core, brand, model)
    // Variants only matter when no exact identity resolved — merge external
    // mining with Haiku's family knowledge, dedupe by normalized model, cap 3.
    const variantCandidates: VariantCandidate[] = []
    if (!identity) {
      const seen = new Set<string>()
      for (const v of [...external.variants, ...core.variantCandidates]) {
        const norm = normalizeModel(v.model)
        if (seen.has(norm)) continue
        seen.add(norm)
        variantCandidates.push(v)
        if (variantCandidates.length >= 3) break
      }
    }
    const enrichedCore: ProductLookupCore = { ...core, variantCandidates }

    // Persist (best-effort; a failed write just means the next request retries).
    try {
      await cacheRef.set({
        brand, model, category, subType, promptVersion: PROMPT_VERSION,
        result: enrichedCore,
        identity,
        expiresAt: Timestamp.fromMillis(now + CACHE_TTL_DAYS * 86400_000),
      })
    } catch {
      /* non-fatal */
    }

    return { ...enrichedCore, identity, source: "llm", cacheHit: false } satisfies ProductLookupResult
  },
)
