import { describe, it, expect } from "vitest"
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET, rejectsForcedToolChoice, thinkingParamsFor } from "../modelParams"
import {
  buildExtractionRequest,
  extractionContent,
  extractParsedResult,
  EXTRACTION_TOOL,
  isRetryableExtractionReply,
  MalformedExtractionError,
  MAX_EXTRACTION_CALLS,
  NoToolCallError,
  readExtraction,
  repairStringifiedFields,
} from "../parsePrompt"
import { pickParseModel } from "../pickParseModel"

// Each of these request shapes is an HTTP 400 on the model it guards against,
// and none of them is visible to the type checker.
describe("per-model request rules", () => {
  it("routes to the current model IDs", () => {
    expect(pickParseModel({ item_category: "appliance" })).toBe("claude-sonnet-5")
    expect(pickParseModel({ item_category: "system" })).toBe("claude-opus-5-5")
  })

  it("Opus 5.5 never gets forced tool_choice, a thinking field, or temperature", () => {
    const req = buildExtractionRequest(MODEL_OPUS, "cGRm", "prompt")
    expect(req.params.tool_choice).toEqual({ type: "auto" })
    expect(req.toolCallUnforced).toBe(true)
    expect(req.params.thinking).toBeUndefined()
    expect(req.params.temperature).toBeUndefined()
    expect(req.params.output_config).toEqual({ effort: "medium" })
    expect(req.params.fallbacks).toBe("default")
    expect(req.betas).toContain("server-side-fallback-2026-07-01")
    expect(req.stream).toBe(true) // 32k max_tokens is over the SDK non-streaming ceiling
    expect(req.params.max_tokens as number).toBeGreaterThanOrEqual(16000)
  })

  it("Sonnet 5 keeps the forced tool, sends no thinking field, drops temperature", () => {
    const req = buildExtractionRequest(MODEL_SONNET, "cGRm", "prompt")
    expect(req.toolCallUnforced).toBe(false)
    expect(req.params.tool_choice).toEqual({ type: "tool", name: EXTRACTION_TOOL.name })
    // Disabling thinking on the forced call made Sonnet 5 stringify `chunks`.
    expect(req.params.thinking).toBeUndefined()
    expect(req.params.temperature).toBeUndefined()
    expect(req.betas).toEqual([])
    expect(thinkingParamsFor(MODEL_SONNET)).toEqual({ thinking: { type: "disabled" } }) // text routes
  })

  it("Haiku 4.5 is left alone", () => {
    expect(rejectsForcedToolChoice(MODEL_HAIKU)).toBe(false)
    expect(thinkingParamsFor(MODEL_HAIKU)).toEqual({})
  })
})

describe("extractionContent", () => {
  it("throws on a refusal instead of returning an empty extraction", () => {
    expect(() => extractionContent({ stop_reason: "refusal", content: [] }, true)).toThrow(/declined/)
    expect(() => extractionContent({ stop_reason: "refusal", content: [] }, false)).toThrow(/declined/)
  })

  it("unforced route: a text-only answer is an error, not a free-text JSON parse", () => {
    const res = { stop_reason: "end_turn", content: [{ type: "text", text: '{"chunks":[],"tasks":[]}' }] }
    expect(() => extractionContent(res, true)).toThrow(NoToolCallError)
  })

  it("unforced route: the tool call's input is what the worker reads", () => {
    const out = extractionContent(
      {
        stop_reason: "tool_use",
        content: [
          { type: "thinking", text: "" },
          { type: "tool_use", name: EXTRACTION_TOOL.name, input: { chunks: [], tasks: [{ title: "Clean filter" }] } },
        ],
      },
      true,
    )
    expect(extractParsedResult(out)).toEqual({ chunks: [], tasks: [{ title: "Clean filter" }] })
  })
})

