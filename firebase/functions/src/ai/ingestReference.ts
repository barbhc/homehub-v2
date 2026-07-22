/**
 * ingestReference — port of v1 ingest-reference. Light-weight ingestion for
 * reference PDFs (recipe books, quick-start guides): Claude splits the PDF into
 * logical sections, each stored as a chunk with chunkType='reference' for RAG
 * search in chat. No task generation.
 *
 * v2 reads homes/{homeId}/manuals/{manualId} (Admin), fetches the PDF via the
 * parse worker's storagePdf, writes chunks to the manual's chunks subcollection
 * (matching the worker's chunk doc shape), and stamps parsedAt. `runIngestReference`
 * (Claude text → validated sections) is the fixture-testable core.
 */
import { onCall, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { makeCallClaudeText, type CallClaudeText } from "./claude.js"
import { makeFetchPdf } from "../parse/storagePdf.js"
import { consumeDailyAiQuota } from "../lib/quota.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const REGION = "us-central1"

export type ReferenceSection = { title: string | null; content: string; tags: string[] }

const EXTRACT_PROMPT = `You are a document parser. Extract the content of this PDF into logical sections.

For each section, return a JSON object with:
- "title": A clear, descriptive title for the section
- "content": The full text content of the section
- "tags": An array of 1-5 relevant tags (e.g. ["recipe", "dessert", "vanilla"])

Group content logically. For a recipe book, each recipe should be its own section.
For a guide, each chapter or major topic should be a section.
Include all meaningful content — instructions, tips, ingredient lists, specifications, etc.
Skip boilerplate like table of contents, copyright notices, and blank pages.

Return ONLY a JSON array of sections, no other text:
[
  { "title": "...", "content": "...", "tags": ["..."] },
  ...
]`

/** Pure core: PDF base64 → validated reference sections (Claude). Never throws
 *  for a bad model response — returns []. */
export async function runIngestReference(callClaude: CallClaudeText, pdfBase64: string): Promise<ReferenceSection[]> {
  const raw = await callClaude({
    model: "claude-sonnet-4-6",
    maxTokens: 8192,
    content: [
      { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
      { type: "text", text: EXTRACT_PROMPT },
    ],
  })
  const cleaned = raw.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim()
  let sections: Array<Record<string, unknown>>
  try {
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []
    sections = parsed
  } catch {
    return []
  }
  return sections
    .filter((s) => s && typeof s.content === "string" && (s.content as string).length > 0)
    .slice(0, 100)
    .map((s) => ({
      title: typeof s.title === "string" ? (s.title as string).slice(0, 500) : null,
      content: String(s.content).slice(0, 10000),
      tags: Array.isArray(s.tags) ? (s.tags as unknown[]).slice(0, 20).map(String) : [],
    }))
}

export const ingestReference = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.")
  const { homeId, manualId } = (request.data ?? {}) as { homeId?: string; manualId?: string }
  if (!homeId || !manualId) throw new HttpsError("invalid-argument", "homeId and manualId required")

  const db = getFirestore()
  const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
  if (!member.exists) throw new HttpsError("permission-denied", "Not a member of this home")

  const manualRef = db.doc(`homes/${homeId}/manuals/${manualId}`)
  const manual = await manualRef.get()
  if (!manual.exists) throw new HttpsError("not-found", "Manual not found")
  await consumeDailyAiQuota(db, uid, "ingestReference")

  let pdfBase64: string
  try {
    pdfBase64 = await makeFetchPdf()(manual.get("sourceType"), manual.get("sourceRef"))
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "Could not fetch PDF")
  }

  let sections: ReferenceSection[]
  try {
    sections = await runIngestReference(makeCallClaudeText(ANTHROPIC_API_KEY.value()), pdfBase64)
  } catch (e) {
    throw new HttpsError("unavailable", e instanceof Error ? e.message : "AI extraction failed")
  }
  if (sections.length === 0) throw new HttpsError("failed-precondition", "No sections extracted from document")

  const chunksCol = manualRef.collection("chunks")
  const now = FieldValue.serverTimestamp()
  const batch = db.batch()
  for (const s of sections) {
    batch.set(chunksCol.doc(), {
      manualId,
      chunkType: "reference",
      contentLevel: null,
      title: s.title,
      content: s.content,
      tags: s.tags,
      scenarios: [],
      sourcePages: [],
      appliesTo: null,
      sectionCategory: null,
      externalKey: null,
      embeddingRef: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  }
  batch.set(manualRef, { parsedAt: now, updatedAt: now }, { merge: true })
  await batch.commit()

  return { ok: true, sections_count: sections.length }
})
