/**
 * Capture what chatQuery sent BEFORE prompt caching, as a fixture the new
 * request builder is held to (shared/chat/__tests__/fixtures/main-chat-requests.json).
 *
 * Until 2026-09-30 chatQuery assembled its Claude request inline, inside the
 * request handler — there was no function to call. So this script reads the
 * handler's source at a given commit (`git show`), cuts out the assembly block
 * (from `const webSearchRules =` to the `messages` array), strips the types
 * with the TypeScript compiler and runs it on the scenarios below. The fixture
 * is therefore main's OWN code's output, not a re-typing of it:
 *
 *   - `systemPrompts`: all 16 system texts (PDF or excerpts × web-search,
 *     warranty and notes rules on or off);
 *   - `scenarios`: the full request for each input — the shapes the Ask client
 *     really sends (the first question, a follow-up, a retry, a web search, a
 *     conversation long enough to be trimmed, two manuals, excerpts only).
 *
 * shared/chat/__tests__/chatMessages.test.ts then asserts that the new builder
 * produces the same system text byte for byte, and the same messages once the
 * PDFs are moved back to where main put them (scripts/chat-eval/layout.ts) —
 * i.e. that the ONLY change is where the PDFs sit and the cache breakpoint.
 *
 * Re-run (free, no network): npx vite-node scripts/chat-eval/capture-main-fixture.ts -- --from=5e9674b
 * then `git diff` the fixture — it must not change.
 */
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "..", "..")
const OUT = join(ROOT, "shared", "chat", "__tests__", "fixtures", "main-chat-requests.json")
const SOURCE_PATH = "firebase/functions/src/ai/chatQuery.ts"

const from = process.argv.find((a) => a.startsWith("--from="))?.slice(7) ?? "5e9674b"
const source = execFileSync("git", ["show", `${from}:${SOURCE_PATH}`], { cwd: ROOT, encoding: "utf8" })

function between(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker)
  if (start < 0) throw new Error(`marker not found: ${startMarker}`)
  const endAt = src.indexOf(endMarker, start)
  if (endAt < 0) throw new Error(`marker not found: ${endMarker}`)
  return src.slice(start, src.indexOf("\n", endAt))
}

const assembly = between(source, "    const webSearchRules =", "] as Anthropic.MessageParam[]")
const maxHistory = Number(/const MAX_HISTORY_TURNS = (\d+)/.exec(source)?.[1])
const streamCall = between(source, "client.messages.stream({", "messages,")
const model = /model: "([^"]+)"/.exec(streamCall)?.[1]
const maxTokens = Number(/max_tokens: (\d+)/.exec(streamCall)?.[1])
const thinkingModel = /\.\.\.thinkingParamsFor\("([^"]+)"\)/.exec(streamCall)?.[1]
if (!Number.isInteger(maxHistory) || !model || !Number.isInteger(maxTokens) || !thinkingModel) {
  throw new Error("could not read MAX_HISTORY_TURNS / the stream call's model, max_tokens or thinking from the source")
}
// thinkingParamsFor(model) at that commit: Sonnet 5 → thinking disabled (shared/parse/modelParams.ts).
const thinking = /^claude-sonnet-5\b/.test(thinkingModel) ? { type: "disabled" } : undefined

const wrapped = `function mainChat(input) {
  const { question, history, pdfDocs, chunks, warrantyBlock, notesBlock, webContextBlock } = input
  const MAX_HISTORY_TURNS = ${maxHistory}
  const hasPdfs = pdfDocs.length > 0
${assembly}
  return { systemPrompt, messages }
}`
const js = ts.transpileModule(wrapped, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText

type Turn = { role: "user" | "assistant"; content: string }
type Pdf = { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string }; title: string }
type Chunk = { title: string | null; content: string; displayName: string }
interface ScenarioInput {
  question: string
  history: Turn[]
  pdfDocs: Pdf[]
  chunks: Chunk[]
  warrantyBlock: string
  notesBlock: string
  webContextBlock: string
}
const mainChat = new Function(`${js}\nreturn mainChat`)() as (input: ScenarioInput) => { systemPrompt: string; messages: unknown[] }

const pdf = (itemName: string, data: string): Pdf => ({
  type: "document",
  source: { type: "base64", media_type: "application/pdf", data },
  title: `${itemName} Owner's Manual`,
})
const FOODCYCLER = pdf("FoodCycler FC-50", "JVBERi0xLjQKZm9vZGN5Y2xlcg==")
const FURNACE = pdf("York TG9S Furnace", "JVBERi0xLjQKZnVybmFjZQ==")
const WARRANTY =
  "## Warranty on record\n### FoodCycler FC-50\n- Coverage: 3 years, parts and labor\n- Purchased: 2025-06-01\n- Expires: 2028-06-01 (in 32 months)"
const NOTES =
  "## Your notes\n- FoodCycler FC-50 (item): Spare carbon filters are in the hall closet, top shelf.\n- Kitchen (room): The outlet by the window is on the GFCI."
