/**
 * Ask's Claude request (chatQuery), assembled in one pure function — the
 * request the function streams AND the one the offline chat eval
 * (scripts/chat-eval) asserts, so the two cannot drift.
 *
 * ── Why the manual PDFs lead the conversation (prompt caching, 2026-09-30) ───
 *
 * An item-scoped question sends each in-scope manual as a WHOLE PDF — often
 * 100K+ input tokens, nearly all of a turn's cost — and every follow-up used to
 * send it again at full price. Prompt caching bills a re-read of an identical
 * prefix at 0.1× the input price (Sonnet 5: $0.20 instead of $2 per million
 * tokens) after a first write at 1.25× ($2.50). A cache prefix is rendered
 * tools → system → messages and must match byte for byte up to the breakpoint,
 * so:
 *
 *  - the PDFs go FIRST in the FIRST user turn, with the `cache_control`
 *    breakpoint on the last PDF. What the breakpoint covers — the system prompt
 *    and the PDFs — is then identical on every turn of a conversation about the
 *    same manual(s), however the history grows or gets trimmed;
 *  - the question, and the warranty / notes / web blocks that change per
 *    question, stay in the LATEST user turn, after the breakpoint, uncached.
 *
 * Before 2026-09-30 the PDFs rode on the latest user turn, so the prefix changed
 * every turn and nothing could ever be read back.
 *
 * What still changes the prefix: the system prompt is part of it, and it
 * carries three conditional rule lines (web search, warranty, notes). A turn
 * whose rule lines differ from the cached turn's misses, and pays the 1.25×
 * write on that turn. The rule TEXT is left exactly as it was on purpose —
 * moving those lines after the breakpoint would change what the model reads,
 * which is a prompt change and goes through the chat eval first.
 *
 * The wording is v1's, byte for byte (answer quality depends on it):
 * __tests__/chatMessages.test.ts holds all sixteen system-prompt variants to
 * main's own output (fixtures/main-chat-requests.json).
 */
import { MODEL_SONNET, thinkingParamsFor } from "../parse/modelParams.js"

/** Ask's model: Sonnet 5, thinking off (modelParams.ts), a short answer budget. */
export const CHAT_MODEL = MODEL_SONNET
export const CHAT_MAX_TOKENS = 1024

/** The most earlier messages one question carries. The client sends the whole
 *  thread; older turns are dropped here. */
export const MAX_HISTORY_TURNS = 10

/** One manual attached whole. */
export type PdfDoc = {
  type: "document"
  source: { type: "base64"; media_type: "application/pdf"; data: string }
  title?: string
}

/** A prompt-cache breakpoint: the 5-minute TTL (1.25× write, 0.1× read). */
export type CacheControl = { type: "ephemeral" }

export type ChatContentBlock = (PdfDoc & { cache_control?: CacheControl }) | { type: "text"; text: string }

export type ChatTurn = { role: "user" | "assistant"; content: string }

export type ChatMessage = { role: "user" | "assistant"; content: string | ChatContentBlock[] }

/** One parsed-manual excerpt, used when no PDF is attached. */
export type ChatChunk = { title: string | null; content: string; displayName: string }

/** Which of the system prompt's conditional rule lines a question carries. */
export interface ChatRules {
  webSearch: boolean
  warranty: boolean
  notes: boolean
}

/** Text of the synthetic leading user turn used when the trimmed history opens
 *  on an assistant reply (a web-search follow-up; the sixth question onward):
 *  roles must start with the user, and the PDFs need a first user turn to lead. */
export const PDF_ONLY_TURN_TEXT = "Attached: the owner's manual for this conversation."

const WEB_SEARCH_RULES =
  "\n- Web search results are appended below the manual content when available. You may reference them to supplement the manual, but always prefer manual information when both cover the same topic. Cite web sources by their title when you use them."

const WARRANTY_RULES =
  '\n- A "Warranty on record" block, when present, is what the app has stored for that item: its coverage, purchase and expiry dates, exclusions and registration. Treat it as the authority for warranty questions — quote its dates and terms exactly, and do not contradict it from general knowledge. If it lacks something the person asked about, say what is and is not on record.'

const NOTES_RULES =
  '\n- A "Your notes" block, when present, is what this household wrote down about their own home — where things are, what they chose, what they noticed. For those facts it is the authority: say it comes from their notes, quote it, and never contradict it from general knowledge.'

/** The system prompt: one of two bases (manual PDF attached, or excerpts), plus
 *  the rule line for each block the question carries. Byte-identical to main. */
export function chatSystemPrompt(opts: ChatRules & { hasPdfs: boolean }): string {
  const webSearchRules = opts.webSearch ? WEB_SEARCH_RULES : ""
  const warrantyRules = opts.warranty ? WARRANTY_RULES : ""
  const notesRules = opts.notes ? NOTES_RULES : ""
  return opts.hasPdfs
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
}

/** The excerpts block, when the answer comes from parsed chunks. */
export function formatChunkContext(chunks: readonly ChatChunk[]): string {
  return chunks.map((c) => `## ${c.displayName} — ${c.title ?? "Excerpt"}\n${c.content}`).join("\n\n")
}

