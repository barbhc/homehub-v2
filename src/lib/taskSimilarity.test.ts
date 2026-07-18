import { describe, it, expect } from "vitest"
import { seasonalFamily, ruleMatchFor, matchesRule, findSimilar, matchLabel, type TaskLike } from "./taskSimilarity"

function task(partial: Partial<TaskLike> & { taskTemplateId: string; title: string }): TaskLike {
  return { symptomTags: [], scheduleType: null, season: null, ...partial }
}

describe("seasonalFamily", () => {
  it("groups winterize / freeze / cold-storage titles as freeze_prep", () => {
    expect(seasonalFamily("Winterize Washer for Cold Storage")).toBe("freeze_prep")
    expect(seasonalFamily("Freeze protection for outdoor faucet")).toBe("freeze_prep")
    expect(seasonalFamily("Winterizing the dryer vent")).toBe("freeze_prep")
  })
  it("groups de-winterize / spring startup as warm_startup", () => {
    expect(seasonalFamily("Spring startup for irrigation")).toBe("warm_startup")
    expect(seasonalFamily("De-winterize the outdoor spigot")).toBe("warm_startup")
  })
  it("returns null for non-seasonal titles", () => {
    expect(seasonalFamily("Descale the coffee maker")).toBeNull()
    expect(seasonalFamily("Clean the lint trap")).toBeNull()
  })
})

describe("ruleMatchFor — most-general signal wins", () => {
  it("prefers symptomTags when present", () => {
    const m = ruleMatchFor(task({ taskTemplateId: "a", title: "Winterize pump", symptomTags: ["leaking"] }))
    expect(m).toEqual({ by: "symptomTags", tags: ["leaking"] })
  })
  it("falls back to seasonalFamily from the title", () => {
    const m = ruleMatchFor(task({ taskTemplateId: "a", title: "Winterize Washer" }))
    expect(m).toEqual({ by: "seasonalFamily", family: "freeze_prep" })
  })
  it("falls back to explicit season on a seasonal schedule", () => {
    const m = ruleMatchFor(task({ taskTemplateId: "a", title: "Service the AC", scheduleType: "seasonal", season: "spring" }))
    expect(m).toEqual({ by: "season", season: "spring" })
  })
  it("falls back to the template itself when nothing groups", () => {
    const m = ruleMatchFor(task({ taskTemplateId: "a", title: "Descale coffee maker" }))
    expect(m).toEqual({ by: "template", taskTemplateId: "a" })
  })
})

describe("findSimilar — the winterize sweep (motivating example)", () => {
  const primary = task({ taskTemplateId: "washer", title: "Winterize Washer for Cold Storage" })
  const all = [
    primary,
    task({ taskTemplateId: "dryer", title: "Winterize Dryer for Cold Storage" }),
    task({ taskTemplateId: "faucet", title: "Freeze-protect the outdoor faucet" }),
    task({ taskTemplateId: "coffee", title: "Descale the coffee maker" }),
    task({ taskTemplateId: "spring", title: "Spring startup for irrigation" }),
  ]
  it("sweeps other winterize/freeze tasks, not unrelated or opposite-season ones", () => {
    const ids = findSimilar(primary, all).map((t) => t.taskTemplateId).sort()
    expect(ids).toEqual(["dryer", "faucet"])
  })
  it("excludes the primary itself", () => {
    expect(findSimilar(primary, all).some((t) => t.taskTemplateId === "washer")).toBe(false)
  })
  it("returns nothing for a self-only (template-matched) task", () => {
    const coffee = task({ taskTemplateId: "coffee", title: "Descale the coffee maker" })
    expect(findSimilar(coffee, all)).toEqual([])
  })
})

describe("matchesRule", () => {
  it("symptomTags matches on any shared tag", () => {
    expect(matchesRule({ by: "symptomTags", tags: ["leaking", "odor"] }, task({ taskTemplateId: "x", title: "y", symptomTags: ["odor"] }))).toBe(true)
    expect(matchesRule({ by: "symptomTags", tags: ["leaking"] }, task({ taskTemplateId: "x", title: "y", symptomTags: ["noise"] }))).toBe(false)
  })
  it("season matches only seasonal tasks of that season", () => {
    expect(matchesRule({ by: "season", season: "fall" }, task({ taskTemplateId: "x", title: "y", scheduleType: "seasonal", season: "fall" }))).toBe(true)
    expect(matchesRule({ by: "season", season: "fall" }, task({ taskTemplateId: "x", title: "y", scheduleType: "annual", season: "fall" }))).toBe(false)
  })
})

describe("matchLabel — readable provenance", () => {
  it("describes each match kind", () => {
    expect(matchLabel({ by: "seasonalFamily", family: "freeze_prep" })).toBe("winterizing / freeze-protection tasks")
    expect(matchLabel({ by: "season", season: "fall" })).toBe("fall tasks")
    expect(matchLabel({ by: "template", taskTemplateId: "a" })).toBe("this task")
    expect(matchLabel({ by: "symptomTags", tags: ["leaking"] })).toContain("leaking")
  })
})
