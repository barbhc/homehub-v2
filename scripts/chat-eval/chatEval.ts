/**
 * The chat eval's pure half: build the request chatQuery would send for a
 * golden, check its shape, turn it back into main's pre-caching layout, and
 * score an answer. No I/O and no network — run.ts does those — so vitest
 * covers all of it (chatEval.test.ts).
 */
import {
  buildChatRequest,
  cachedPrefix,
  PDF_ONLY_TURN_TEXT,
  type ChatContentBlock,
  type ChatMessage,
  type ChatRequest,
  type ChatTurn,
  type PdfDoc,
} from "../../shared/chat/chatMessages.js"

export interface GoldenTurn {
  id: string
  question: string
  expected: { manualId: string; chunks: Array<{ title: string; sourcePages: number[] }> }
  /** Each group is one fact: the answer must contain ANY phrase of EVERY group. */
  mustContain: string[][]
}

export interface GoldenConversation {
  id: string
  /** The parse eval's corpus name (scripts/parse-eval/corpus.json). */
  manual: string
  manualId: string
  /** As chatQuery titles the attached PDF: "<itemName> Owner's Manual". */
  itemName: string
  turns: GoldenTurn[]
}

export interface Goldens {
  conversations: GoldenConversation[]
}

/** Which layout a request uses: this branch's, or main's before prompt caching. */
export type Layout = "first-turn" | "latest-turn"

/** The manual as chatQuery attaches it (chatQuery.ts builds the same object). */
export function manualPdf(itemName: string, base64: string): PdfDoc {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
    title: `${itemName} Owner's Manual`,
  }
}

/**
 * The `history` the Ask client sends for turn `turnIndex` (src/pages/ChatPage.tsx,
 * handleSend): every earlier message AND the question being asked.
 */
export function clientHistory(conversation: GoldenConversation, turnIndex: number, priorAnswers: readonly string[]): ChatTurn[] {
  const history: ChatTurn[] = []
  for (let i = 0; i < turnIndex; i++) {
    history.push({ role: "user", content: conversation.turns[i].question })
    history.push({ role: "assistant", content: priorAnswers[i] ?? "(no answer)" })
  }
  history.push({ role: "user", content: conversation.turns[turnIndex].question })
  return history
}

/** The request chatQuery would send for this turn: one manual attached whole,
 *  no notes, warranty or web results. */
export function goldenRequest(
  conversation: GoldenConversation,
  turnIndex: number,
  priorAnswers: readonly string[],
  pdfBase64: string,
): ChatRequest {
  return buildChatRequest({
    question: conversation.turns[turnIndex].question,
    history: clientHistory(conversation, turnIndex, priorAnswers),
    pdfDocs: [manualPdf(conversation.itemName, pdfBase64)],
    chunks: [],
    warrantyBlock: "",
    notesBlock: "",
    webContextBlock: "",
  })
}

const blocksOf = (m: ChatMessage): ChatContentBlock[] => (typeof m.content === "string" ? [] : m.content)

/**
 * What the offline eval asserts about one request. Empty = fine.
 *   - the system text is byte-identical to main's (`expectedSystem`, from the fixture);
 *   - the PDFs lead the FIRST user turn, and the one cache breakpoint is on the last PDF;
 *   - the question is the request's last block, after the breakpoint.
 */
export function requestShapeProblems(params: ChatRequest["params"], question: string, expectedSystem: string): string[] {
  const problems: string[] = []
  if (params.system !== expectedSystem) problems.push("system prompt differs from main's")
  const first = params.messages[0]
  const lead = first ? blocksOf(first) : []
  if (!first || first.role !== "user" || lead[0]?.type !== "document") problems.push("the first user turn does not start with the PDF")
  const marked = params.messages.flatMap(blocksOf).filter((b) => b.type === "document" && b.cache_control !== undefined)
  if (marked.length !== 1) problems.push(`expected exactly one cache breakpoint, found ${marked.length}`)
  const lastPdf = lead.filter((b) => b.type === "document").pop()
  if (marked[0] !== lastPdf) problems.push("the breakpoint is not on the last PDF of the first user turn")
  const last = params.messages[params.messages.length - 1]
  const lastBlocks = last ? blocksOf(last) : []
  const tail = lastBlocks[lastBlocks.length - 1]
  if (!last || last.role !== "user" || tail?.type !== "text" || !tail.text.startsWith(question)) {
    problems.push("the question is not the last block of the request")
  }
  const prefix = cachedPrefix(params)
  if (!prefix || prefix.messages.flatMap(blocksOf).some((b) => b.type !== "document")) {
    problems.push("the cached prefix holds something other than the system prompt and the PDFs")
  }
  return problems
}

/**
 * The same request in main's layout before prompt caching: no breakpoint, the
 * PDFs in front of the question in the LATEST user turn, and no synthetic
 * PDF-only turn. layout.test in chatEval.test.ts proves this reproduces main's
 * own output for every captured scenario, so `--layout=latest-turn` in the live
 * eval is a faithful "before".
 */
