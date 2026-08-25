import { describe, it, expect } from "vitest"
import { toUiStage, ACTIVE_PARSE_STAGES, type ParseStage } from "./parseManualService"

describe("toUiStage — worker stage → UI progress mapping (fix B)", () => {
  const cases: Array<[ParseStage, string]> = [
    ["queued", "queued"],
    ["awaiting_capacity", "queued"],
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
    const preCommit: ParseStage[] = ["awaiting_capacity", "queued", "started", "pdf_fetched", "claude_call", "claude_responded", "committing"]
    for (const s of preCommit) expect(toUiStage(s)).not.toBe("done")
  })
})

describe("awaiting_capacity reads as pending (HH-124)", () => {
  it("counts as active, so a held manual is not shown as missing", () => {
    // The user was told the manual was queued and would start on its own. If
    // this were inactive, the item page would fall back to "No upkeep yet —
    // add the manual" for a manual we are holding, which contradicts the
    // promise the capacity notice just made.
    expect(ACTIVE_PARSE_STAGES).toContain("awaiting_capacity")
  })

  it("is not a terminal state", () => {
    expect(ACTIVE_PARSE_STAGES).not.toContain("done")
    expect(ACTIVE_PARSE_STAGES).not.toContain("error")
  })
})
