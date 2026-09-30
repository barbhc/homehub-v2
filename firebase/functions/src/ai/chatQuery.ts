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
 * on the exact system prompts).
 */
import { onRequest, HttpsError } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import Anthropic from "@anthropic-ai/sdk"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { assertNotRefused, thinkingParamsFor } from "../../../../shared/parse/modelParams.js"
import { isWarrantyQuestion, warrantyFactsFromDoc, formatWarrantyBlock, type WarrantyFacts } from "./warrantyContext.js"
import { pickNotes, formatNotesBlock, noteSources, type NoteInput, type NoteScopeKind } from "./notesContext.js"
import { makeFetchPdf } from "../parse/storagePdf.js"
import { rankChunks } from "./chunkRanking.js"
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

type FilterType = "all" | "item" | "room" | "category"
interface ChatRequestBody {
  question: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  filter: { type: FilterType; value?: string; values?: string[]; label?: string }
  home_id: string
  allow_web_search?: boolean
}
type ChatSource = { title: string; item_name: string; source_type: "manual" | "web" | "note"; url?: string }
type WebResult = { title: string; url: string; snippet: string }

const PREFERRED_TYPES = ["care", "how_to", "troubleshooting", "reference"]
const MAX_CHUNKS = 30
const CANDIDATES_PER_MANUAL = 40 // per-manual read cap; ranked down to MAX_CHUNKS
const MAX_HISTORY_TURNS = 10

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
  const json = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
  }
  return (json.web?.results ?? []).slice(0, topN).map((r) => ({
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

    const body = (req.body ?? {}) as ChatRequestBody
    const { question, history = [], filter, home_id: homeId, allow_web_search: allowWebSearch } = body
    if (!question || typeof question !== "string" || !homeId || typeof homeId !== "string") {
      res.status(400).json({ error: "question and home_id are required" })
      return
    }

    const db = getFirestore()
    const member = await db.doc(`homes/${homeId}/members/${uid}`).get()
    if (!member.exists) {
      res.status(403).json({ error: "Forbidden" })
      return
    }

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
    }

    // --- Resolve in-scope items ---
    const itemsSnap = await db.collection(`homes/${homeId}/items`).where("deletedAt", "==", null).get()
    const items: ItemRow[] = itemsSnap.docs.map((d) => ({
      id: d.id,
      roomId: (d.get("roomId") as string | null) ?? null,
      category: (d.get("category") as string | null) ?? null,
      displayName: (d.get("displayName") as string | null) ?? "Unknown",
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
    // needs no manual at all.
    const noteInputs: NoteInput[] = []
    try {
      const [notesSnap, roomsSnap] = await Promise.all([
        db.collection(`homes/${homeId}/careNotes`).where("deletedAt", "==", null).get(),
        db.collection(`homes/${homeId}/rooms`).where("deletedAt", "==", null).get(),
      ])
      const roomName = new Map(roomsSnap.docs.map((r) => [r.id, (r.get("name") as string | null) ?? "Room"]))
      const wholeHome = !filter || filter.type === "all"
      const roomsInScope = wholeHome
        ? new Set(roomName.keys())
        : new Set(scopedItems.map((i) => i.roomId).filter((r): r is string => !!r))
      for (const d of notesSnap.docs) {
        const scope = d.get("scope") as NoteScopeKind
        const content = (d.get("content") as string | null) ?? ""
        const title = (d.get("title") as string | null) ?? null
        if (!content.trim()) continue
        if (scope === "home") {
          noteInputs.push({ scope, scopeLabel: "House", title, content })
        } else if (scope === "room") {
          const roomId = d.get("roomId") as string | null
          if (roomId && roomsInScope.has(roomId)) noteInputs.push({ scope, scopeLabel: roomName.get(roomId) ?? "Room", title, content })
        } else if (scope === "item_unit") {
          const itemId = d.get("itemUnitId") as string | null
          if (itemId && scopedIds.has(itemId)) noteInputs.push({ scope, scopeLabel: nameByItem.get(itemId) ?? "Item", title, content })
        }
      }
      for (const d of itemsSnap.docs) {
        const legacy = (d.get("notes") as string | null)?.trim()
        if (legacy && scopedIds.has(d.id)) noteInputs.push({ scope: "item_unit", scopeLabel: nameByItem.get(d.id) ?? "Item", title: null, content: legacy })
      }
    } catch (e) {
      // Notes supplement the answer; a failed read must not cost it. Logged, never swallowed.
      console.warn(`[chatQuery] notes read failed for home ${homeId}:`, e instanceof Error ? e.message : e)
    }
    const pickedNotes = pickNotes(question, noteInputs)
    const notesBlock = formatNotesBlock(pickedNotes)
    const notesSources: ChatSource[] = noteSources(pickedNotes)

    // --- Manuals for the in-scope items ---
    const manualsSnap = await db.collection(`homes/${homeId}/manuals`).where("deletedAt", "==", null).get()
    const manuals: ManualRow[] = manualsSnap.docs
      .filter((d) => scopedIds.has((d.get("itemUnitId") as string) ?? ""))
      .map((d) => ({
        manualId: d.id,
        itemUnitId: (d.get("itemUnitId") as string) ?? "",
        sourceType: (d.get("sourceType") as string) ?? "url",
        sourceRef: (d.get("sourceRef") as string) ?? "",
      }))
    if (manuals.length === 0 && warrantyBlock.length === 0 && notesBlock.length === 0) return nothingToAsk()

    // --- Decide PDF vs chunk retrieval, and pay for the PDFs ---
    const fetchPdf = makeFetchPdf()
    type PdfDoc = { type: "document"; source: { type: "base64"; media_type: string; data: string }; title?: string }
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
      type Candidate = ChunkRow & { id: string; strong: string; body: string }
      const perManual = await Promise.all(
        manuals.map(async (m): Promise<Candidate[]> => {
          const cs = await db
            .collection(`homes/${homeId}/manuals/${m.manualId}/chunks`)
            .where("deletedAt", "==", null)
            .where("chunkType", "in", PREFERRED_TYPES)
            .limit(CANDIDATES_PER_MANUAL)
            .get()
          const displayName = nameByItem.get(m.itemUnitId) ?? "Unknown"
          return cs.docs.map((c) => {
            const title = (c.get("title") as string | null) ?? null
            const content = (c.get("content") as string) ?? ""
            const tags = (c.get("tags") as string[] | undefined) ?? []
            const scenarios = (c.get("scenarios") as string[] | undefined) ?? []
            const appliesTo = (c.get("appliesTo") as string[] | undefined) ?? []
            const sectionCategory = (c.get("sectionCategory") as string | null) ?? ""
            const strong = [displayName, title ?? "", sectionCategory, ...tags, ...scenarios, ...appliesTo]
              .join(" ")
              .toLowerCase()
            return { id: c.id, title, content, displayName, strong, body: content.toLowerCase() }
          })
        })
      )
      for (const c of rankChunks(question, perManual.flat(), MAX_CHUNKS)) {
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

    const webSearchRules =
      webContextBlock.length > 0
        ? "\n- Web search results are appended below the manual content when available. You may reference them to supplement the manual, but always prefer manual information when both cover the same topic. Cite web sources by their title when you use them."
        : ""

    const warrantyRules =
      warrantyBlock.length > 0
        ? '\n- A "Warranty on record" block, when present, is what the app has stored for that item: its coverage, purchase and expiry dates, exclusions and registration. Treat it as the authority for warranty questions — quote its dates and terms exactly, and do not contradict it from general knowledge. If it lacks something the person asked about, say what is and is not on record.'
        : ""

    const notesRules =
      notesBlock.length > 0
        ? '\n- A "Your notes" block, when present, is what this household wrote down about their own home — where things are, what they chose, what they noticed. For those facts it is the authority: say it comes from their notes, quote it, and never contradict it from general knowledge.'
        : ""

    let chunkContext = ""
    if (chunks.length > 0) {
      chunkContext = chunks.map((c) => `## ${c.displayName} — ${c.title ?? "Excerpt"}\n${c.content}`).join("\n\n")
    }

    const systemPrompt = hasPdfs
      ? `You are a helpful home assistant. The user's appliance manual PDF is attached — read it directly to answer their question accurately and specifically.

Rules:
- Give exact details from the manual: precise button names, sequences, temperatures, settings, part numbers.
- Use numbered steps for procedures.
- Keep every answer self-contained: never refer the reader to steps, a list, or a section "below", "above", or "later" unless those exact steps actually appear in THIS answer. If a step relies on a sub-procedure (e.g. "filter the results" or "run the cleaning cycle"), write that sub-procedure's steps out inline right where you mention it — don't promise them elsewhere.
- If the manual doesn't cover the specific question, say so briefly — then answer from your general expertise about this type of appliance. When you do, introduce that section with a blockquote on its own line: "> 🤖 **General knowledge** — the following is not from your specific manual."
- Use markdown: bold for key terms, numbered lists for steps.${webSearchRules}${warrantyRules}${notesRules}`
      : `You are a helpful home assistant. Answer questions about the user's home appliances using the provided manual excerpts.

Rules:
- Only state specific details (button names, sequences, settings) if they appear explicitly in the excerpts. Never use vague placeholders like "the relevant buttons" — if the exact detail isn't in the excerpts, say so directly.
- Keep every answer self-contained: never refer the reader to steps, a list, or a section "below", "above", or "later" unless those exact steps actually appear in THIS answer. If a step relies on a sub-procedure (e.g. "filter the results" or "run the cleaning cycle"), write that sub-procedure's steps out inline right where you mention it — don't promise them elsewhere.
- If the answer isn't in the excerpts, say so briefly — then answer from your general expertise about this type of appliance. When you do, introduce that section with a blockquote on its own line: "> 🤖 **General knowledge** — the following is not from your specific manual."
- Use markdown: bold for key terms, numbered lists for steps.${webSearchRules}${warrantyRules}${notesRules}`

    type ContentBlock = PdfDoc | { type: "text"; text: string }
    const userTextContent = hasPdfs
      ? [question, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
      : chunkContext
        ? [question, "---", chunkContext, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
        : [question, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
    const userContent: ContentBlock[] = hasPdfs
      ? [...pdfDocs, { type: "text", text: userTextContent }]
      : [{ type: "text", text: userTextContent }]

    const trimmedHistory = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_TURNS)
    const messages = [
      ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ] as Anthropic.MessageParam[]

    // --- Stream Claude ---
    openStream()
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const stream = client.messages.stream({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        // Sonnet 5 thinks by default; this route streamed thinking-off on
        // Sonnet 4.6 with a 1024-token answer budget, so keep it off.
        ...thinkingParamsFor("claude-sonnet-5"),
        system: systemPrompt,
        messages,
      })
      stream.on("text", (text) => {
        res.write(sse({ delta: text }))
      })
      // A safety decline is a 200 with stop_reason "refusal": surface it
      // through the catch below (refund + SSE error), never as a silent answer.
      assertNotRefused(await stream.finalMessage())
      done(sources)
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
    }
  },
)
