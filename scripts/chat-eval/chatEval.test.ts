import { describe, it, expect } from "vitest"
import { buildChatRequest, cachedPrefix, type ChatChunk, type ChatRequestInput, type PdfDoc } from "../../shared/chat/chatMessages.js"
import main from "../../shared/chat/__tests__/fixtures/main-chat-requests.json" with { type: "json" }
import corpusFile from "../parse-eval/corpus.json" with { type: "json" }
import goldensFile from "./goldens.json" with { type: "json" }
import {
  goldenProblems,
  goldenRequest,
  normalizeForMatch,
  requestShapeProblems,
  scoreAnswer,
  toLatestTurnLayout,
  usageCost,
  type Goldens,
} from "./chatEval.js"

const goldens: Goldens = goldensFile
const corpus: Array<{ name: string; manual_id: string }> = corpusFile.manuals
const systemPrompts: Record<string, string> = main.systemPrompts
const PLAIN_PDF_SYSTEM = systemPrompts["pdf|web=0|warranty=0|notes=0"]
const PDF = "JVBERi0xLjQK" // a placeholder: the offline eval asserts shape, never content

type FixtureScenario = {
  input: {
    question: string
    history: unknown
    pdfDocs: Array<{ source: { data: string }; title: string }>
    chunks: ChatChunk[]
    warrantyBlock: string
    notesBlock: string
    webContextBlock: string
  }
  main: { system: string; messages: unknown[] }
}
const scenarios: Record<string, FixtureScenario> = main.scenarios
const inputOf = (s: FixtureScenario): ChatRequestInput => ({
  ...s.input,
  pdfDocs: s.input.pdfDocs.map(
    (d): PdfDoc => ({ type: "document", source: { type: "base64", media_type: "application/pdf", data: d.source.data }, title: d.title }),
  ),
})

// The live eval's "before" arm must BE main's request, or its comparison means
// nothing. This holds it to main's own output for every captured shape.
describe("toLatestTurnLayout reproduces main's pre-caching request", () => {
  it.each(Object.keys(scenarios))("%s", (name) => {
    const s = scenarios[name]
    const built = buildChatRequest(inputOf(s)).params
    const before = toLatestTurnLayout(built)
    expect(before.messages).toEqual(s.main.messages)
    expect(before.system).toBe(s.main.system)
    expect(JSON.stringify(before)).not.toContain("cache_control")
  })

  it("does not modify the request it was given", () => {
    const built = buildChatRequest(inputOf(scenarios["follow-up-one-pdf"])).params
    const snapshot = JSON.stringify(built)
    toLatestTurnLayout(built)
    expect(JSON.stringify(built)).toBe(snapshot)
  })
})

describe("the golden set", () => {
  it("is well-formed: 10 questions, corpus manuals, 2–3 must-contain groups each", () => {
    expect(goldenProblems(goldens, corpus)).toEqual([])
  })

  const turns = goldens.conversations.flatMap((c) => c.turns.map((t, i) => ({ c, t, i })))
  it.each(turns.map(({ c, t, i }) => [t.id, c, i] as const))(
    "%s: PDF first with the breakpoint, question last, system text byte-identical to main",
    (_id, c, i) => {
      const priorAnswers = c.turns.slice(0, i).map((t) => `(answer to ${t.id})`)
      const { params } = goldenRequest(c, i, priorAnswers, PDF)
      expect(requestShapeProblems(params, c.turns[i].question, PLAIN_PDF_SYSTEM)).toEqual([])
    },
  )

  it.each(goldens.conversations.map((c) => [c.id, c] as const))(
    "%s: the follow-up repeats the first turn's cached prefix byte for byte",
    (_id, c) => {
      const turn1 = cachedPrefix(goldenRequest(c, 0, [], PDF).params)
      const turn2 = cachedPrefix(goldenRequest(c, 1, ["(first answer)"], PDF).params)
      expect(turn1).not.toBeNull()
      expect(JSON.stringify(turn2)).toBe(JSON.stringify(turn1))
    },
  )

  it("the shape check is not vacuous: main's layout fails it", () => {
    const c = goldens.conversations[0]
    const before = toLatestTurnLayout(goldenRequest(c, 1, ["(first answer)"], PDF).params)
    const problems = requestShapeProblems(before, c.turns[1].question, PLAIN_PDF_SYSTEM)
    expect(problems).toContain("the first user turn does not start with the PDF")
    expect(problems).toContain("expected exactly one cache breakpoint, found 0")
    expect(requestShapeProblems(goldenRequest(c, 0, [], PDF).params, c.turns[0].question, "a different system prompt")).toEqual([
      "system prompt differs from main's",
    ])
  })
})

describe("scoring an answer", () => {
  it("matches any phrase of each group, ignoring case, dash style and markdown", () => {
    expect(normalizeForMatch("Every **3–6 Months**")).toBe("every 3-6 months")
    expect(normalizeForMatch("3 - 6 months")).toBe("3-6 months")
    const r = scoreAnswer("Replace them every **3–6 months** (about 500 cycle hours).", [["3-6 months", "3 to 6 months"], ["500"]])
    expect(r).toEqual({ pass: true, missing: [] })
  })

  it("names the groups an answer missed", () => {
    const r = scoreAnswer("Twist the filter counterclockwise.", [["unplug"], ["counterclockwise", "counter-clockwise"], ["drain hose"]])
    expect(r).toEqual({ pass: false, missing: [["unplug"], ["drain hose"]] })
  })
})

describe("what a call cost (Sonnet 5)", () => {
  it("a 100K-token cache write costs 25% more than sending it uncached; a read costs 10%", () => {
    const write = usageCost({ input_tokens: 0, cache_creation_input_tokens: 100_000, cache_read_input_tokens: 0, output_tokens: 0 })
    expect(write.actual).toBeCloseTo(0.25, 10)
    expect(write.uncached).toBeCloseTo(0.2, 10)
    const read = usageCost({ input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 100_000, output_tokens: 0 })
    expect(read.actual).toBeCloseTo(0.02, 10)
    expect(read.uncached).toBeCloseTo(0.2, 10)
  })
})
