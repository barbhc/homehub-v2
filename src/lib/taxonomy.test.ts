/**
 * Taxonomy tests — the corpus is the 2026-07-29 dogfooding report verbatim:
 * every title the user flagged (Nespresso water, detergent, dishwasher schedule,
 * as-needed dupes) plus the functional lookalikes that must NOT reclassify.
 */
import { describe, it, expect } from "vitest"
import {
  applyTaskTaxonomy,
  classifyTaskKind,
  type TaxonomyTaskFields,
} from "../../shared/tasks/taxonomy"

function row(overrides: Partial<TaxonomyTaskFields> & { title: string }): TaxonomyTaskFields {
  return {
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

describe("classifyTaskKind — operational (the flagged noise)", () => {
  it.each([
    "Add Detergent Before Each Cycle",
    "Replace Water in the Tank",
    "Refill the Rinse Aid Dispenser",
    "Add Rinse Aid",
    "Adjust Rinse Aid Dispenser Setting",
    "Adjust Rinse Aid Setting",
    "Adjust rinse aid setting based on performance",
    "Fill the water reservoir",
    "Load coffee beans into the hopper",
    "Connect to WiFi",
    "Program custom cup volume",
  ])("%s → operational", (title) => {
    expect(classifyTaskKind(row({ title }))).toBe("operational")
  })

  // These are real titles the CURRENT production prompt emitted for the Nespresso
  // in the eval baseline (2026-07-30) — two of them as ESSENTIAL maintenance.
  it.each([
    "Fill and Position Water Tank",
    "Replace Water Between Uses",
    "Empty and Rinse Capsule Container",
    "Program Custom Cup Volume",
    "Position Water Tank Arm",
  ])("%s → operational (from the live eval baseline)", (title) => {
    expect(classifyTaskKind(row({ title }))).toBe("operational")
  })

  it("emptying a FUNCTIONAL part is still maintenance (no consumable object)", () => {
    // The object gate is what makes the `empty` verb safe to include.
    expect(classifyTaskKind(row({ title: "Empty the lint trap" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Empty the drain pan" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Empty System Before Storage" }))).toBe("maintenance")
  })

  it("re-seating a FUNCTIONAL part is maintenance, not assembly", () => {
    expect(classifyTaskKind(row({ title: "Reattach the filter housing" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Reposition the vent duct" }))).toBe("maintenance")
  })

  it("maintenance consumables are NOT operational (filter ≠ detergent)", () => {
    expect(classifyTaskKind(row({ title: "Replace Water Filter" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Replace the water filter cartridge" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Replace HVAC furnace filter" }))).toBe("maintenance")
  })

  it("replacing water-system HARDWARE is maintenance, not operating", () => {
    expect(classifyTaskKind(row({ title: "Replace water inlet hoses" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Replace the water supply line" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Replace the water inlet valve screen" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Replace the water heater anode rod" }))).toBe("maintenance")
  })
})

describe("classifyTaskKind — cleaning reclass (mislabeled wipe-downs)", () => {
  it.each([
    "Clean the Dishwasher Exterior",
    "Wipe Dishwasher Exterior",
    "Clean the Interior Surfaces",
    "Clean Interior Surfaces and Shelves",
    "Clean door window and seal",
    "Clean the Inner Door Panel Edges",
    "Wipe refrigerator shelves",
    "Clean oven door glass",
    "Polish the stainless steel front",
  ])("%s → cleaning", (title) => {
    expect(classifyTaskKind(row({ title }))).toBe("cleaning")
  })

  it("cleaning a FUNCTIONAL part stays maintenance", () => {
    expect(classifyTaskKind(row({ title: "Clean the Filter System" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean filter system (light to average use)" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean the Drain Pump" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Vacuum refrigerator coils" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean Surface Burner Caps" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean the dryer vent duct" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean the spray arms" }))).toBe("maintenance")
  })

  it("non-cleaning maintenance is untouched", () => {
    expect(classifyTaskKind(row({ title: "Descale the dishwasher" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Clean the Door Seal" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Prepare Dishwasher for Vacation" }))).toBe("maintenance")
    expect(classifyTaskKind(row({ title: "Winterize the outdoor faucet" }))).toBe("maintenance")
  })
})

describe("applyTaskTaxonomy — operational rows become tips, not tasks", () => {
  it("converts with description + instructions as the surviving content", () => {
    const res = applyTaskTaxonomy([
      row({
        title: "Replace Water in the Tank",
        description: "Stale water can affect coffee taste and hygiene.",
        instructions_override: "Remove the tank, discard old water, rinse, refill with fresh water.",
        source_page: 12,
        priority_tier: "essential",
        risk_level: "comfort",
      }),
    ])
    expect(res.tasks).toHaveLength(0)
    expect(res.tips).toHaveLength(1)
    expect(res.tips[0].title).toBe("Replace Water in the Tank")
    expect(res.tips[0].content).toContain("Stale water")
    expect(res.tips[0].content).toContain("refill with fresh water")
    expect(res.tips[0].source_pages).toEqual([12])
  })

  it("falls back to justification, then title, when there is no other content", () => {
    const withJust = applyTaskTaxonomy([row({ title: "Add Rinse Aid", justification: "Prevents spotting." })])
    expect(withJust.tips[0].content).toBe("Prevents spotting.")
    const bare = applyTaskTaxonomy([row({ title: "Add Rinse Aid" })])
    expect(bare.tips[0].content).toBe("Add Rinse Aid")
  })
})

describe("applyTaskTaxonomy — essential gate", () => {
  it("keeps essential when the floor is met (maintenance + safety/damage)", () => {
    const res = applyTaskTaxonomy([
      row({ title: "Descale the dishwasher", priority_tier: "essential", risk_level: "prevent_damage" }),
      row({ title: "Clean the dryer vent duct", priority_tier: "essential", risk_level: "safety" }),
    ])
    expect(res.tasks.map((t) => t.priority_tier)).toEqual(["essential", "essential"])
    expect(res.demoted).toBe(0)
  })

  it("demotes essential cleaning → recommended + hygiene candidate when hygiene-signaled", () => {
    const res = applyTaskTaxonomy([
      row({
        title: "Clean Interior Surfaces and Shelves",
        justification: "Food residue can harbor bacteria and cause odors.",
        priority_tier: "essential",
        risk_level: "prevent_damage",
      }),
    ])
    expect(res.tasks[0].care_type).toBe("cleaning")
    expect(res.tasks[0].priority_tier).toBe("recommended")
    expect(res.tasks[0].essential_candidate).toBe("hygiene")
    expect(res.demoted).toBe(1)
    expect(res.reclassified).toBe(1)
  })

  it("demotes manual-emphasis essential (maintenance but low risk) → recommended + manual_emphasis", () => {
    const res = applyTaskTaxonomy([
      row({ title: "Run a rinse cycle monthly", priority_tier: "essential", risk_level: "comfort" }),
    ])
    expect(res.tasks[0].priority_tier).toBe("recommended")
    expect(res.tasks[0].essential_candidate).toBe("manual_emphasis")
  })

  it("mixed care_type can hold essential (floor allows mixed)", () => {
    const res = applyTaskTaxonomy([
      row({ title: "Run washer cleaning cycle", care_type: "mixed", priority_tier: "essential", risk_level: "prevent_damage" }),
    ])
    expect(res.tasks[0].priority_tier).toBe("essential")
  })

  it("never mutates input rows", () => {
    const input = row({ title: "Wipe Dishwasher Exterior", priority_tier: "essential", risk_level: "comfort" })
    applyTaskTaxonomy([input])
    expect(input.care_type).toBe("maintenance")
    expect(input.priority_tier).toBe("essential")
    expect(input.essential_candidate).toBeUndefined()
  })
})

describe("applyTaskTaxonomy — the dishwasher screenshot end-to-end", () => {
  it("splits the reported task list into the right buckets", () => {
    const res = applyTaskTaxonomy([
      row({ title: "Add Detergent Before Each Cycle", schedule_type: "after_each_use", priority_tier: "essential", risk_level: "performance" }),
      row({ title: "Refill the Rinse Aid Dispenser", schedule_type: "as_needed" }),
      row({ title: "Clean the Dishwasher Exterior", schedule_type: "weekly" }),
      row({ title: "Clean the Door Seal", schedule_type: "weekly" }),
      row({ title: "Clean filter system (light to average use)", schedule_type: "monthly" }),
      row({ title: "Descale the dishwasher", schedule_type: "monthly", priority_tier: "essential", risk_level: "prevent_damage" }),
    ])
    // Operational → tips
    expect(res.tips.map((t) => t.title)).toEqual([
      "Add Detergent Before Each Cycle",
      "Refill the Rinse Aid Dispenser",
    ])
    // Exterior wipe → cleaning; functional cleans stay maintenance
    const byTitle = Object.fromEntries(res.tasks.map((t) => [t.title, t]))
    expect(byTitle["Clean the Dishwasher Exterior"].care_type).toBe("cleaning")
    expect(byTitle["Clean the Door Seal"].care_type).toBe("maintenance")
    expect(byTitle["Clean filter system (light to average use)"].care_type).toBe("maintenance")
    expect(byTitle["Descale the dishwasher"].priority_tier).toBe("essential")
  })
})
