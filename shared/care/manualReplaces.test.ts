import { describe, expect, it } from "vitest"
import { defaultChoiceFor, matchManualToTypical, type TypicalTask } from "./manualReplaces"
import { archetypeOf } from "./library"
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../parse/parseCore"

const dishFilter: TypicalTask = { templateId: "t-dish", title: "Clean the dishwasher filter", libraryKey: "dishwasher.filter" }
const fridgeWater: TypicalTask = { templateId: "t-water", title: "Replace the water filter", libraryKey: "refrigerator.water" }
const fridgeCoils: TypicalTask = { templateId: "t-coils", title: "Vacuum the condenser coils", libraryKey: "refrigerator.coils" }

const one = (row: string, typical: TypicalTask[]) => matchManualToTypical([row], typical)[0] ?? null

describe("matchManualToTypical — the plan's table (PD2)", () => {
  it("'Clean the filter' ~ 'Clean the dishwasher filter' matches by similarity (0.67)", () => {
    expect(titleSimilarity("Clean the filter", dishFilter.title)).toBeCloseTo(0.67, 2)
    const m = one("Clean the filter", [dishFilter])
    expect(m).toMatchObject({ rowIndex: 0, by: "similarity", typical: dishFilter })
  })

  it("'Replace water filter' ~ 'Replace the water filter' matches by archetype", () => {
    expect(one("Replace water filter", [fridgeWater])).toMatchObject({ by: "archetype", typical: fridgeWater })
  })

  it("'Replace water inlet hoses' ~ 'Replace the water filter' is a SIMILARITY match (0.67), so it never defaults to Replace", () => {
    expect(titleSimilarity("Replace water inlet hoses", fridgeWater.title)).toBeCloseTo(0.67, 2)
    // archetypeOf's similarity fallback would call it the water-filter job;
    // the matcher must not (D11).
    expect(archetypeOf("Replace water inlet hoses")).toBe("filter.replace.water")
    const m = one("Replace water inlet hoses", [fridgeWater])
    expect(m?.by).toBe("similarity")
    expect(defaultChoiceFor(m!.by)).toBe("keep_both")
  })

  it("'Clean the door gasket' and 'Run a cleaning cycle' do not match 'Clean the dishwasher filter' (0.33)", () => {
    expect(titleSimilarity("Clean the door gasket", dishFilter.title)).toBeLessThan(TITLE_MATCH_THRESHOLD)
    expect(titleSimilarity("Run a cleaning cycle", dishFilter.title)).toBeLessThan(TITLE_MATCH_THRESHOLD)
    expect(matchManualToTypical(["Clean the door gasket", "Run a cleaning cycle"], [dishFilter])).toEqual([])
  })

  it("two rows never claim one typical task: the stronger pair wins", () => {
    const ms = matchManualToTypical(["Replace water inlet hoses", "Replace water filter"], [fridgeWater])
    expect(ms).toHaveLength(1)
    expect(ms[0]).toMatchObject({ rowIndex: 1, by: "archetype" })
  })

  it("one row never claims two typical tasks, and each typical task finds its own row", () => {
    const ms = matchManualToTypical(
      ["Replace water filter", "Vacuum the condenser coils", "Clean the door gasket"],
      [fridgeWater, fridgeCoils],
    )
    expect(ms.map((m) => [m.rowIndex, m.typical.templateId, m.by])).toEqual([
      [0, "t-water", "archetype"],
      [1, "t-coils", "archetype"],
    ])
  })

  it("repeated titles are told apart by index", () => {
    const ms = matchManualToTypical(["Replace water filter", "Replace water filter"], [fridgeWater])
    expect(ms).toEqual([{ rowIndex: 0, rowTitle: "Replace water filter", typical: fridgeWater, by: "archetype" }])
  })

  it("nothing to match against → no matches", () => {
    expect(matchManualToTypical(["Replace water filter"], [])).toEqual([])
    expect(matchManualToTypical([], [fridgeWater])).toEqual([])
  })

  it("an unknown library key can still match by wording, never by archetype", () => {
    const stray: TypicalTask = { templateId: "t-x", title: "Replace the water filter", libraryKey: "gone.from.library" }
    expect(one("Replace water filter", [stray])?.by).toBe("similarity")
  })
})

describe("defaultChoiceFor (D11)", () => {
  it("archetype → Replace; similarity → Keep Both", () => {
    expect(defaultChoiceFor("archetype")).toBe("replace")
    expect(defaultChoiceFor("similarity")).toBe("keep_both")
  })
})
