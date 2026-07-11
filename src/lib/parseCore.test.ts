import { describe, it, expect } from "vitest"
import {
  normalizeTaskRow,
  normalizeChunkRow,
  splitSteps,
  stepsFromInstructions,
  extKey,
  normTitle,
  titleSimilarity,
  planTaskReconciliation,
  TITLE_MATCH_THRESHOLD,
  VALID_SYMPTOM_TAGS,
  type ReconcileExisting,
} from "../../shared/parse/parseCore"
import { ALL_SYMPTOM_TAGS } from "./symptomTaxonomy"

// The first tests on parse-pipeline logic. parseCore is the SINGLE normalizer
// used by both DB-writing paths (parse-manual auto-commit + save-parsed-manual
// review flow), so these tests guard both at once.

describe("normalizeTaskRow", () => {
  it("derives structured steps from multi-step instructions", () => {
    const row = normalizeTaskRow({
      title: "Clean the filter",
      instructions_text: "Remove the filter. Rinse under warm water. Let it dry fully.",
    })
    expect(row.steps).toEqual([
      "Remove the filter.",
      "Rinse under warm water.",
      "Let it dry fully.",
    ])
    expect(row.instructions_override).toContain("Remove the filter.")
  })

  it("leaves steps null for a single-block instruction (render-time fallback)", () => {
    const row = normalizeTaskRow({ title: "Wipe exterior", instructions_text: "Wipe with a damp cloth" })
    expect(row.steps).toBeNull()
  })

  it("clamps and defaults enum fields", () => {
    const row = normalizeTaskRow({
      title: "T".repeat(300),
      care_type: "bogus",
      priority_tier: "urgent",
      risk_level: "??",
      schedule_type: "sometimes",
    })
    expect(row.title).toHaveLength(200)
    expect(row.care_type).toBe("maintenance")
    expect(row.priority_tier).toBe("recommended")
    expect(row.risk_level).toBe("comfort")
    expect(row.schedule_type).toBe("as_needed")
  })

  it("keeps justification trimmed and nulls empty ones", () => {
    expect(normalizeTaskRow({ title: "x", justification: "  Prevents pump damage.  " }).justification)
      .toBe("Prevents pump damage.")
    expect(normalizeTaskRow({ title: "x", justification: "   " }).justification).toBeNull()
    expect(normalizeTaskRow({ title: "x" }).justification).toBeNull()
  })

  it("filters symptom tags to the canonical taxonomy, dedupes, caps at 5", () => {
    const row = normalizeTaskRow({
      title: "x",
      symptom_tags: ["leaking", "leaking", "made_up", "odor", "noise", "vibration", "drainage", "electrical"],
    })
    expect(row.symptom_tags).toEqual(["leaking", "odor", "noise", "vibration", "drainage"])
  })

  it("accepts re_check_triggers only on setup tasks and validates them", () => {
    const triggers = [
      { trigger: "vibration", description: "Washer walks during spin", severity: "warning" },
      { trigger: "not_a_tag", description: "dropped", severity: "warning" },
      { trigger: "electrical", description: "Sparks", severity: "catastrophic" },
    ]
    const setup = normalizeTaskRow({ title: "Level the washer", schedule_type: "setup", re_check_triggers: triggers })
    expect(setup.re_check_triggers).toEqual([
      { trigger: "vibration", description: "Washer walks during spin", severity: "warning" },
      { trigger: "electrical", description: "Sparks", severity: "warning" },
    ])
    const recurring = normalizeTaskRow({ title: "Clean filter", schedule_type: "monthly", re_check_triggers: triggers })
    expect(recurring.re_check_triggers).toEqual([])
  })

  it("rounds source_page and rejects non-positive/non-numeric values", () => {
    expect(normalizeTaskRow({ title: "x", source_page: 23.6 }).source_page).toBe(24)
    expect(normalizeTaskRow({ title: "x", source_page: 0 }).source_page).toBeNull()
    expect(normalizeTaskRow({ title: "x", source_page: -3 }).source_page).toBeNull()
    expect(normalizeTaskRow({ title: "x" }).source_page).toBeNull()
  })

  it("keeps interval_days only for every_n_days schedules", () => {
    expect(normalizeTaskRow({ title: "x", schedule_type: "every_n_days", interval_days: 45 }).interval_days).toBe(45)
    expect(normalizeTaskRow({ title: "x", schedule_type: "monthly", interval_days: 45 }).interval_days).toBeNull()
  })

  it("normalizes supplies from objects and bare strings, deduped and capped", () => {
    const row = normalizeTaskRow({
      title: "x",
      supplies: [
        { name: "HEPA filter", category: "filter", part_number: "AB-123" },
        "hepa filter",
        { name: "Descaler", category: "weird" },
      ],
    })
    expect(row.supplies).toEqual([
      { name: "HEPA filter", category: "filter", part_number: "AB-123" },
      { name: "Descaler", category: "other", part_number: null },
    ])
  })
})