describe("repairStringifiedFields (Sonnet 5 stringified tool arguments)", () => {
  it("decodes an array argument sent as a JSON string", () => {
    const out = repairStringifiedFields({ chunks: '[{"title":"a"}]', tasks: [{ title: "t" }] })
    expect(out).toEqual({ chunks: [{ title: "a" }], tasks: [{ title: "t" }] })
  })

  it("recovers the rest of the object when the string swallowed it", () => {
    const swallowed = '[{"title":"a"}], "tasks": [{"title":"t"}], "warranty": null, "confidence": {"overall": 0.8}}'
    const out = repairStringifiedFields({ chunks: swallowed })
    expect(out).toEqual({ chunks: [{ title: "a" }], tasks: [{ title: "t" }], warranty: null, confidence: { overall: 0.8 } })
  })

  it("leaves undecodable strings alone so the worker's guard still fails loudly", () => {
    expect(repairStringifiedFields({ chunks: "not json", tasks: [] })).toEqual({ chunks: "not json", tasks: [] })
  })

  it("leaves well-formed input untouched", () => {
    const input = { chunks: [], tasks: [], manufactured_year: null }
    expect(repairStringifiedFields(input)).toBe(input)
  })
})

describe("readExtraction (the commitable-draft guard) and the one retry", () => {
  const reply = (input: unknown) => ({ content: [{ type: "tool_use", name: EXTRACTION_TOOL.name, input }] })

  it("returns the tool call's arguments when chunks and tasks are arrays", () => {
    const out = readExtraction(reply({ chunks: [{ title: "a" }], tasks: [] }))
    expect(out).toEqual({ chunks: [{ title: "a" }], tasks: [] })
  })

  it("accepts a stringified field the repair can decode", () => {
    expect(readExtraction(reply({ chunks: '[{"title":"a"}]', tasks: [] })).chunks).toEqual([{ title: "a" }])
  })

  // The two replies measured 2026-11-17. Neither is valid JSON inside the
  // string, so neither is repairable — and neither is guessed at.
  it.each([
    ["tasks: a string with an unquoted key", { chunks: [], tasks: '[{"title":"Run Initial Cleaning Cycles",description:"x"}]' }, "chunks array(0), tasks string(57)"],
    ["chunks: swallowed the object, unbalanced inside", { chunks: '[{"rows":[["a"]]]},"applies_to":[]}],"tasks":[]}' }, "chunks string(48), tasks missing"],
    ["an empty call", {}, "chunks missing, tasks missing"],
  ])("throws the TYPED error for %s, saying what arrived but not its content", (_label, input, shape) => {
    let thrown: unknown
    try {
      readExtraction(reply(input))
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(MalformedExtractionError)
    expect((thrown as MalformedExtractionError).shape).toBe(shape)
    // The prefix the stored breadcrumb has always had; humanizeParseError keys on it.
    expect((thrown as Error).message).toBe(`malformed extraction: chunks/tasks not arrays (${shape})`)
  })

  it("one retry, for an unusable reply only — and never for one cut off at max_tokens", () => {
    expect(MAX_EXTRACTION_CALLS).toBe(2)
    const malformed = new MalformedExtractionError("chunks string(9), tasks missing")
    expect(isRetryableExtractionReply(malformed, "tool_use")).toBe(true)
    expect(isRetryableExtractionReply(new NoToolCallError("end_turn"), "end_turn")).toBe(true)
    // Truncated arguments: the same manual runs out of room the same way.
    expect(isRetryableExtractionReply(malformed, "max_tokens")).toBe(false)
    // No tool call is retried whatever stopped it (the rule since the Opus route existed).
    expect(isRetryableExtractionReply(new NoToolCallError("max_tokens"), "max_tokens")).toBe(true)
    // Decided by type. A look-alike message is not enough.
    expect(isRetryableExtractionReply(new Error("malformed extraction: chunks/tasks not arrays"), "tool_use")).toBe(false)
    expect(isRetryableExtractionReply(new Error("The AI declined to answer this request."), "refusal")).toBe(false)
  })
})
