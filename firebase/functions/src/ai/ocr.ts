/**
 * ocr — port of v1 supabase/functions/ocr (Google Vision text detection →
 * Claude structured extraction of appliance nameplate / receipt metadata),
 * plus a Claude-vision fallback: when Vision reads no/insufficient text (dim
 * or low-contrast internal labels) — or the Vision API itself fails — Claude
 * looks at the image directly. One quota charge covers the whole request.
 *
 * Needs GOOGLE_VISION_API_KEY + ANTHROPIC_API_KEY. `runOcrExtract` (OCR text →
 * Extraction) and `runOcrImageExtract` (image → Extraction) are the fixture-
 * testable cores; the onCall wrapper orchestrates Vision → text core →
 * image-fallback core, and degrades gracefully (returns raw text so the user
 * can fill fields manually).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { groundInText } from "../../../../shared/products/groundExtraction.js"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { makeCallClaudeText, type CallClaudeText } from "./claude.js"
import { requireAnyMembership } from "../lib/membership.js"
import { chargeAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const GOOGLE_VISION_API_KEY = defineSecret("GOOGLE_VISION_API_KEY")
const REGION = "us-central1"
// Haiku 4.5 (multimodal) — same pinned snapshot for both the text parse and
// the image fallback keeps cost and behavior consistent. The previous
// claude-3-5-haiku-20241022 was RETIRED by Anthropic — every OCR call 404'd
// at the API and surfaced as "label reader is having trouble".
const OCR_MODEL = "claude-haiku-4-5-20251001"
// Anthropic rejects images over ~5MB binary (~6.7MB base64); the client sends
// ~1600px JPEGs (100s of KB), so hitting this means an unpatched client.
const MAX_FALLBACK_BASE64 = 6_500_000

type DocType = "nameplate" | "receipt" | "unknown"
export interface Extraction {
  brand: string | null
  model: string | null
  name: string | null
  serialNumber: string | null
  category: string | null
  purchaseDate: string | null
  purchasePrice: number | null
  docType: DocType
  confidence: number
}
const EMPTY_EXTRACTION: Extraction = {
  brand: null, model: null, name: null, serialNumber: null, category: null,
  purchaseDate: null, purchasePrice: null, docType: "unknown", confidence: 0,
}

/** Nothing a form field could use — triggers the image fallback. */
export function isEmptyExtraction(e: Extraction): boolean {
  return (
    !e.brand && !e.model && !e.name && !e.serialNumber && !e.category &&
    !e.purchaseDate && e.purchasePrice == null
  )
}

/** Field schema shared by the text prompt and the image-fallback prompt. */
const SCHEMA_INSTRUCTIONS = `Heuristics for docType:
- "nameplate": contains electrical specs (volts, amps, watts, Hz), agency marks (UL, ETL, CSA, FCC, Energy Star), model/part numbers, serial numbers, country of origin. Usually NO dollar amounts and NO store names.
- "receipt": contains a store name at top (Home Depot, Lowe's, Best Buy, Costco, Amazon), a transaction date, line items with prices, a total. Brand/model may still appear in the line item description.
- "unknown": use only if truly ambiguous.

Return a JSON object with these fields (use null when not confidently present):
- brand: manufacturer name, copied EXACTLY as it appears. Null unless the name is literally present — never infer it from the model number, the product type, or anything in these instructions. On a receipt, this is the product brand, NOT the store.
- model: model number or model name, copied EXACTLY as printed. On nameplates, prefer the string labeled "MODEL" / "MOD." / "MODEL NO." — avoid part numbers, catalog numbers, or date codes.
- name: a short human-friendly item name, ideally "<brand> <model>". Fall back to a product-type phrase if brand/model are missing.
- serialNumber: alphanumeric serial labeled "S/N" / "Serial" / "Serial No." — NOT model numbers, part numbers, or country-of-origin codes. Usually 8-20 alphanumeric chars. Nameplates only.
- category: a short product-type string a downstream mapper can fuzzy-match (e.g. "air purifier", "refrigerator", "dishwasher", "washing machine", "dryer", "television", "microwave", "coffee maker", "router", "range hood", "garbage disposal", "wine fridge", "tankless water heater", "bidet", "faucet", "toilet"). Prefer specific over generic. Null if unclear.
- purchaseDate: ISO yyyy-mm-dd. From receipts, the transaction date. Null on nameplates (build dates are not purchase dates).
- purchasePrice: decimal USD number (e.g. 149.99). From receipts, the line-item price for the appliance (NOT the total if multiple items; NOT tax-only). Null on nameplates.
- docType: "nameplate" | "receipt" | "unknown".
- confidence: number 0.0–1.0 reflecting confidence in brand+model. 0 if nothing extracted.

Respond with ONLY the JSON object, no prose, no code fences.`

function buildPrompt(text: string): string {
  return `You extract structured appliance metadata from OCR text. The image is ONE of: a product nameplate/spec label photographed directly on an appliance, OR a purchase receipt for an appliance. Decide which and extract fields accordingly.

OCR TEXT:
"""
${text.slice(0, 4000)}
"""

${SCHEMA_INSTRUCTIONS}`
}

function buildImagePrompt(): string {
  return `You are looking at a photo that is ONE of: a product nameplate/spec label photographed directly on an appliance, OR a purchase receipt for an appliance. Read the text in the image, decide which it is, and extract fields accordingly.

${SCHEMA_INSTRUCTIONS}`
}

