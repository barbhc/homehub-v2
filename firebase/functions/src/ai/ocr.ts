/**
 * ocr — port of v1 supabase/functions/ocr (Google Vision text detection →
 * Claude structured extraction of appliance nameplate / receipt metadata).
 *
 * Needs GOOGLE_VISION_API_KEY + ANTHROPIC_API_KEY. The extraction prompt (Haiku)
 * is ported verbatim. `runOcrExtract` (OCR text → Extraction) is the fixture-
 * testable core; the onCall wrapper does the Vision call → text → core, and
 * degrades gracefully (returns raw text so the user can fill fields manually).
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { makeCallClaudeText, type CallClaudeText } from "./claude.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const GOOGLE_VISION_API_KEY = defineSecret("GOOGLE_VISION_API_KEY")
const REGION = "us-central1"

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

function buildPrompt(text: string): string {
  return `You extract structured appliance metadata from OCR text. The image is ONE of: a product nameplate/spec label photographed directly on an appliance, OR a purchase receipt for an appliance. Decide which and extract fields accordingly.

OCR TEXT:
"""
${text.slice(0, 4000)}
"""

Heuristics for docType:
- "nameplate": contains electrical specs (volts, amps, watts, Hz), agency marks (UL, ETL, CSA, FCC, Energy Star), model/part numbers, serial numbers, country of origin. Usually NO dollar amounts and NO store names.
- "receipt": contains a store name at top (Home Depot, Lowe's, Best Buy, Costco, Amazon), a transaction date, line items with prices, a total. Brand/model may still appear in the line item description.
- "unknown": use only if truly ambiguous.

Return a JSON object with these fields (use null when not confidently present):
- brand: manufacturer name (e.g. "Coway", "GE", "Whirlpool"). On a receipt, this is the product brand, NOT the store.
- model: model number or model name (e.g. "AP-1512HH", "Airmega 300S"). On nameplates, prefer the string labeled "MODEL" / "MOD." / "MODEL NO." — avoid part numbers, catalog numbers, or date codes.
- name: a short human-friendly item name, ideally "<brand> <model>" (e.g. "Coway Airmega 300S"). Fall back to a product-type phrase if brand/model are missing.
- serialNumber: alphanumeric serial labeled "S/N" / "Serial" / "Serial No." — NOT model numbers, part numbers, or country-of-origin codes. Usually 8-20 alphanumeric chars. Nameplates only.
- category: a short product-type string a downstream mapper can fuzzy-match (e.g. "air purifier", "refrigerator", "dishwasher", "washing machine", "dryer", "television", "microwave", "coffee maker", "router", "range hood", "garbage disposal", "wine fridge", "tankless water heater", "bidet", "faucet", "toilet"). Prefer specific over generic. Null if unclear.
- purchaseDate: ISO yyyy-mm-dd. From receipts, the transaction date. Null on nameplates (build dates are not purchase dates).
- purchasePrice: decimal USD number (e.g. 149.99). From receipts, the line-item price for the appliance (NOT the total if multiple items; NOT tax-only). Null on nameplates.
- docType: "nameplate" | "receipt" | "unknown".
- confidence: number 0.0–1.0 reflecting confidence in brand+model. 0 if nothing extracted.

Respond with ONLY the JSON object, no prose, no code fences.`
}

/** Pure core: OCR text → validated Extraction (Claude Haiku). Empty text → empty
 *  extraction (no Claude call). Throws only on a Claude transport failure so the
 *  wrapper can degrade to raw-text-only. */
export async function runOcrExtract(callClaude: CallClaudeText, text: string): Promise<Extraction> {
  if (!text.trim()) return EMPTY_EXTRACTION
  const content = await callClaude({ model: "claude-3-5-haiku-20241022", maxTokens: 400, content: [{ type: "text", text: buildPrompt(text) }] })
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
    const image = (request.data ?? {}).image
    if (!image || typeof image !== "string") throw new HttpsError("invalid-argument", "Missing image (base64).")
    const base64 = image.replace(/^data:image\/\w+;base64,/, "")

    let text: string
    try {
      text = await visionText(GOOGLE_VISION_API_KEY.value(), base64)
    } catch (e) {
      throw new HttpsError("unavailable", e instanceof Error ? e.message : "OCR failed")
    }
    if (!text.trim()) return { ...EMPTY_EXTRACTION, text: "" }

    // Degrade: if Claude parse fails, still return the raw OCR text.
    try {
      const extraction = await runOcrExtract(makeCallClaudeText(ANTHROPIC_API_KEY.value()), text)
      return { ...extraction, text }
    } catch (e) {
      return { ...EMPTY_EXTRACTION, text, parseWarning: e instanceof Error ? e.message : "Claude parse failed" }
    }
  }
)
