/**
 * Cleanup-plan tests — driven by the real dishwasher/Home screenshots from the
 * 2026-07-29 dogfooding report, including the pairs that must NOT merge.
 */
import { describe, it, expect } from "vitest"
import {
  planTaskCleanup,
  isDefaultChecked,
  DEDUPE_THRESHOLD,
  type ExistingTask,
} from "../../shared/tasks/cleanupPlan"

let seq = 0
function task(overrides: Partial<ExistingTask> & { title: string }): ExistingTask {
  seq += 1
  return {
    taskTemplateId: `t${seq}`,
    itemUnitId: "dishwasher",
    scopeType: "item_unit",
    itemName: "Bosch 800 Series Dishwasher",
    hasCompletions: false,
    careTypeOverriddenAt: null,
    createdAt: "2026-07-01T00:00:00Z",
    description: null,
    justification: null,
    care_type: "maintenance",
    priority_tier: "recommended",
    risk_level: "performance",
    schedule_type: "monthly",
    instructions_override: null,
    source_page: null,
    ...overrides,
  }
}

describe("planTaskCleanup — operational rows become tips", () => {
  it("proposes to_tip for consumable/config steps", () => {
    const plan = planTaskCleanup([
      task({ title: "Add Detergent Before Each Cycle", schedule_type: "after_each_use" }),
      task({ title: "Refill the Rinse Aid Dispenser", schedule_type: "as_needed" }),
      task({ title: "Descale the dishwasher" }),
    ])
    const tips = plan.proposals.filter((p) => p.kind === "to_tip")
    expect(tips.map((p) => "title" in p && p.title)).toEqual([
      "Add Detergent Before Each Cycle",
      "Refill the Rinse Aid Dispenser",
    ])
  })

  it("carries the advice into the tip so nothing is lost", () => {
    const plan = planTaskCleanup([
      task({
        title: "Replace Water in the Tank",
        description: "Stale water can affect coffee taste and hygiene.",
        instructions_override: "Remove the tank, discard old water, rinse, refill.",
        source_page: 12,
      }),
    ])
    expect(plan.proposals[0]).toMatchObject({
      kind: "to_tip",
      tipContent: "Stale water can affect coffee taste and hygiene. Remove the tank, discard old water, rinse, refill.",
      sourcePage: 12,
    })
  })

  it("falls back to justification, then the title, for tip content", () => {
    const j = planTaskCleanup([task({ title: "Add Rinse Aid", justification: "Prevents spotting." })])
    expect(j.proposals[0]).toMatchObject({ tipContent: "Prevents spotting." })
    const bare = planTaskCleanup([task({ title: "Add Rinse Aid" })])
    expect(bare.proposals[0]).toMatchObject({ tipContent: "Add Rinse Aid" })
  })

  it("leaves an operational row alone when the user has completed it", () => {
    const plan = planTaskCleanup([
      task({ title: "Add Rinse Aid", hasCompletions: true }),
    ])
    expect(plan.proposals).toHaveLength(0)
    expect(plan.skippedUserOverridden).toHaveLength(1)
  })
})

describe("planTaskCleanup — reclassify + retier", () => {
  it("reclassifies mislabeled wipe-downs to cleaning", () => {
    const plan = planTaskCleanup([task({ title: "Wipe Dishwasher Exterior", care_type: "maintenance" })])
    expect(plan.proposals).toEqual([
      expect.objectContaining({ kind: "reclassify", from: "maintenance", to: "cleaning" }),
    ])
  })

  it("does not reclassify a hand-edited care type", () => {
    const plan = planTaskCleanup([
      task({ title: "Wipe Dishwasher Exterior", care_type: "maintenance", careTypeOverriddenAt: "2026-07-20T00:00:00Z" }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "reclassify")).toHaveLength(0)
    expect(plan.skippedUserOverridden).toContain("t" + seq)
  })

  it("demotes essential that misses the safety/damage floor, with a promote reason", () => {
    const plan = planTaskCleanup([
      task({
        title: "Clean Interior Surfaces and Shelves",
        justification: "Food residue can harbor bacteria.",
        priority_tier: "essential",
        risk_level: "prevent_damage",
      }),
    ])
    expect(plan.proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "retier", to: "recommended", candidate: "hygiene" }),
      ]),
    )
  })

  it("keeps essential when the floor is met", () => {
    const plan = planTaskCleanup([
      task({ title: "Clean the dryer vent duct", priority_tier: "essential", risk_level: "safety" }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "retier")).toHaveLength(0)
  })

  it("demotes an essential wipe-down even though it also reclassifies", () => {
    // The gate must judge the care type the row will END UP with, not the stale one.
    const plan = planTaskCleanup([
      task({ title: "Clean the Dishwasher Exterior", care_type: "maintenance", priority_tier: "essential", risk_level: "prevent_damage" }),
    ])
    const kinds = plan.proposals.map((p) => p.kind).sort()
    expect(kinds).toEqual(["reclassify", "retier"])
  })
})

