import { describe, it, expect } from "vitest"
import { toUiStage, type ParseStage } from "./parseManualService"

describe("toUiStage — worker stage → UI progress mapping (fix B)", () => {
  const cases: Array<[ParseStage, string]> = [
    ["queued", "queued"],
    ["started", "reading"],
    ["pdf_fetched", "reading"],
    ["claude_call", "extracting"],
    ["claude_responded", "extracting"],
    ["committing", "saving"],
    ["done", "done"],
    ["error", "error"],
  ]
  for (const [stage, ui] of cases) {
    it(`maps ${stage} → ${ui}`, () => {
      expect(toUiStage(stage)).toBe(ui)
    })
  }

  it("never maps a pre-commit stage to done (empty-review guard)", () => {
    const preCommit: ParseStage[] = ["queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"]
    for (const s of preCommit) expect(toUiStage(s)).not.toBe("done")
  })
})
