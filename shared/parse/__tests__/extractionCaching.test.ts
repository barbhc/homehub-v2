import { createHash } from "node:crypto"
import { describe, it, expect } from "vitest"
import { MODEL_HAIKU, MODEL_OPUS, MODEL_SONNET } from "../modelParams"
import { buildExtractionRequest, buildPrompt, EXTRACTION_TOOL } from "../parsePrompt"
import fixture from "./fixtures/extraction-requests.json"

// The extraction request is what the parse eval measured. The cache breakpoint
// is a switch (config/spend.parseCacheBreakpoint, default off), so the request
// must be byte-identical to main's while it is off, and differ by exactly one
// field while it is on. `off` in the fixture was captured from main before the
// option existed.
const requests: Record<string, { off: unknown; on: unknown }> = fixture.requests
const MODELS = [MODEL_SONNET, MODEL_OPUS, MODEL_HAIKU]
const build = (model: string, opts?: { cacheBreakpoint?: boolean }) =>
  JSON.stringify(buildExtractionRequest(model, fixture.pdfBase64, fixture.prompt, opts))

describe("the extraction request, PDF cache breakpoint off and on", () => {
  it.each(MODELS)("%s: off (the default) is byte-identical to main's request", (model) => {
    const main = JSON.stringify(requests[model].off)
    expect(build(model)).toBe(main)
    expect(build(model, {})).toBe(main)
    expect(build(model, { cacheBreakpoint: false })).toBe(main)
  })

  it.each(MODELS)("%s: on adds cache_control to the document block and nothing else", (model) => {
    expect(build(model, { cacheBreakpoint: true })).toBe(JSON.stringify(requests[model].on))
  })

  it.each(MODELS)("%s: on — one breakpoint, on the PDF, with the prompt text after it", (model) => {
    const req = buildExtractionRequest(model, "cGRm", "prompt", { cacheBreakpoint: true })
    const content = (req.params.messages as Array<{ content: Array<Record<string, unknown>> }>)[0].content
    expect(content.map((b) => b.type)).toEqual(["document", "text"])
    expect(content[0].cache_control).toEqual({ type: "ephemeral" })
    expect(content[1]).toEqual({ type: "text", text: "prompt" })
    expect(JSON.stringify(req).match(/"cache_control"/g)).toHaveLength(1)
  })

  it("off sends no cache_control anywhere", () => {
    for (const model of MODELS) expect(build(model)).not.toContain("cache_control")
  })
})

// The prompt TEXT is what the golden corpus scored (CLAUDE.md non-negotiable
// 5). Prompt caching changes request assembly only; these digests were taken
// from main before it, so any edit to the words fails here first.
describe("the extraction prompt text is unchanged", () => {
  const sha256 = (s: string) => createHash("sha256").update(s).digest("hex")

  it("buildPrompt, in each of its modes", () => {
    expect(sha256(buildPrompt())).toBe("435d515d246372ad3645f1b20aac612989837e9a246109d987369e1077dba16d")
    expect(sha256(buildPrompt(["milk frother"]))).toBe("e93ac75dfd5d089b30addee097f19964e931a35d066b215cb9049c0da71db0f6")
    expect(
      sha256(buildPrompt(undefined, [{ original_type: "maintenance", corrected_type: "cleaning", item_title: "Wipe the door" }])),
    ).toBe("c7d40575a1b15827a69cc5bfe78e020df7eb895572f083b83296286878543561")
    expect(sha256(buildPrompt(undefined, undefined, ["Descale the machine", "Clean the drip tray"]))).toBe(
      "efedfeb38ec1f5f2b7b633faf47c8be5112c8a159f580bf3cc37c55288d39cdb",
    )
  })

  it("the extraction tool's schema and descriptions", () => {
    expect(sha256(JSON.stringify(EXTRACTION_TOOL))).toBe("7afb74073eb1dc33e6e9d4e0c8610695a97ebf8e56370ee511d986cf89a700cf")
  })
})