describe("normalizeChunkRow", () => {
  it("falls back to how_to for unknown chunk types and applies level rules", () => {
    const row = normalizeChunkRow({ chunk_type: "mystery", content: "c" }, "m1")
    expect(row.chunk_type).toBe("how_to")
    expect(row.content_level).toBe("everyday")
    expect(row.manual_id).toBe("m1")
  })

  it("defaults safety chunks to important and specs to no level", () => {
    expect(normalizeChunkRow({ chunk_type: "safety", content: "c", content_level: "bogus" }, "m").content_level).toBe("important")
    expect(normalizeChunkRow({ chunk_type: "safety", content: "c", content_level: "critical" }, "m").content_level).toBe("critical")
    expect(normalizeChunkRow({ chunk_type: "specs", content: "c", content_level: "critical" }, "m").content_level).toBeNull()
  })

  it("carries diagram pages on metadata", () => {
    const row = normalizeChunkRow({ chunk_type: "how_to", content: "c", diagram_pages: [{ page: 4, caption: "x" }] }, "m")
    expect((row.metadata as { diagram_pages: unknown[] }).diagram_pages).toHaveLength(1)
  })
})

describe("splitSteps / stepsFromInstructions", () => {
  it("splits numbered lines, inline numbering, and sentences", () => {
    expect(splitSteps("1. Open door\n2. Slide rack")).toEqual(["Open door", "Slide rack"])
    expect(splitSteps("1. Open door. 2. Slide rack in.")).toEqual(["Open door.", "Slide rack in."])
    expect(splitSteps("Open the door. Slide the rack in.")).toEqual(["Open the door.", "Slide the rack in."])
  })
  it("returns null for non-strings and single blocks", () => {
    expect(stepsFromInstructions(null)).toBeNull()
    expect(stepsFromInstructions("Just wipe it")).toBeNull()
  })
})

describe("extKey / normTitle", () => {
  it("is stable across case and whitespace variations of the same title", () => {
    expect(extKey("item1", null, "Clean the  Filter"))
      .toBe(extKey("item1", null, "clean the filter "))
    expect(normTitle("  Clean   The Filter ")).toBe("clean the filter")
  })
  it("differs across items and titles", () => {
    expect(extKey("item1", null, "Clean the filter")).not.toBe(extKey("item2", null, "Clean the filter"))
    expect(extKey("item1", null, "Clean the filter")).not.toBe(extKey("item1", null, "Replace the filter"))
  })
})

describe("taxonomy parity", () => {
  it("edge VALID_SYMPTOM_TAGS matches src/lib/symptomTaxonomy exactly", () => {
    expect([...VALID_SYMPTOM_TAGS].sort()).toEqual([...ALL_SYMPTOM_TAGS].sort())
  })
})

// Real retitle pairs OBSERVED by the eval harness across re-parses of the same
// manuals — the matcher must catch these (they were "MISSING + added" churn).
const OBSERVED_RETITLES: Array<[string, string]> = [
  ["Run Citrus-Only Cycle to Refresh Filters", "Run Odor-Mitigation Citrus Cycle"],
  ["Verify grounded electrical connection", "Verify range grounding and power connection"],
  ["Remove packing materials and protective film", "Remove protective shipping film and tape"],
  ["Remove Shipping Bolts Before First Use", "Unpack and Remove Shipping Bolts"],
  ["Clean the Bucket", "Clean the Bucket After Each Use"],
  // Cadence variants beyond "use" — the live FoodCycler duplicate (bug #2).
  ["Clean the Bucket", "Clean the Bucket After Each Cycle"],
  ["Clean the Bucket", "Clean the Bucket After Each Wash"],
  ["Empty the Lint Filter", "Empty the Lint Filter After Each Load"],
  ["Replace Carbon Filters", "Replace Carbon Filters (Every 3-6 Months)"],
  ["Rinse the Basket", "Rinse the Basket Every 5 Loads"],
]