/** The latest user turn's text: the question, then whatever blocks it carries. */
export function chatUserText(parts: {
  question: string
  hasPdfs: boolean
  chunkContext: string
  warrantyBlock: string
  notesBlock: string
  webContextBlock: string
}): string {
  const { question, hasPdfs, chunkContext, warrantyBlock, notesBlock, webContextBlock } = parts
  return hasPdfs
    ? [question, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
    : chunkContext
      ? [question, "---", chunkContext, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
      : [question, warrantyBlock, notesBlock, webContextBlock].filter((s) => s.length > 0).join("\n\n")
}

/**
 * The `history` the client sent, as turns the API accepts: user or assistant,
 * with non-blank string content — then the last MAX_HISTORY_TURNS of them. The
 * body arrives as JSON, so nothing about it is trusted: an entry of any other
 * shape (an array of content blocks, a "system" role, an empty string) is
 * dropped rather than passed to Claude, and counted so the caller can log it.
 * The Ask client only ever sends well-formed turns, so for it this is the old
 * trim unchanged.
 */
export function normalizeHistory(raw: unknown): { turns: ChatTurn[]; dropped: number } {
  const entries: unknown[] = Array.isArray(raw) ? raw : []
  const turns: ChatTurn[] = []
  for (const e of entries) {
    if (typeof e !== "object" || e === null || !("role" in e) || !("content" in e)) continue
    const { role, content } = e
    if ((role === "user" || role === "assistant") && typeof content === "string" && content.trim().length > 0) {
      turns.push({ role, content })
    }
  }
  return { turns: turns.slice(-MAX_HISTORY_TURNS), dropped: entries.length - turns.length }
}

/**
 * The messages: the history, then the latest user turn — and, when manuals are
 * attached, the PDFs at the front of the FIRST user turn with the cache
 * breakpoint on the last PDF (see the header for why the first turn, not the
 * latest). Only the PDF blocks are before the breakpoint; the question never is.
 */
export function buildChatMessages(
  history: readonly ChatTurn[],
  userText: string,
  pdfDocs: readonly PdfDoc[],
): { messages: ChatMessage[]; syntheticPdfTurn: boolean } {
  const messages: ChatMessage[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: [{ type: "text", text: userText }] },
  ]
  if (pdfDocs.length === 0) return { messages, syntheticPdfTurn: false }

  const cachedPdfs: ChatContentBlock[] = pdfDocs.map((d, i) =>
    i === pdfDocs.length - 1 ? { ...d, cache_control: { type: "ephemeral" } } : { ...d },
  )
  const first = messages[0]
  if (first.role === "user") {
    const firstBlocks: ChatContentBlock[] =
      typeof first.content === "string" ? [{ type: "text", text: first.content }] : first.content
    messages[0] = { role: "user", content: [...cachedPdfs, ...firstBlocks] }
    return { messages, syntheticPdfTurn: false }
  }
  // Roles must start with the user: give the PDFs their own leading turn.
  messages.unshift({ role: "user", content: [...cachedPdfs, { type: "text", text: PDF_ONLY_TURN_TEXT }] })
  return { messages, syntheticPdfTurn: true }
}

/**
 * What a request's cache breakpoint covers: the system prompt and every message
 * block up to and including the last marked one — the bytes the next turn must
 * repeat exactly to read the cache. Null when nothing is marked. (The tests and
 * the chat eval use it; chatQuery sends `params` as-is.)
 */
export function cachedPrefix(params: {
  system: string
  messages: readonly ChatMessage[]
}): { system: string; messages: ChatMessage[] } | null {
  for (let i = params.messages.length - 1; i >= 0; i--) {
    const { role, content } = params.messages[i]
    if (typeof content === "string") continue
    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j]
      if (block.type === "document" && block.cache_control) {
        return { system: params.system, messages: [...params.messages.slice(0, i), { role, content: content.slice(0, j + 1) }] }
      }
    }
  }
  return null
}

export interface ChatRequestInput {
  question: string
  /** The request body's `history`, unvalidated. */
  history: unknown
  /** Manuals attached whole, in a stable order (a changed order is a cache miss). */
  pdfDocs: readonly PdfDoc[]
  /** Excerpts, used only when no PDF is attached. */
  chunks: readonly ChatChunk[]
  warrantyBlock: string
  notesBlock: string
  webContextBlock: string
}

export interface ChatRequest {
  /** The Messages API body chatQuery streams. */
  params: {
    model: string
    max_tokens: number
    thinking?: { type: "disabled" }
    system: string
    messages: ChatMessage[]
  }
  /** What shaped this request's cache prefix — for the usage log line. */
  meta: {
    pdfs: number
    historyTurns: number
    droppedHistoryTurns: number
    syntheticPdfTurn: boolean
    rules: ChatRules
  }
}

/** THE chat request. chatQuery streams `params` as-is. */
export function buildChatRequest(input: ChatRequestInput): ChatRequest {
  const hasPdfs = input.pdfDocs.length > 0
  const rules: ChatRules = {
    webSearch: input.webContextBlock.length > 0,
    warranty: input.warrantyBlock.length > 0,
    notes: input.notesBlock.length > 0,
  }
  const chunkContext = input.chunks.length > 0 ? formatChunkContext(input.chunks) : ""
  const userText = chatUserText({
    question: input.question,
    hasPdfs,
    chunkContext,
    warrantyBlock: input.warrantyBlock,
    notesBlock: input.notesBlock,
    webContextBlock: input.webContextBlock,
  })
  const history = normalizeHistory(input.history)
  const { messages, syntheticPdfTurn } = buildChatMessages(history.turns, userText, input.pdfDocs)
  return {
    params: {
      model: CHAT_MODEL,
      max_tokens: CHAT_MAX_TOKENS,
      // Sonnet 5 thinks by default; this route streamed thinking-off on
      // Sonnet 4.6 with a 1024-token answer budget, so keep it off.
      ...thinkingParamsFor(CHAT_MODEL),
      system: chatSystemPrompt({ hasPdfs, ...rules }),
      messages,
    },
    meta: {
      pdfs: input.pdfDocs.length,
      historyTurns: history.turns.length,
      droppedHistoryTurns: history.dropped,
      syntheticPdfTurn,
      rules,
    },
  }
}
