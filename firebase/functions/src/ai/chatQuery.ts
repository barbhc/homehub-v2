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
import { onRequest } from "firebase-functions/v2/https"
import { defineSecret } from "firebase-functions/params"
import { getFirestore } from "firebase-admin/firestore"
import { getAuth } from "firebase-admin/auth"
import Anthropic from "@anthropic-ai/sdk"
import { isAllowedUrl } from "../../../../shared/parse/ssrf.js"
import { makeFetchPdf } from "../parse/storagePdf.js"
import { rankChunks } from "./chunkRanking.js"

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY")
const BRAVE_SEARCH_API_KEY = defineSecret("BRAVE_SEARCH_API_KEY")
const REGION = "us-central1"

type FilterType = "all" | "item" | "room" | "category"
interface ChatRequestBody {
  question: string
  history: Array<{ role: "user" | "assistant"; content: string }>
  filter: { type: FilterType; value?: string; values?: string[]; label?: string }
  home_id: string
  allow_web_search?: boolean
}
type ChatSource = { title: string; item_name: string; source_type: "manual" | "web"; url?: string }
type WebResult = { title: string; url: string; snippet: string }

const PREFERRED_TYPES = ["care", "how_to", "troubleshooting", "reference"]
const MAX_PDF_MANUALS = 2
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

    // From here on we stream SSE.
    res.set("Content-Type", "text/event-stream")
    res.set("Cache-Control", "no-cache")
    res.set("Connection", "keep-alive")
    const done = (sources: ChatSource[]) => {
      res.write(sse({ done: true, sources }))
      res.end()
    }

    // --- Resolve in-scope items ---
    const itemsSnap = await db.collection(`homes/${homeId}/items`).where("deletedAt", "==", null).get()
    const items: ItemRow[] = itemsSnap.docs.map((d) => ({
      id: d.id,
      roomId: (d.get("roomId") as string | null) ?? null,
      category: (d.get("category") as string | null) ?? null,
      displayName: (d.get("displayName") as string | null) ?? "Unknown",
    }))
    if (items.length === 0) return done([])

    let scopedItems = items
    if (filter?.type === "item" && filter.value) {
      scopedItems = items.filter((i) => i.id === filter.value)
    } else if (filter?.type === "room") {
      const roomIds = filter.values ?? (filter.value ? [filter.value] : [])
      scopedItems = items.filter((i) => roomIds.includes(i.roomId ?? ""))
    } else if (filter?.type === "category" && filter.value) {
      scopedItems = items.filter((i) => i.category === filter.value)
    }
    if (scopedItems.length === 0) return done([])

    const scopedIds = new Set(scopedItems.map((i) => i.id))
    const nameByItem = new Map(items.map((i) => [i.id, i.displayName]))

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
    if (manuals.length === 0) return done([])

    // --- Decide PDF vs chunk retrieval ---
    const fetchPdf = makeFetchPdf()
    type PdfDoc = { type: "document"; source: { type: "base64"; media_type: string; data: string }; title?: string }
    const pdfDocs: PdfDoc[] = []
    const pdfSources: ChatSource[] = []
    if (manuals.length <= MAX_PDF_MANUALS) {
      for (const m of manuals) {
        try {
          if (m.sourceType === "url" && !isAllowedUrl(m.sourceRef)) continue
          const base64 = await fetchPdf(m.sourceType, m.sourceRef)
          const itemName = nameByItem.get(m.itemUnitId) ?? "Appliance"
          pdfDocs.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
            title: `${itemName} Owner's Manual`,
          })
          pdfSources.push({ title: "Owner's Manual", item_name: itemName, source_type: "manual" })
        } catch {
          /* skip unreachable manual */
        }
      }
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
    const sources = [...baseSources, ...webSourcesExtra]

    const webSearchRules =
      webContextBlock.length > 0
        ? "\n- Web search results are appended below the manual content when available. You may reference them to supplement the manual, but always prefer manual information when both cover the same topic. Cite web sources by their title when you use them."
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
- If the manual doesn't cover the specific question, say so briefly — then answer from your general expertise about this type of appliance. When you do, introduce that section with a blockquote on its own line: "> 🤖 **General knowledge** — the following is not from your specific manual."
- Use markdown: bold for key terms, numbered lists for steps.${webSearchRules}`
      : `You are a helpful home assistant. Answer questions about the user's home appliances using the provided manual excerpts.

Rules:
- Only state specific details (button names, sequences, settings) if they appear explicitly in the excerpts. Never use vague placeholders like "the relevant buttons" — if the exact detail isn't in the excerpts, say so directly.
- If the answer isn't in the excerpts, say so briefly — then answer from your general expertise about this type of appliance. When you do, introduce that section with a blockquote on its own line: "> 🤖 **General knowledge** — the following is not from your specific manual."
- Use markdown: bold for key terms, numbered lists for steps.${webSearchRules}`

    type ContentBlock = PdfDoc | { type: "text"; text: string }
    const userTextContent = hasPdfs
      ? [question, webContextBlock].filter((s) => s.length > 0).join("\n\n")
      : chunkContext
        ? [question, "---", chunkContext, webContextBlock].filter((s) => s.length > 0).join("\n\n")
        : [question, webContextBlock].filter((s) => s.length > 0).join("\n\n")
    const userContent: ContentBlock[] = hasPdfs
      ? [...pdfDocs, { type: "text", text: userTextContent }]
      : [{ type: "text", text: userTextContent }]

    const trimmedHistory = (Array.isArray(history) ? history : []).slice(-MAX_HISTORY_TURNS)
    const messages = [
      ...trimmedHistory.map((h) => ({ role: h.role, content: h.content })),
      { role: "user" as const, content: userContent },
    ] as Anthropic.MessageParam[]

    // --- Stream Claude ---
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() })
      const stream = client.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      })
      stream.on("text", (text) => {
        res.write(sse({ delta: text }))
      })
      await stream.finalMessage()
      done(sources)
    } catch (err) {
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
