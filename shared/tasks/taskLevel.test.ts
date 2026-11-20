import { describe, expect, it } from "vitest"
import { planLevelChange, taskLevelOf, tierMeetsLevel, NEW_HOME_TASK_LEVEL, type LevelTemplate } from "./taskLevel"

const tpl = (id: string, priorityTier: string | null, over: Partial<LevelTemplate> = {}): LevelTemplate => ({
  id, priorityTier, source: "manual", externalKey: null, remindEnabled: null, hiddenByLevel: false, levelKept: false, ...over,
})

describe("taskLevelOf", () => {
  it("a home with nothing stored behaves as before: everything", () => {
    expect(taskLevelOf(undefined)).toBe("everything")
    expect(taskLevelOf(null)).toBe("everything")
    expect(taskLevelOf("nonsense")).toBe("everything")
  })
  it("reads a stored level, and new homes start on Recommended too", () => {
    expect(taskLevelOf("essential")).toBe("essential")
    expect(NEW_HOME_TASK_LEVEL).toBe("recommended")
  })
})

describe("tierMeetsLevel", () => {
  it("Essential meets every level; Optional only meets Everything", () => {
    for (const l of ["essential", "recommended", "everything"] as const) expect(tierMeetsLevel("essential", l)).toBe(true)
    expect(tierMeetsLevel("recommended", "essential")).toBe(false)
    expect(tierMeetsLevel("recommended", "recommended")).toBe(true)
    expect(tierMeetsLevel("optional", "recommended")).toBe(false)
    expect(tierMeetsLevel("optional", "everything")).toBe(true)
  })
  it("never fails a task on an unknown tier", () => {
    expect(tierMeetsLevel(null, "essential")).toBe(true)
    expect(tierMeetsLevel("mystery", "essential")).toBe(true)
  })
})

describe("planLevelChange", () => {
  const home = [tpl("e", "essential"), tpl("r", "recommended"), tpl("o", "optional")]

  it("lowering from Everything hides what is below the new level, and nothing else", () => {
    expect(planLevelChange(home, "everything", "recommended")).toEqual({ hide: ["o"], unhide: [], keep: [] })
    expect(planLevelChange(home, "everything", "essential")).toEqual({ hide: ["r", "o"], unhide: [], keep: [] })
  })

  it("raising the level brings hidden tasks back — nothing was deleted", () => {
    const lowered = [tpl("e", "essential"), tpl("r", "recommended", { hiddenByLevel: true }), tpl("o", "optional", { hiddenByLevel: true })]
    expect(planLevelChange(lowered, "essential", "recommended")).toEqual({ hide: [], unhide: ["r"], keep: [] })
    expect(planLevelChange(lowered, "essential", "everything")).toEqual({ hide: [], unhide: ["r", "o"], keep: [] })
  })

  it("a task showing below the old level was brought back by hand: kept for good, never hidden", () => {
    // A home on Recommended too, with an Optional task its owner brought back in a review.
    const h = [tpl("r", "recommended"), tpl("o", "optional")]
    expect(planLevelChange(h, "recommended", "essential")).toEqual({ hide: ["r"], unhide: [], keep: ["o"] })
    // …and once marked, it survives every later change.
    const after = [tpl("r", "recommended", { hiddenByLevel: true }), tpl("o", "optional", { levelKept: true })]
    expect(planLevelChange(after, "essential", "recommended")).toEqual({ hide: [], unhide: ["r"], keep: [] })
    expect(planLevelChange(after, "essential", "essential")).toEqual({ hide: [], unhide: [], keep: [] })
  })

  it("never hides a task someone typed in, added from a suggestion, or switched a reminder on for", () => {
    const h = [
      tpl("typed", "optional", { source: "user" }),
      tpl("suggested", "recommended", { source: "cho_generated", externalKey: "library:washer.tub" }),
      tpl("bell", "recommended", { remindEnabled: true }),
      tpl("plain", "recommended"),
      // App-generated with no suggestion stamp: a default, like a manual's task.
      tpl("generated", "recommended", { source: "cho_generated" }),
    ]
    expect(planLevelChange(h, "everything", "essential")).toEqual({ hide: ["plain", "generated"], unhide: [], keep: [] })
  })

  it("a reminder switched on after a task was hidden brings it back at the next change", () => {
    const h = [tpl("bell", "recommended", { hiddenByLevel: true, remindEnabled: true })]
    expect(planLevelChange(h, "essential", "essential").unhide).toEqual(["bell"])
  })

  it("is idempotent: the same change planned over its own result writes nothing", () => {
    const applied = [tpl("e", "essential"), tpl("r", "recommended", { hiddenByLevel: true }), tpl("o", "optional", { hiddenByLevel: true })]
    expect(planLevelChange(applied, "essential", "essential")).toEqual({ hide: [], unhide: [], keep: [] })
  })

  it("an unknown tier is never hidden", () => {
    expect(planLevelChange([tpl("x", null)], "everything", "essential")).toEqual({ hide: [], unhide: [], keep: [] })
  })
})