const WEB =
  '---\n## Web search results for: "FoodCycler FC-50" How long do the filters last?\n### [FoodCycler filter FAQ](https://example.com/faq)\nFilters last about 3 months.\n---'
const CHUNKS: Chunk[] = [
  { title: "Air Filter Replacement", content: "Replace or clean the filter regularly; a dirty filter is the most common cause of limit trips.", displayName: "York TG9S Furnace" },
  { title: null, content: "Inspect the condensate hoses for sagging loops.", displayName: "York TG9S Furnace" },
]
const base: ScenarioInput = { question: "", history: [], pdfDocs: [], chunks: [], warrantyBlock: "", notesBlock: "", webContextBlock: "" }
const u = (content: string): Turn => ({ role: "user", content })
const a = (content: string): Turn => ({ role: "assistant", content })

// What the Ask client sends as `history` (src/pages/ChatPage.tsx):
//   send     → every earlier message AND the question being asked
//   retry    → the messages before the failed exchange, without the question
//   web      → earlier messages minus the question, plus the answer being extended
const longHistory: Turn[] = []
for (let i = 1; i <= 5; i++) longHistory.push(u(`Question ${i}?`), a(`Answer ${i}.`))
longHistory.push(u("Question 6?"))

const scenarios: Record<string, ScenarioInput> = {
  "first-question-one-pdf": { ...base, question: "How do I replace the carbon filters?", history: [u("How do I replace the carbon filters?")], pdfDocs: [FOODCYCLER] },
  "follow-up-one-pdf": {
    ...base,
    question: "How often should I do that?",
    history: [u("How do I replace the carbon filters?"), a("Pull down the back panel tab, then unscrew each filter counter-clockwise."), u("How often should I do that?")],
    pdfDocs: [FOODCYCLER],
  },
  "retry-empty-history": { ...base, question: "How do I replace the carbon filters?", history: [], pdfDocs: [FOODCYCLER] },
  "web-search-assistant-first": {
    ...base,
    question: "How long do the filters last?",
    history: [a("The manual doesn't say how long the filters last.")],
    pdfDocs: [FOODCYCLER],
    webContextBlock: WEB,
  },
  "long-conversation-trimmed": { ...base, question: "Question 6?", history: longHistory, pdfDocs: [FOODCYCLER] },
  "two-pdfs-warranty-notes": {
    ...base,
    question: "Is my FoodCycler still under warranty, and where are the spare filters?",
    history: [u("Is my FoodCycler still under warranty, and where are the spare filters?")],
    pdfDocs: [FOODCYCLER, FURNACE],
    warrantyBlock: WARRANTY,
    notesBlock: NOTES,
  },
  "excerpts-with-notes": {
    ...base,
    question: "How often should the furnace filter be changed?",
    history: [u("How often should the furnace filter be changed?")],
    chunks: CHUNKS,
    notesBlock: NOTES,
  },
  "notes-only-no-manual": { ...base, question: "Where are the spare filters?", history: [u("Where are the spare filters?")], notesBlock: NOTES },
  "excerpts-web-follow-up": {
    ...base,
    question: "And the condensate line?",
    history: [u("How often should the furnace filter be changed?"), a("Monthly during heating season."), u("And the condensate line?")],
    chunks: CHUNKS,
    webContextBlock: WEB,
  },
}

const systemPrompts: Record<string, string> = {}
for (const hasPdfs of [true, false]) {
  for (const web of [false, true]) {
    for (const warranty of [false, true]) {
      for (const notes of [false, true]) {
        const key = `${hasPdfs ? "pdf" : "excerpts"}|web=${+web}|warranty=${+warranty}|notes=${+notes}`
        systemPrompts[key] = mainChat({
          ...base,
          question: "q",
          pdfDocs: hasPdfs ? [FOODCYCLER] : [],
          webContextBlock: web ? WEB : "",
          warrantyBlock: warranty ? WARRANTY : "",
          notesBlock: notes ? NOTES : "",
        }).systemPrompt
      }
    }
  }
}

const out = {
  comment:
    "chatQuery's Claude request as origin/main assembled it before prompt caching — produced by RUNNING main's own " +
    "assembly code (scripts/chat-eval/capture-main-fixture.ts), not re-typed. The new builder must match `systemPrompts` " +
    "byte for byte, and each scenario's `main` request once its PDFs are moved back to the latest user turn.",
  capturedFrom: `${from}:${SOURCE_PATH}`,
  stream: { model, max_tokens: maxTokens, ...(thinking ? { thinking } : {}) },
  maxHistoryTurns: maxHistory,
  systemPrompts,
  scenarios: Object.fromEntries(
    Object.entries(scenarios).map(([name, input]) => {
      const { systemPrompt, messages } = mainChat(input)
      return [name, { input, main: { system: systemPrompt, messages } }]
    }),
  ),
}
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n")
console.log(`wrote ${OUT}: ${Object.keys(systemPrompts).length} system prompts, ${Object.keys(scenarios).length} scenarios (from ${from})`)