/** Validate a model response into a strict Extraction (never throws). */
function parseExtraction(content: string): Extraction {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(cleaned)
    const rawDate = typeof parsed.purchaseDate === "string" ? parsed.purchaseDate.trim() : ""
    const purchaseDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null
    const rawPrice = parsed.purchasePrice
    const purchasePrice = typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice >= 0 && rawPrice < 1_000_000 ? rawPrice : null
    const rawDocType = typeof parsed.docType === "string" ? parsed.docType.trim() : ""
    const docType: DocType = rawDocType === "nameplate" || rawDocType === "receipt" ? rawDocType : "unknown"
    return {
      brand: typeof parsed.brand === "string" && parsed.brand.trim() ? parsed.brand.trim() : null,
      model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model.trim() : null,
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : null,
      serialNumber: typeof parsed.serialNumber === "string" && parsed.serialNumber.trim() ? parsed.serialNumber.trim() : null,
      category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim() : null,
      purchaseDate,
      purchasePrice,
      docType,
      confidence: typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0,
    }
  } catch {
    return EMPTY_EXTRACTION
  }
}

/** Pure core: OCR text → validated Extraction (Claude Haiku). Empty text → empty
 *  extraction (no Claude call). Throws only on a Claude transport failure so the
 *  wrapper can degrade to raw-text-only. */
export async function runOcrExtract(callClaude: CallClaudeText, text: string): Promise<Extraction> {
  if (!text.trim()) return EMPTY_EXTRACTION
  const content = await callClaude({ model: OCR_MODEL, maxTokens: 400, content: [{ type: "text", text: buildPrompt(text) }] })
  return groundInText(parseExtraction(content), text)
}

/** Pure core: image → validated Extraction (Claude Haiku vision). The fallback
 *  when Vision text detection reads nothing usable. Throws only on a Claude
 *  transport failure. */
export async function runOcrImageExtract(
  callClaude: CallClaudeText,
  base64: string,
  mediaType: string
): Promise<Extraction> {
  const content = await callClaude({
    model: OCR_MODEL,
    maxTokens: 400,
    content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: buildImagePrompt() },
    ],
  })
  return parseExtraction(content)
}

/** Google Vision TEXT_DETECTION → full text. */
async function visionText(apiKey: string, base64: string): Promise<string> {
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: base64 }, features: [{ type: "TEXT_DETECTION" }] }] }),
  })
  if (!res.ok) throw new Error(`Vision API ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`)
  const data = await res.json()
  return data.responses?.[0]?.fullTextAnnotation?.text ?? ""
}

export const ocr = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY, GOOGLE_VISION_API_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (request) => {
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.")
    await requireAnyMembership(getFirestore(), request.auth.uid)
    const image = (request.data ?? {}).image
    if (!image || typeof image !== "string") throw new HttpsError("invalid-argument", "Missing image (base64).")
    const rawMediaType = (request.data ?? {}).mediaType
    const mediaType =
      typeof rawMediaType === "string" && /^image\/(jpeg|png|webp|gif)$/.test(rawMediaType)
        ? rawMediaType
        : "image/jpeg"
    // One charge covers the whole request, image fallback included.
    const hold = await chargeAiQuota(getFirestore(), request.auth.uid, "ocr")
    const base64 = image.replace(/^data:image\/\w+;base64,/, "")
    const callClaude = makeCallClaudeText(ANTHROPIC_API_KEY.value())

    let text = ""
    let visionError: string | null = null
    try {
      text = await visionText(GOOGLE_VISION_API_KEY.value(), base64)
    } catch (e) {
      // Vision down is no longer fatal — the image fallback below still gets a shot.
      visionError = e instanceof Error ? e.message : "OCR failed"
    }

    let extraction: Extraction = EMPTY_EXTRACTION
    let engine: "vision" | "claude-vision" = "vision"
    let parseWarning: string | undefined
    if (text.trim()) {
      try {
        extraction = await runOcrExtract(callClaude, text)
      } catch (e) {
        parseWarning = e instanceof Error ? e.message : "Claude parse failed"
        console.warn("[ocr] text extraction failed, degrading:", parseWarning)
      }
    }

    if (isEmptyExtraction(extraction) && base64.length <= MAX_FALLBACK_BASE64) {
      try {
        const viaImage = await runOcrImageExtract(callClaude, base64, mediaType)
        if (!isEmptyExtraction(viaImage)) {
          extraction = viaImage
          engine = "claude-vision"
          parseWarning = undefined
        }
      } catch (e) {
        parseWarning ??= e instanceof Error ? e.message : "Image extraction failed"
        console.warn("[ocr] image fallback failed, degrading:", e instanceof Error ? e.message : e)
      }
    }

    // Both engines struck out AND Vision itself errored: that's an outage, not
    // an unreadable label — surface it as one so the client shows a real error.
    if (visionError && engine === "vision" && isEmptyExtraction(extraction) && !text.trim()) {
      // Every engine failed and nothing was extracted — an outage, so the
      // caller keeps their unit. A degraded-but-real result stays charged.
      await hold.refund()
      throw new HttpsError("unavailable", visionError)
    }

    return { ...extraction, text, engine, ...(parseWarning ? { parseWarning } : {}) }
  }
)
