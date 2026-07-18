import { describe, it, expect } from "vitest"
import {
  patternKeyOf, patternLabel, aggregateGraduation, suggestionFor,
  type FeedbackPattern, type GraduationRow,
} from "../../shared/tasks/graduation"

const freezeSuppress: FeedbackPattern = { chip: "not_relevant", action: "suppress", match: { by: "seasonalFamily", family: "freeze_prep" } }

describe("patternKeyOf — cross-home comparable, home-specific → null", () => {
  it("builds a stable key for generalizable matches", () => {
    expect(patternKeyOf(freezeSuppress)).toBe("not_relevant|suppress|fam:freeze_prep|")
    expect(patternKeyOf({ chip: "wrong_priority", action: "tier_remap", match: { by: "symptomTags", tags: ["drainage", "odor"] }, toTier: "optional" }))
      .toBe("wrong_priority|tier_remap|tags:drainage+odor|optional")
  })
  it("is order-independent for symptom tags", () => {
    const a = patternKeyOf({ chip: "not_relevant", action: "suppress", match: { by: "symptomTags", tags: ["odor", "drainage"] } })
    const b = patternKeyOf({ chip: "not_relevant", action: "suppress", match: { by: "symptomTags", tags: ["drainage", "odor"] } })
    expect(a).toBe(b)
  })
  it("returns null for template matches and no-match (never graduate)", () => {
    expect(patternKeyOf({ chip: "duplicate", action: "archive_duplicate", match: null })).toBeNull()
    expect(patternKeyOf({ chip: "not_relevant", action: "suppress", match: { by: "template", taskTemplateId: "x" } })).toBeNull()
  })
})

describe("aggregateGraduation — graduate at the home threshold", () => {
  function row(homeId: string, pattern: FeedbackPattern, title: string, day: string): GraduationRow {
    return { homeId, patternKey: patternKeyOf(pattern), pattern, title, createdAt: `2026-07-${day}T00:00:00Z` }
  }

  it("promotes a pattern seen across ≥3 distinct homes; ignores 2-home patterns", () => {
    const rows = [
      row("h1", freezeSuppress, "Winterize faucet", "01"),
      row("h2", freezeSuppress, "Winterize the washer", "05"),
      row("h3", freezeSuppress, "Freeze-protect backflow", "09"),
      // a different pattern seen in only 2 homes → below threshold
      row("h1", { chip: "too_often", action: "cadence", match: { by: "symptomTags", tags: ["odor"] }, scheduleType: "annual" }, "Clean drain", "02"),
      row("h2", { chip: "too_often", action: "cadence", match: { by: "symptomTags", tags: ["odor"] }, scheduleType: "annual" }, "Clean trap", "03"),
    ]
    const cands = aggregateGraduation(rows)
    expect(cands).toHaveLength(1)
    expect(cands[0].patternKey).toBe("not_relevant|suppress|fam:freeze_prep|")
    expect(cands[0].homeCount).toBe(3)
    expect(cands[0].exampleTitles).toContain("Winterize faucet")
    expect(cands[0].firstSeen).toBe("2026-07-01T00:00:00Z")
    expect(cands[0].lastSeen).toBe("2026-07-09T00:00:00Z")
  })

  it("counts DISTINCT homes, not events (3 reports from 2 homes ≠ graduation)", () => {
    const rows = [
      row("h1", freezeSuppress, "A", "01"),
      row("h1", freezeSuppress, "B", "02"),
      row("h2", freezeSuppress, "C", "03"),
    ]
    expect(aggregateGraduation(rows)).toHaveLength(0)
  })

  it("drops home-specific (null-key) rows entirely", () => {
    const dup: FeedbackPattern = { chip: "duplicate", action: "archive_duplicate", match: null }
    const rows = ["h1", "h2", "h3", "h4"].map((h) => row(h, dup, "Dupe", "01"))
    expect(aggregateGraduation(rows)).toHaveLength(0)
  })
})

describe("suggestionFor / patternLabel", () => {
  it("gives an actionable, harness-oriented suggestion", () => {
    const s = suggestionFor(freezeSuppress, 4)
    expect(s).toContain("4 homes")
    expect(s).toMatch(/golden|harness|parsePrompt/i)
  })
  it("labels the pattern group readably", () => {
    expect(patternLabel(freezeSuppress)).toBe("winterizing tasks")
    expect(patternLabel({ chip: "x", action: "tier_remap", match: { by: "season", season: "fall" } })).toBe("fall tasks")
  })
})