describe("titleSimilarity", () => {
  it("matches every retitle pair observed in real eval churn", () => {
    for (const [a, b] of OBSERVED_RETITLES) {
      expect(titleSimilarity(a, b), `${a} ↔ ${b}`).toBeGreaterThanOrEqual(TITLE_MATCH_THRESHOLD)
    }
  })
  it("does not match genuinely different tasks", () => {
    expect(titleSimilarity("Clean the filter", "Replace the filter")).toBeLessThan(TITLE_MATCH_THRESHOLD)
    expect(titleSimilarity("Clean Door Gasket", "Clean Door Glass")).toBeLessThan(1) // disambiguated by greedy pairing
    expect(titleSimilarity("Level the washer", "Descale the coffee machine")).toBe(0)
  })
})

describe("planTaskReconciliation", () => {
  const ex = (id: string, title: string, over: Partial<ReconcileExisting> = {}): ReconcileExisting => ({
    id, title, externalKey: extKey("item1", null, title), isLegacy: false, missedScans: 0, hasCompletions: false, ...over,
  })

  it("matches exact keys first, then fuzzy retitles, and inserts the rest", () => {
    const plan = planTaskReconciliation(
      "item1",
      ["Clean the Bucket", "Run Odor-Mitigation Citrus Cycle", "Brand New Task"],
      [ex("a", "Clean the Bucket"), ex("b", "Run Citrus-Only Cycle to Refresh Filters")]
    )
    expect(plan.matches).toEqual([
      expect.objectContaining({ incomingIndex: 0, existingId: "a", matchedBy: "key" }),
      expect.objectContaining({ incomingIndex: 1, existingId: "b", matchedBy: "fuzzy" }),
    ])
    expect(plan.inserts).toEqual([2])
    expect(plan.deletes).toEqual([])
  })

  it("greedy pairing keeps gasket/glass style siblings correctly paired", () => {
    const plan = planTaskReconciliation(
      "item1",
      ["Clean Oven Door Glass Monthly", "Clean Oven Door Gasket Weekly"],
      [ex("glass", "Clean Oven Door Glass"), ex("gasket", "Clean Oven Door Gasket")]
    )
    const byIncoming = new Map(plan.matches.map((m) => [m.incomingIndex, m.existingId]))
    expect(byIncoming.get(0)).toBe("glass")
    expect(byIncoming.get(1)).toBe("gasket")
  })

  it("flags an absent task instead of deleting it (first miss)", () => {
    const plan = planTaskReconciliation("item1", ["Something Else Entirely"], [ex("a", "Clean the Bucket")])
    expect(plan.deletes).toEqual([])
    expect(plan.flags).toEqual([{ existingId: "a", missedScans: 1 }])
  })

  it("deletes only after repeated absence — and never a completed task", () => {
    const plan = planTaskReconciliation(
      "item1",
      ["Something Else Entirely"],
      [
        ex("fresh", "Clean the Bucket"),
        ex("stale", "Replace Carbon Filters", { missedScans: 1 }),
        ex("done", "Descale the Machine", { missedScans: 5, hasCompletions: true }),
      ]
    )
    expect(plan.deletes).toEqual(["stale"])
    expect(plan.flags).toEqual([
      { existingId: "fresh", missedScans: 1 },
      { existingId: "done", missedScans: 6 },
    ])
  })

  it("a re-appearing task is matched again (executor resets its counter)", () => {
    const plan = planTaskReconciliation("item1", ["Clean the Bucket"], [ex("a", "Clean the Bucket", { missedScans: 1 })])
    expect(plan.matches[0]).toEqual(expect.objectContaining({ existingId: "a", matchedBy: "key" }))
    expect(plan.flags).toEqual([])
    expect(plan.deletes).toEqual([])
  })

  it("reclaims legacy rows (no external_key) by title", () => {
    const plan = planTaskReconciliation(
      "item1",
      ["Clean the Bucket"],
      [ex("legacy", "Clean The  Bucket", { externalKey: null, isLegacy: true })]
    )
    expect(plan.matches[0]).toEqual(expect.objectContaining({ existingId: "legacy", matchedBy: "key" }))
  })
})