describe("planTaskCleanup — duplicate merges", () => {
  it("proposes a merge for the reported dishwasher pairs", () => {
    const plan = planTaskCleanup([
      task({ title: "Clean the Door Seal" }),
      task({ title: "Clean Door Seal" }),
    ])
    const merges = plan.proposals.filter((p) => p.kind === "merge")
    expect(merges).toHaveLength(1)
    expect(merges[0]).toMatchObject({ keepTitle: "Clean the Door Seal", dropTitle: "Clean Door Seal" })
  })

  it("keeps the row WITH completion history, whichever title it has", () => {
    const plan = planTaskCleanup([
      task({ title: "Clean the Filter System" }),
      task({ title: "Clean filter system (light to average use)", hasCompletions: true }),
    ])
    const merge = plan.proposals.find((p) => p.kind === "merge")
    expect(merge).toMatchObject({
      keepTitle: "Clean filter system (light to average use)",
      dropTitle: "Clean the Filter System",
    })
  })

  it("never proposes dropping a completion-bearing row (both have history → no merge)", () => {
    const plan = planTaskCleanup([
      task({ title: "Clean the Door Seal", hasCompletions: true }),
      task({ title: "Clean Door Seal", hasCompletions: true }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "merge")).toHaveLength(0)
  })

  it("NEVER merges across items — identical titles on different appliances stay", () => {
    // This pair scores 1.000 on titleSimilarity; only the item scope saves it.
    const plan = planTaskCleanup([
      task({ title: "Clean the Interior Surfaces", itemUnitId: "microwave", itemName: "Microwave" }),
      task({ title: "Clean Interior Surfaces and Shelves", itemUnitId: "fridge", itemName: "Refrigerator" }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "merge")).toHaveLength(0)
  })

  it("does not merge genuinely different upkeep on the same item", () => {
    const plan = planTaskCleanup([
      task({ title: "Descale the dishwasher" }),
      task({ title: "Prepare Dishwasher for Vacation" }),
      task({ title: "Clean the Drain Pump" }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "merge")).toHaveLength(0)
  })

  it("never presents the same row as both survivor and casualty", () => {
    // Caught in emulator verification: "Clean the Door Seal" matches both its
    // exact twin AND the look-alike panel-edges row, so the plan offered
    // "keep Door Seal / remove Door Seal(twin)" together with
    // "keep Panel Edges / remove Door Seal" — approving both is incoherent.
    const plan = planTaskCleanup([
      task({ title: "Clean the Door Seal", taskTemplateId: "seal-a" }),
      task({ title: "Clean Door Seal", taskTemplateId: "seal-b" }),
      task({ title: "Clean the Inner Door Panel Edges", taskTemplateId: "panel" }),
    ])
    const merges = plan.proposals.filter((p) => p.kind === "merge")
    const keeps = new Set(merges.map((m) => "keepTaskTemplateId" in m && m.keepTaskTemplateId))
    const drops = new Set(merges.map((m) => "dropTaskTemplateId" in m && m.dropTaskTemplateId))
    for (const k of keeps) expect(drops.has(k)).toBe(false)
    // Each template referenced at most once across all merge proposals.
    const ids = merges.flatMap((m) =>
      "keepTaskTemplateId" in m ? [m.keepTaskTemplateId, m.dropTaskTemplateId] : [],
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("collapses a triple into a chain — each row dropped at most once", () => {
    const plan = planTaskCleanup([
      task({ title: "Clean the Filter System" }),
      task({ title: "Clean the Filters" }),
      task({ title: "Clean filter system" }),
    ])
    const merges = plan.proposals.filter((p) => p.kind === "merge")
    const dropped = merges.map((m) => "dropTaskTemplateId" in m && m.dropTaskTemplateId)
    expect(new Set(dropped).size).toBe(dropped.length) // no row dropped twice
    // And no row is both kept and dropped.
    const keeps = new Set(merges.map((m) => "keepTaskTemplateId" in m && m.keepTaskTemplateId))
    for (const d of dropped) expect(keeps.has(d)).toBe(false)
  })

  it("does not propose merging a row that is already becoming a tip", () => {
    const plan = planTaskCleanup([
      task({ title: "Add Rinse Aid" }),
      task({ title: "Refill the Rinse Aid Dispenser" }),
    ])
    expect(plan.proposals.filter((p) => p.kind === "merge")).toHaveLength(0)
    expect(plan.proposals.filter((p) => p.kind === "to_tip")).toHaveLength(2)
  })

  it("is deterministic across input orderings for fully-tied rows", () => {
    const a = task({ title: "Clean Door Seal", taskTemplateId: "aaa" })
    const b = task({ title: "Clean the Door Seal", taskTemplateId: "zzz" })
    const one = planTaskCleanup([a, b]).proposals.filter((p) => p.kind === "merge")
    const two = planTaskCleanup([b, a]).proposals.filter((p) => p.kind === "merge")
    expect(one).toEqual(two)
  })
})

describe("default-checked policy", () => {
  it("pre-checks reversible edits but never a merge", () => {
    expect(isDefaultChecked({ kind: "to_tip", taskTemplateId: "x", title: "t", itemName: null, reason: "operational", tipContent: "c", sourcePage: null })).toBe(true)
    expect(isDefaultChecked({ kind: "reclassify", taskTemplateId: "x", title: "t", itemName: null, from: "maintenance", to: "cleaning" })).toBe(true)
    expect(isDefaultChecked({ kind: "retier", taskTemplateId: "x", title: "t", itemName: null, from: "essential", to: "recommended", candidate: "hygiene" })).toBe(true)
    expect(isDefaultChecked({ kind: "merge", keepTaskTemplateId: "a", keepTitle: "a", dropTaskTemplateId: "b", dropTitle: "b", itemName: null, similarity: 0.9 })).toBe(false)
  })

  it("threshold is the measured value", () => {
    expect(DEDUPE_THRESHOLD).toBe(0.6)
  })
})
