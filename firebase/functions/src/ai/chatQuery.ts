/**
 * chatQuery — port of v1 supabase/functions/chat-query. This is the ONE Bucket B
 * function that is NOT an onCall: the client needs a streaming (SSE) response, so
 * it's an onRequest v2 HTTPS function that verifies the caller's Firebase ID token
 * itself (Authorization: Bearer <idToken>) and streams `data: {...}\n\n` events.
 *
 * Flow (mirrors v1): member check → resolve in-scope items (filter) → their
 * manuals → if ≤2 manuals, fetch full PDFs so Claude answers from the manual;
 * otherwise feed pre-parsed knowledge chunks. Optional Brave web search when the
 * caller opts in and BRAVE_SEARCH_API_KEY is set. Claude (Sonnet) streamed.
 *
 * Retrieval + prompt wording are ported verbatim from v1 (answer quality depends
 * on the exact system prompts). The request itself — system prompt, messages,
 * and where the manual PDFs sit for prompt caching — is built by
 * buildChatRequest (shared/chat/chatMessages.ts), which the offline chat eval
 * (scripts/chat-eval) asserts too.
 */
import { onRequest, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import * as logger from "firebase-functions/logger"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import Anthropic from "@anthropic-ai/sdk"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { assertNotRefused } from "../../../../shared/parse/modelParams.js"
import { buildChatRequest, type PdfDoc } from "../../../../shared/chat/chatMessages.js"
import { logClaudeUsage } from "../lib/claudeUsage.js"
import { isWarrantyQuestion, warrantyFactsFromDoc, formatWarrantyBlock, type WarrantyFacts } from "./warrantyContext.js"
import { pickNotes, formatNotesBlock, noteSources, type NoteInput } from "./notesContext.js"
import { makeFetchPdf } from "../parse/storagePdf.js"
import { manualSource } from "../parse/manualSource.js"
import { z } from "zod"
import { isDocIdSegment, parseHttpInput, storedText } from "../lib/validate.js"
import { braveWebResults } from "../lib/externalResponses.js"
import { queryTerms, rankChunks } from "./chunkRanking.js"
import {
  ReadTally,
  askReadsLogFields,
  readAskNotes,
  readChunkCandidates,
  readScopedManuals,
  type AskOutcome,
} from "./askReads.js"
import { chargeAiQuota, type QuotaHold } from "../lib/quota.js"
import { CHAT_MAX_ATTACHED_PDFS, CHAT_UNITS_PER_PDF } from "../../../../shared/quota/policy.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
const REGION = "us-central1"

/**
 * Which in-scope manuals this question will try to attach as WHOLE PDFs: all
 * of them when there are at most CHAT_MAX_ATTACHED_PDFS, none otherwise (then
 * the answer comes from parsed excerpts). A URL that fails the SSRF guard is
 * never fetched, so it is never planned — or priced.
 */
export function planPdfAttachments<T extends { sourceType: string; sourceRef: string }>(manuals: T[]): T[] {
  if (manuals.length > CHAT_MAX_ATTACHED_PDFS) return []
  return manuals.filter((m) => m.sourceType !== "url" || isAllowedUrl(m.sourceRef))
}

/**
 * Pay for the manuals this question attaches, then fetch them.
 *
 * An Ask turn used to cost 1 unit whether it sent Claude a sentence or two
 * ~100K-token PDFs (≈ $0.20 each on Sonnet 5). Now it is 1 + CHAT_UNITS_PER_PDF
 * per attached PDF, through the same transactional quota path:
 *
 *   1. the base unit was charged before any reads (rate limit + pool), so a
 *      looping client is still refused before it costs a query;
 *   2. here, the PDFs are priced in one top-up (hold.extend) BEFORE the stream
 *      opens — a refusal is thrown to the caller, which refunds the base unit
 *      and answers 429, exactly like the first charge;
 *   3. a manual that cannot be fetched is not attached, so its units are
 *      released (hold.release) — the user pays for what Claude actually read.
 *
 * The whole hold is refunded by the caller if the stream then fails.
 */
export async function chargeAndFetchPdfs<T extends { manualId: string }>(
  hold: QuotaHold,
  planned: T[],
  fetchOne: (manual: T) => Promise<string>,
): Promise<Array<{ manual: T; base64: string }>> {
  if (planned.length === 0) return []
  await hold.extend(CHAT_UNITS_PER_PDF * planned.length)
  const attached: Array<{ manual: T; base64: string }> = []
  for (const manual of planned) {
    try {
      attached.push({ manual, base64: await fetchOne(manual) })
    } catch (e) {
      // Not fatal — the question is answered without this manual — but not
      // silent either: a manual that never fetches is worth knowing about.
      console.warn(`[chatQuery] manual ${manual.manualId} could not be fetched; answering without it:`, e instanceof Error ? e.message : e)
    }
  }
  const missing = planned.length - attached.length
  if (missing > 0) await hold.release(CHAT_UNITS_PER_PDF * missing)
  return attached
}

/**
 * The request body (H3a) — parsed, never cast. Each history turn must be a
 * {role, content} pair of strings; which of those reach Claude (user or
 * assistant, non-blank, the last ten) is still normalizeHistory's call, which
 * drops and counts the rest (shared/chat/chatMessages.ts). The ceilings sit
 * far above what the Ask client sends and only refuse what it cannot.
 */
const QUESTION_AND_HOME = "question and home_id are required"

export const ChatQueryRequest = z.object({
  question: z.string({ error: QUESTION_AND_HOME }).min(1, { error: QUESTION_AND_HOME }).max(10_000, { error: "That question is too long — try a shorter one." }),
  history: z
    .array(z.object({ role: z.string(), content: z.string().max(50_000) }))
    .max(500)
    .nullish(),
  filter: z
    .object({
      type: z.enum(["all", "item", "room", "category"]),
      value: z.string().max(500).nullish(),
      values: z.array(z.string().max(500)).max(500).nullish(),
      label: z.string().max(500).nullish(),
    })
    .nullish(),
  home_id: z.string({ error: QUESTION_AND_HOME }).refine(isDocIdSegment, { error: QUESTION_AND_HOME }),
  allow_web_search: z.boolean().nullish(),
})
type ChatSource = { title: string; item_name: string; source_type: "manual" | "web" | "note"; url?: string }
type WebResult = { title: string; url: string; snippet: string }

const PREFERRED_TYPES = ["care", "how_to", "troubleshooting", "reference"]
const MAX_CHUNKS = 30 // candidates (askReads.ts: ≤40 per manual, ≤120 per question) are ranked down to this

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
}

