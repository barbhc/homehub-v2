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
import { chargeAiQuota } from "../lib/quota.js"
import { MODEL_HAIKU } from "../../../../shared/parse/modelParams.js"
import { countPdfPages } from "../../../../shared/parse/pdfShape.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

/**
 * Haiku 4.5 since 2026-09-30 (audit C3; it was Sonnet 5). This call runs on
 * every add-with-manual and asks one question about the cover page — which
 * kind of document is this — yet it ships the whole PDF, so the model's INPUT
 * price is the whole cost: Haiku 4.5 is $1/MTok against Sonnet 5's $2. It is
 * the same pin ocr, productLookup, classifyExistingTasks and proposeReminders
 * already use. The prompt below is unchanged, byte for byte.
 *
 * (Sending only the first two pages would be cheaper still, but the functions
 * have no PDF library to cut one with — BACKLOG §3.1.)
 */
export const DOC_TYPE_MODEL = MODEL_HAIKU

/**
 * Haiku 4.5 has a 200K-token context, which limits a PDF to 100 pages per
 * request (Sonnet 5 took 600). A longer document is not sent: the request
 * would 400, and a 100-page PDF is an owner's manual for any purpose this
 * classifier serves — the add continues to the scan exactly as it does when
 * classification fails today ("other", confidence 0, no prompt), with the
 * charge refunded.
 */
export const DOC_TYPE_MAX_PAGES = 100

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

/**
 * Pure core: Claude classifies the PDF; output validated. Never throws for a
 * bad model response — degrades to {other, 0} (v1 contract).
 *
 * `claudeAnswered` says whether the call was billed: false when the document
 * was too long to send, or the Claude call itself failed — the two cases where
 * the vendor produced nothing and the caller must refund. (A reply that came
 * back unparseable WAS billed, so it stays charged, like classifyExistingTasks.)
 */
export async function classifyDocType(
  callClaude: CallClaudeText,
  pdfBase64: string,
): Promise<{ result: DetectDocTypeResult; claudeAnswered: boolean }> {
  const fallback: DetectDocTypeResult = { docType: "other", confidence: 0, reason: "Could not classify" }
  const pages = countPdfPages(Buffer.from(pdfBase64, "base64"))
  if (pages !== null && pages > DOC_TYPE_MAX_PAGES) {
    return { result: { ...fallback, reason: `Too long to classify (${pages} pages)` }, claudeAnswered: false }
  }
  let rawText: string
  try {
    rawText = await callClaude({
      model: DOC_TYPE_MODEL,
      maxTokens: 256,
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
        { type: "text", text: PROMPT },
      ],
    })
  } catch (e) {
    // Degrades rather than throws (the add must go on), but a Claude failure
    // is not silent: it is the signal that Haiku's 200K/100-page limit or an
    // outage is biting.
    console.warn(`[detectDocType] Claude call failed; classifying as "other":`, e instanceof Error ? e.message.slice(0, 300) : e)
    return { result: fallback, claudeAnswered: false }
  }
  let parsed: { docType?: string; confidence?: number; reason?: string }
  try {
    parsed = JSON.parse(extractJsonObject(rawText))
  } catch {
    // Billed, unparseable: the v1 contract is a neutral "other", and the
    // charge stands (Claude did answer).
    return { result: fallback, claudeAnswered: true }
  }
  const docType = VALID_TYPES.includes(parsed.docType as DocType) ? (parsed.docType as DocType) : "other"
  const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1 ? parsed.confidence : 0
  const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 200) : "Could not classify"
  return { result: { docType, confidence, reason }, claudeAnswered: true }
}

/** The classification alone — the shape the callable returns. */
export async function runDetectDocType(callClaude: CallClaudeText, pdfBase64: string): Promise<DetectDocTypeResult> {
  return (await classifyDocType(callClaude, pdfBase64)).result
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

  // Unlike bad input, quota exhaustion THROWS — the caller must see that AI is
  // capped for the day rather than silently misfiling the doc as "other".
  const hold = await chargeAiQuota(db, uid, "detectDocType")

  try {
    const pdfBase64 = await makeFetchPdf()(manual.get("sourceType"), manual.get("sourceRef"))
    const { result, claudeAnswered } = await classifyDocType(makeCallClaudeText(ANTHROPIC_API_KEY.value()), pdfBase64)
    // No answer from Claude (too long to send, or the call failed) → nothing
    // was bought, so nothing is charged. This used to keep the 2 units when the
    // Claude call failed, because the core swallowed the error.
    if (!claudeAnswered) await hold.refund()
    return result
  } catch (e) {
    // Returns a fallback rather than throwing, so the refund has to be explicit:
    // the user still got no classification and should not pay for one.
    await hold.refund()
    return { ...fallback, reason: e instanceof Error ? e.message.slice(0, 200) : "Could not classify" }
  }
})
