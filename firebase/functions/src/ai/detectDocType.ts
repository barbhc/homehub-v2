/**
 * detectDocType — port of v1 supabase/functions/detect-doc-type. Classifies an
 * uploaded manual PDF (manual / spec_sheet / install_guide / warranty / other).
 *
 * v2 reads the manual doc from homes/{homeId}/manuals/{manualId} (Admin) and
 * fetches its PDF via the SAME makeFetchPdf the parse worker uses (Admin storage
 * for uploads, isAllowedUrl-guarded fetch for URLs). The pure `runDetectDocType`
 * core takes the Claude call + fetched base64 → fixture-testable.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { makeCallClaudeText, extractJsonObject, type CallClaudeText } from "./claude.js"
import { makeFetchPdf } from "../parse/storagePdf.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

const VALID_TYPES = ["manual", "spec_sheet", "install_guide", "warranty", "other"] as const
export type DocType = (typeof VALID_TYPES)[number]
export interface DetectDocTypeResult {
  docType: DocType
  confidence: number
  reason: string
}

const PROMPT = `You are classifying a home-appliance PDF the user uploaded.

Focus on the first 1-2 pages only (title page, cover, table of contents if visible).

Pick exactly ONE document type:
- manual — owner's manual / user guide / operating instructions for the product
- spec_sheet — specifications, dimensions, technical data sheet (not step-by-step owner care)
- install_guide — installation instructions only (not full owner's manual)
- warranty — warranty card, warranty certificate, registration
- other — cannot tell or mixed/unreadable

Respond with ONLY a JSON object (no markdown):
{"docType":"manual|spec_sheet|install_guide|warranty|other","confidence":0.0,"reason":"one short sentence"}`

/** Pure core: Claude classifies the PDF; output validated. Never throws for a
 *  bad model response — degrades to {other, 0} (v1 contract). */
export async function runDetectDocType(callClaude: CallClaudeText, pdfBase64: string): Promise<DetectDocTypeResult> {
  const fallback: DetectDocTypeResult = { docType: "other", confidence: 0, reason: "Could not classify" }
  let rawText: string
  try {
    rawText = await callClaude({
      model: "claude-sonnet-4-6",
      maxTokens: 256,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: PROMPT },
      ],
    })
  } catch {
    return fallback
  }
  let parsed: { docType?: string; confidence?: number; reason?: string }
  try {
    parsed = JSON.parse(extractJsonObject(rawText))
  } catch {
    return fallback
  }
  const docType = VALID_TYPES.includes(parsed.docType as DocType) ? (parsed.docType as DocType) : "other"
  const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "Could not classify"
  return { docType, confidence, reason }
}

export const detectDocType = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 120 }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, manualId } = (request.data ?? {}) as { homeId?: string; manualId?: string }
  // Degrade gracefully (client contract) rather than throw on bad input.
  const fallback: DetectDocTypeResult = { docType: "other", confidence: 0, reason: "Could not classify" }
  if (!homeId || !manualId) return fallback

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) return { ...fallback, reason: "Forbidden" }

  const manual = await db.doc(`homes/${homeId}/manuals/${manualId}`).get()
  if (!manual.exists) return { ...fallback, reason: "Manual not found" }

  try {
    const pdfBase64 = await makeFetchPdf()(manual.get("sourceType"), manual.get("sourceRef"))
    return await runDetectDocType(makeCallClaudeText(ANTHROPIC_API_KEY.value()), pdfBase64)
  } catch (e) {
    return { ...fallback, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not classify" }
  }
})