export function toLatestTurnLayout(params: ChatRequest["params"]): ChatRequest["params"] {
  const messages = params.messages.map((m) => ({ ...m, content: typeof m.content === "string" ? m.content : [...m.content] }))
  const first = messages[0]
  const firstBlocks = first ? blocksOf(first) : []
  const pdfs: ChatContentBlock[] = []
  while (firstBlocks.length > 0 && firstBlocks[0].type === "document") {
    const doc = firstBlocks.shift()
    if (doc && doc.type === "document") {
      const { cache_control: _breakpoint, ...plain } = doc
      void _breakpoint
      pdfs.push(plain)
    }
  }
  if (pdfs.length === 0) return { ...params, messages }
  if (messages.length === 1) {
    messages[0] = { role: "user", content: [...pdfs, ...firstBlocks] }
    return { ...params, messages }
  }
  const synthetic = firstBlocks.length === 1 && firstBlocks[0].type === "text" && firstBlocks[0].text === PDF_ONLY_TURN_TEXT
  if (synthetic) messages.shift()
  else messages[0] = { role: "user", content: firstBlocks.length === 1 && firstBlocks[0].type === "text" ? firstBlocks[0].text : firstBlocks }
  const lastIndex = messages.length - 1
  messages[lastIndex] = { role: "user", content: [...pdfs, ...blocksOf(messages[lastIndex])] }
  return { ...params, messages }
}

/** Lowercase, one kind of dash, no space around a dash between digits, no
 *  markdown emphasis, single spaces — so "3–6 **months**" matches "3-6 months". */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/(\d)\s*-\s*(\d)/g, "$1-$2")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
}

/** Does the answer carry every fact? `missing` lists the groups it did not match. */
export function scoreAnswer(answer: string, mustContain: string[][]): { pass: boolean; missing: string[][] } {
  const text = normalizeForMatch(answer)
  const missing = mustContain.filter((group) => !group.some((phrase) => text.includes(normalizeForMatch(phrase))))
  return { pass: missing.length === 0, missing }
}

/** The system prompt's "not from your manual" marker. For these goldens the
 *  facts ARE in the manual, so an answer that falls back to it is worth a look. */
export const GENERAL_KNOWLEDGE_MARKER = "General knowledge"

/** Sonnet 5, $ per million tokens: input, a 5-minute cache write (1.25×), a cache read (0.1×), output. */
export const SONNET_5_PRICES = { input: 2, cacheWrite: 2.5, cacheRead: 0.2, output: 10 } as const

export interface UsageNumbers {
  input_tokens: number
  cache_creation_input_tokens: number
  cache_read_input_tokens: number
  output_tokens: number
}

/** What a call cost, and what it would have cost with no cache at all. */
export function usageCost(u: UsageNumbers, prices: { input: number; cacheWrite: number; cacheRead: number; output: number } = SONNET_5_PRICES) {
  const perToken = (dollarsPerMillion: number) => dollarsPerMillion / 1_000_000
  const prompt = u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens
  const actual =
    u.input_tokens * perToken(prices.input) +
    u.cache_creation_input_tokens * perToken(prices.cacheWrite) +
    u.cache_read_input_tokens * perToken(prices.cacheRead) +
    u.output_tokens * perToken(prices.output)
  const uncached = prompt * perToken(prices.input) + u.output_tokens * perToken(prices.output)
  return { actual, uncached }
}

/** Structural problems with the golden file itself (the test and run.ts both check). */
export function goldenProblems(goldens: Goldens, corpus: Array<{ name: string; manual_id: string }>): string[] {
  const problems: string[] = []
  const turns = goldens.conversations.flatMap((c) => c.turns)
  if (turns.length !== 10) problems.push(`expected 10 golden questions, found ${turns.length}`)
  const ids = new Set<string>()
  for (const c of goldens.conversations) {
    const entry = corpus.find((m) => m.name === c.manual)
    if (!entry) problems.push(`${c.id}: no corpus manual named ${c.manual}`)
    else if (entry.manual_id !== c.manualId) problems.push(`${c.id}: manualId is not corpus ${c.manual}'s`)
    for (const t of c.turns) {
      if (ids.has(t.id)) problems.push(`duplicate golden id ${t.id}`)
      ids.add(t.id)
      if (t.expected.manualId !== c.manualId) problems.push(`${t.id}: expected.manualId is not the attached manual`)
      if (t.expected.chunks.length === 0) problems.push(`${t.id}: no expected chunk`)
      if (t.mustContain.length < 2 || t.mustContain.length > 3) problems.push(`${t.id}: needs 2–3 must-contain groups`)
      if (t.mustContain.some((g) => g.length === 0 || g.some((p) => p.trim().length === 0))) problems.push(`${t.id}: empty phrase`)
    }
  }
  return problems
}