function sse(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`
}
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

async function fetchBraveTop(braveKey: string, query: string, topN: number): Promise<WebResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search")
  url.searchParams.set("q", query)
  url.searchParams.set("count", String(topN))
  url.searchParams.set("text_decorations", "false")
  url.searchParams.set("search_lang", "en")
  const res = await fetch(url.toString(), { headers: { "X-Subscription-Token": braveKey } })
  if (!res.ok) return []
  return braveWebResults(await res.json()).slice(0, topN).map((r) => ({
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    snippet: stripHtml(String(r.description ?? "")),
  }))
}
function formatWebContextBlock(searchQuery: string, results: WebResult[]): string {
  const parts = ["---", `## Web search results for: ${searchQuery}`]
  for (const r of results) parts.push(`### [${r.title}](${r.url})`, r.snippet)
  parts.push("---")
  return parts.join("\n")
}

type ItemRow = { id: string; roomId: string | null; category: string | null; displayName: string }
type ManualRow = { manualId: string; itemUnitId: string; sourceType: string; sourceRef: string }

export const chatQuery = onRequest(
  { region: REGION, secrets: [ANTHROPIC_API_KEY, BRAVE_SEARCH_API_KEY], timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set(CORS).status(204).send("")
      return
    }
    for (const [k, v] of Object.entries(CORS)) res.set(k, v)
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" })
      return
    }

    // --- Auth: verify the Firebase ID token ourselves (this is not an onCall) ---
    const authHeader = req.get("authorization") ?? ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : ""
    if (!token) {
      res.status(401).json({ error: "Authentication required. Please sign in again." })
      return
    }
    let uid: string
    try {
      uid = (await getAuth().verifyIdToken(token)).uid
    } catch {
      res.status(401).json({ error: "Invalid or expired session. Please sign in again." })
      return
    }

    const parsed = parseHttpInput("chatQuery", ChatQueryRequest, req.body, "That question couldn't be sent as it was. Try asking again.")
    if (!parsed.ok) {
      res.status(parsed.status).json({ error: parsed.error })
      return
    }
    const { question, filter, home_id: homeId, allow_web_search: allowWebSearch } = parsed.data
    const history = parsed.data.history ?? []

    const db = getFirestore()
    const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
    if (!member.exists) {
      res.status(403).json({ error: "Forbidden" })
      return
    }
    // Every document this question reads, logged once it is answered (or not)
    // — so a read regression shows up in Cloud Logging, not on the bill. The
    // quota transaction's own reads are chargeAiQuota's, not counted here.
    const tally = new ReadTally()
    tally.docs("member", 1)
    const logReads = (outcome: AskOutcome) =>
      logger.info("chatQuery reads", askReadsLogFields(homeId, filter?.type ?? "all", outcome, tally))

    // Daily AI quota — not an onCall, so surface it as a plain 429 before SSE.
    // Charged before the stream opens, because once SSE is running the only
    // way to report a refusal is inside the stream. This is the BASE unit, and
    // it is charged before any reads on purpose: the rate limit inside it is
    // what refuses a looping client before the loop costs a query. The manual
    // PDFs are priced later, once we know how many there are.
    let hold: QuotaHold
    try {
      hold = await chargeAiQuota(db, uid, "chatQuery")
    } catch (e) {
      if (e instanceof HttpsError) {
        res.status(429).json({ error: e.message })
      } else {
        // Not a refusal — the accounting itself failed. Saying "daily limit"
        // here would blame the user for our outage.
        console.error(`[chatQuery] quota charge failed for ${uid}:`, e)
        res.status(503).json({ error: "The assistant couldn't start just now. Please try again in a moment." })
      }
      return
    }

    // From the first write on, this is an SSE stream. The headers are staged
    // lazily so that a refusal found before then can still be a plain 429.
    const openStream = () => {
      if (res.headersSent) return
      res.set("Content-Type", "text/event-stream")
      res.set("Cache-Control", "no-cache")
      res.set("Connection", "keep-alive")
    }
    const done = (sources: ChatSource[]) => {
      openStream()
      res.write(sse({ done: true, sources }))
      res.end()
    }
    // Nothing to ask Claude about: no vendor call, so no charge.
    const nothingToAsk = async () => {
      await hold.refund()
      done([])
      logReads("nothing-to-ask")
    }

    // --- Resolve in-scope items ---
    const itemsSnap = await db.collection(`homes/${homeId}/items`).where("deletedAt", "==", null).get()
    tally.query("items", itemsSnap.size)
    const items: ItemRow[] = itemsSnap.docs.map((d) => ({
      id: d.id,
      roomId: storedText(d.get("roomId")),
      category: storedText(d.get("category")),
      displayName: storedText(d.get("displayName")) ?? "Unknown",
    }))
    if (items.length === 0) return nothingToAsk()

    let scopedItems = items
    if (filter?.type === "item" && filter.value) {
      scopedItems = items.filter((i) => i.id === filter.value)
    } else if (filter?.type === "room") {
      const roomIds = filter.values ?? (filter.value ? [filter.value] : [])
      scopedItems = items.filter((i) => roomIds.includes(i.roomId ?? ""))
    } else if (filter?.type === "category" && filter.value) {
      scopedItems = items.filter((i) => i.category === filter.value)
    }
    if (scopedItems.length === 0) return nothingToAsk()

    const scopedIds = new Set(scopedItems.map((i) => i.id))
    const nameByItem = new Map(items.map((i) => [i.id, i.displayName]))
    const categoryByItem = new Map(items.map((i) => [i.id, i.category]))
    const wholeHome = !filter || filter.type === "all"

    // --- Warranty on record (see warrantyContext.ts) ---
    // The parser writes warranty terms to the ITEM, never to a chunk, so a
    // warranty question is answered from the item documents already in hand.
    // Computed before the manuals bail-out below: an item whose warranty card
    // was typed in by hand may have no manual at all.
    const warrantyFacts: WarrantyFacts[] = isWarrantyQuestion(question)
      ? itemsSnap.docs
          .filter((d) => scopedIds.has(d.id))
          .map((d) => warrantyFactsFromDoc(nameByItem.get(d.id) ?? "Item", (field) => d.get(field)))
          .filter((f): f is WarrantyFacts => f !== null)
      : []
    const warrantyBlock = formatWarrantyBlock(warrantyFacts, new Date().toISOString().slice(0, 10))
    const warrantySources: ChatSource[] = warrantyFacts.map((f) => ({
      title: "Warranty on record", item_name: f.itemName, source_type: "manual",
    }))

    // --- Your notes (see notesContext.ts) ---
    // The house's notes, the notes of the rooms in scope and of the items in
    // scope — plus an item's old single notes text — and only those that match
    // the question. Before the manuals bail-out: "where's the water shutoff?"
    // needs no manual at all. A question with no terms to match can match no
    // note (pickNotes), so it reads none; the rest read only what their scope
    // reaches (readAskNotes).
    const noteInputs: NoteInput[] = []
    if (queryTerms(question).length > 0) {
      try {
        noteInputs.push(...(await readAskNotes(db, { homeId, wholeHome, scopedItems, scopedIds, nameByItem }, tally)))
        for (const d of itemsSnap.docs) {
          const legacy = storedText(d.get("notes"))?.trim()
          if (legacy && scopedIds.has(d.id)) noteInputs.push({ scope: "item_unit", scopeLabel: nameByItem.get(d.id) ?? "Item", title: null, content: legacy })
        }
      } catch (e) {
        // Notes supplement the answer; a failed read must not cost it. Logged, never swallowed.
        console.warn(`[chatQuery] notes read failed for home ${homeId}:`, e instanceof Error ? e.message : e)
      }
    }
    const pickedNotes = pickNotes(question, noteInputs)
    const notesBlock = formatNotesBlock(pickedNotes)
    const notesSources: ChatSource[] = noteSources(pickedNotes)

    // --- Manuals for the in-scope items ---
    const manualDocs = await readScopedManuals(db, homeId, wholeHome, scopedIds, tally)
    const manuals: ManualRow[] = manualDocs
      .filter((d) => scopedIds.has(storedText(d.get("itemUnitId")) ?? ""))
      .map((d) => ({
        manualId: d.id,
        itemUnitId: storedText(d.get("itemUnitId")) ?? "",
        // A source that is missing, or in ANOTHER home's Storage folder, is
        // never attached: it reads as an empty URL, which planPdfAttachments
        // refuses — what a manual with no source already read as. Its parsed
        // chunks (this home's) are still searched.
        ...(manualSource(homeId, d.get("sourceType"), d.get("sourceRef")) ?? { sourceType: "url", sourceRef: "" }),
      }))
    if (manuals.length === 0 && warrantyBlock.length === 0 && notesBlock.length === 0) return nothingToAsk()

    // --- Decide PDF vs chunk retrieval, and pay for the PDFs ---
    const fetchPdf = makeFetchPdf()
    const pdfDocs: PdfDoc[] = []
    const pdfSources: ChatSource[] = []
    let attached: Array<{ manual: ManualRow; base64: string }>
    try {
      attached = await chargeAndFetchPdfs(hold, planPdfAttachments(manuals), (m) => fetchPdf(m.sourceType, m.sourceRef))
    } catch (e) {
      // The PDFs did not fit the user's day or the month (or the top-up itself
      // failed). Nothing has been streamed, so this is still a plain refusal —
      // and the base unit goes back, since no question was answered.
      await hold.refund()
      if (e instanceof HttpsError) {
        res.status(429).json({ error: e.message })
      } else {
        console.error(`[chatQuery] PDF top-up failed for ${uid}:`, e)
        res.status(503).json({ error: "The assistant couldn't start just now. Please try again in a moment." })
      }
      logReads("refused")
      return
    }
    for (const { manual: m, base64 } of attached) {
      const itemName = nameByItem.get(m.itemUnitId) ?? "Appliance"
      pdfDocs.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: base64 },
        title: `${itemName} Owner's Manual`,
      })
      pdfSources.push({ title: "Owner's Manual", item_name: itemName, source_type: "manual" })
    }

    // Chunks (used when no PDFs, or as supplement). Read per-manual subcollection.
    type ChunkRow = { title: string | null; content: string; displayName: string }
    const chunks: ChunkRow[] = []
    const chunkSourceKeys = new Map<string, ChatSource>()
    if (pdfDocs.length === 0) {
      // Gather chunk candidates from ALL in-scope manuals (in parallel), then rank
      // by relevance to the question and keep the top MAX_CHUNKS. v1 pulled first-N
      // in manual order, so a home-wide question only ever saw the earliest,
      // chunk-heavy manuals (washer/Nespresso) and never read the Furnace etc.
      // At most CHUNK_READ_BUDGET candidates in all — see planChunkReads.
      const candidates = await readChunkCandidates(
        db,
        homeId,
        question,
        manuals,
        { name: (id) => nameByItem.get(id), category: (id) => categoryByItem.get(id) },
        PREFERRED_TYPES,
        tally,
      )
      for (const c of rankChunks(question, candidates, MAX_CHUNKS)) {
        chunks.push({ title: c.title, content: c.content, displayName: c.displayName })
        chunkSourceKeys.set(c.id, { title: c.title ?? "Manual excerpt", item_name: c.displayName, source_type: "manual" })
      }
    }
    const chunkSources = [...chunkSourceKeys.values()]
    const hasPdfs = pdfDocs.length > 0
    const baseSources = hasPdfs ? pdfSources : chunkSources

    // --- Optional web search ---
    let webContextBlock = ""
    const webSourcesExtra: ChatSource[] = []
    const braveKey = BRAVE_SEARCH_API_KEY.value()
    if (allowWebSearch === true && braveKey) {
      const firstInScope = scopedItems[0]?.displayName ?? items[0]?.displayName ?? ""
      const labelForSearch = (filter?.label?.trim() || firstInScope).trim()
      const braveQuery = labelForSearch ? `"${labelForSearch}" ${question}` : question
      const webResults = await fetchBraveTop(braveKey, braveQuery, 3)
      if (webResults.length > 0) {
        webContextBlock = formatWebContextBlock(braveQuery, webResults)
        for (const r of webResults) webSourcesExtra.push({ title: r.title, item_name: "Web", source_type: "web", url: r.url })
      }
    }
    const sources = [...baseSources, ...warrantySources, ...notesSources, ...webSourcesExtra]

    // --- The request ---
    // System prompt, history, the question — and the manual PDFs at the front
    // of the conversation behind a prompt-cache breakpoint, so a follow-up
    // about the same manual re-reads them at 0.1× instead of paying for them
    // again (shared/chat/chatMessages.ts has the why; the prompt text is
    // unchanged).
    const request = buildChatRequest({ question, history, pdfDocs, chunks, warrantyBlock, notesBlock, webContextBlock })
    if (request.meta.droppedHistoryTurns > 0) {
      // Not fatal — the question is answered without them — but the Ask
      // client never sends such turns, so whoever did is worth knowing about.
      logger.warn("chatQuery dropped malformed history turns", { homeId, dropped: request.meta.droppedHistoryTurns })
    }

    // --- Stream Claude ---
    openStream()
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const stream = client.messages.stream(request.params)
      stream.on("text", (text) => {
        res.write(sse({ delta: text }))
      })
      const answer = await stream.finalMessage()
      // Every answered call is logged with its cache numbers — a declined one
      // too, so before the refusal check.
      logClaudeUsage("chatQuery", request.params.model, answer, { homeId, scope: filter?.type ?? "all", ...request.meta })
      // A safety decline is a 200 with stop_reason "refusal": surface it
      // through the catch below (refund + SSE error), never as a silent answer.
      assertNotRefused(answer)
      done(sources)
      logReads("answered")
    } catch (err) {
      // The stream never completed, so refund. This is the case that used to
      // tell someone "your limit resets at midnight UTC" after our own outage
      // ate their allowance.
      await hold.refund()
      const status = (err as { status?: number })?.status
      const friendly =
        status === 429
          ? "The assistant is receiving too many requests right now. Please wait a moment and try again."
          : status === 529
            ? "The assistant is temporarily overloaded. Please try again in a few seconds."
            : err instanceof Error
              ? err.message
              : "Stream failed"
      res.write(sse({ error: friendly }))
      res.end()
      logReads("failed")
    }
  },
)
