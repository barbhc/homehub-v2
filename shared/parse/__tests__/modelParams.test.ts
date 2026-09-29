import { describe, it, expect } from "vitest"
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET, rejectsForcedToolChoice, thinkingParamsFor } from "../modelParams"
import { buildExtractionRequest, extractionContent, extractParsedResult, EXTRACTION_TOOL, NoToolCallError, repairStringifiedFields } from "../parsePrompt"
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

describe("extraction prompt caching", () => {
  // tools → system → PDF is the cached prefix; the per-call prompt text must
  // come after the breakpoint or every call would write a new cache entry.
  it.each([MODEL_SONNET, MODEL_OPUS])("%s: breakpoint on the PDF, prompt text after it", (model) => {
    const req = buildExtractionRequest(model, "cGRm", "prompt")
    const content = (req.params.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content
    expect(content[0].type).toBe("document")
    expect(content[0].cache_control).toEqual({ type: "ephemeral" })
    expect(content[1]).toEqual({ type: "text", text: "prompt" })
  })
})
