import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import {
  corpusScore,
  scoreManual,
  WEIGHTS,
  type Expectations,
  type Extraction,
  type RawTask,
} from "./score.js"

/**
 * The scorer decides whether a parse regression ships. If IT is wrong, the
 * number it produces is worse than no number — a green eval that measures
 * nothing is how a team stops looking.
 */

const task = (t: Partial<RawTask>): RawTask => ({
  title: "Clean the Filter",
  schedule_type: "monthly",
  priority_tier: "recommended",
  care_type: "maintenance",
  instructions_text: "Slide the filter out and rinse it under warm water.",
  justification: "A clogged filter damages the pump.",
  source_page: 12,
  ...t,
})

const ext = (tasks: RawTask[], over: Partial<Extraction> = {}): Extraction => ({
  tasks,
  chunks: [{ title: "Care", content: "Wipe the seals.", source_pages: [3] }],
  ...over,
})

const exp = (over: Partial<Expectations> = {}): Expectations => ({
  name: "test",
  appliance: "Test appliance",
  ...over,
})

describe("recall", () => {
  it("finds a must-have by ANY of its title patterns", () => {
    // Manufacturers name the same part differently ("lint filter", "lint
    // screen", "lint trap"), so an expectation lists the aliases and any one
    // of them counts.
    const e = exp({ must_have: [{ id: "lint", title_matches: ["lint", "\\bfilter\\b"], why: "w" }] })
    const found = (title: string) => scoreManual(ext([task({ title })]), e).dimensions.recall.earned
    expect(found("Clean the Lint Trap")).toBe(1)
    expect(found("Clean the Filter")).toBe(1)
    expect(found("Wipe the Door Seal")).toBe(0)
  })

  it("says WHY a missing task matters in the failure text", () => {
    // A failure that does not explain itself gets muted rather than fixed.
    const e = exp({ must_have: [{ id: "filter", title_matches: ["filter"], why: "a clogged filter is a fire" }] })
    expect(scoreManual(ext([task({ title: "Wipe the Door" })]), e).failures[0]).toContain("a clogged filter is a fire")
  })
})

describe("precision", () => {
  it("flags a forbidden task", () => {
    const e = exp({ must_not_have: [{ id: "detergent", title_matches: ["add.{0,20}detergent"], why: "operation" }] })
    expect(scoreManual(ext([task({ title: "Add Detergent Before Each Cycle" })]), e).dimensions.precision).toMatchObject({ earned: 0, possible: 1 })
  })

  it("where:recurring forgives the SAME title as a setup task", () => {
    // A commissioning gas-leak test is legitimate at install and absurd on a
    // calendar. The distinction is the schedule, not the words.
    const e = exp({ must_not_have: [{ id: "gas", title_matches: ["gas"], where: "recurring", why: "w" }] })
    expect(scoreManual(ext([task({ title: "Gas Leak Check", schedule_type: "setup" })]), e).dimensions.precision).toMatchObject({ earned: 1 })
    expect(scoreManual(ext([task({ title: "Gas Leak Check", schedule_type: "annual" })]), e).dimensions.precision).toMatchObject({ earned: 0 })
  })
})

describe("cadence", () => {
  const e = exp({ must_have: [{ id: "tub", title_matches: ["tub"], cadence: ["monthly"], why: "manual says monthly" }] })

  it("fails a stated interval softened to as_needed", () => {
    // The single failure the SCHEDULE FIDELITY prompt section exists to prevent.
    expect(scoreManual(ext([task({ title: "Tub Clean", schedule_type: "as_needed" })]), e).dimensions.cadence).toMatchObject({ earned: 0, possible: 1 })
  })

  it("is NOT scored when the task is missing entirely", () => {
    // Already counted once against recall. Counting it twice makes one failure
    // look like two, and makes a cadence fix look like it fixed nothing.
    const s = scoreManual(ext([task({ title: "Wipe the Door" })]), e)
    expect(s.dimensions.cadence.possible).toBe(0)
  })
})

describe("structure", () => {
  it("fails a truncated response", () => {
    const s = scoreManual(ext([task({})], { truncated: true }), exp())
    expect(s.failures.join(" ")).toContain("not-truncated")
  })

  it("rejects an implausible source_page rather than accepting any number", () => {
    // A hallucinated page 9999 is worse than a missing one: it sends the user
    // to a page that does not exist and looks authoritative doing it.
    expect(scoreManual(ext([task({ source_page: 9999 })]), exp()).failures.join(" ")).toContain("source-page")
    expect(scoreManual(ext([task({ source_page: 12 })]), exp()).failures.join(" ")).not.toContain("source-page")
  })

  it("rejects an off-enum schedule_type", () => {
    expect(scoreManual(ext([task({ schedule_type: "every_fortnight" })]), exp()).failures.join(" ")).toContain("valid-schedules")
  })
})

describe("safety", () => {
  it("catches a hazardous DIY instruction", () => {
    const e = exp({ forbidden_instructions: [{ id: "gas", matches: ["smell gas"], why: "professional only" }] })
    const s = scoreManual(ext([task({ instructions_text: "Loosen the union until you smell gas." })]), e)
    expect(s.dimensions.safety).toMatchObject({ earned: 0, possible: 1 })
    expect(s.failures.join(" ")).toContain("HAZARDOUS DIY")
  })
})

describe("weighting", () => {
  it("renormalises over the dimensions that APPLY", () => {
    // Otherwise the image-only manual, which can assert almost nothing, reads
    // as a permanent failure and drags the corpus average somewhere meaningless.
    const bare = exp({ bounds: { min_tasks: 1 } })
    expect(scoreManual(ext([task({})]), bare).score).toBe(100)
  })

  it("scores 0 when nothing at all applies, rather than a misleading 100", () => {
    expect(scoreManual({ tasks: [], chunks: [] }, exp()).score).toBeLessThan(100)
  })

  it("costs more to lose a must-have than to miss a volume bound", () => {
    const recallMiss = scoreManual(ext([task({ title: "Wipe" })]), exp({ must_have: [{ id: "f", title_matches: ["filter"], why: "w" }], bounds: { max_tasks: 5 } }))
    const volumeMiss = scoreManual(ext(Array.from({ length: 9 }, () => task({ title: "Clean the Filter" }))), exp({ must_have: [{ id: "f", title_matches: ["filter"], why: "w" }], bounds: { max_tasks: 5 } }))
    expect(recallMiss.score).toBeLessThan(volumeMiss.score)
    expect(WEIGHTS.recall).toBeGreaterThan(WEIGHTS.volume)
  })

  it("gives every manual one vote in the corpus score", () => {
    // Not weighted by expectation count, or the most thoroughly specified
    // manual would quietly become the whole eval.
    expect(corpusScore([
      { score: 100 } as never,
      { score: 50 } as never,
    ])).toBe(75)
  })
})

describe("the corpus on disk", () => {
  const DIR = join(import.meta.dirname, "..", "corpus")
  const corpus = JSON.parse(readFileSync(join(DIR, "corpus.json"), "utf8")) as {
    manuals: { name: string; covers?: string }[]
  }

  it("has at least the 10 manuals the evals rule requires", () => {
    expect(corpus.manuals.length).toBeGreaterThanOrEqual(10)
  })

  it("has an expectations file for every corpus entry, and no orphans", () => {
    const files = new Set(readdirSync(join(DIR, "expectations")).map((f) => f.replace(/\.json$/, "")))
    const names = new Set(corpus.manuals.map((m) => m.name))
    expect([...names].filter((n) => !files.has(n))).toEqual([])
    expect([...files].filter((f) => !names.has(f))).toEqual([])
  })

  it("records WHY each manual is in the corpus", () => {
    // Head-count is not the goal. Without this, the corpus grows into ten
    // blenders and calls itself coverage.
    for (const m of corpus.manuals) expect(m.covers, `${m.name} has no "covers"`).toBeTruthy()
  })

  it("grounds every expectation file in what the manual actually says", () => {
    for (const m of corpus.manuals) {
      const e = JSON.parse(readFileSync(join(DIR, "expectations", `${m.name}.json`), "utf8")) as Expectations & { grounded_in?: string }
      expect(e.grounded_in, `${m.name} is not grounded`).toBeTruthy()
      for (const x of [...(e.must_have ?? []), ...(e.must_not_have ?? []), ...(e.should_have ?? [])]) {
        expect(x.why, `${m.name}/${x.id} has no why`).toBeTruthy()
      }
    }
  })

  it("keeps every expectation pattern a valid regex", () => {
    for (const m of corpus.manuals) {
      const e = JSON.parse(readFileSync(join(DIR, "expectations", `${m.name}.json`), "utf8")) as Expectations
      for (const x of [...(e.must_have ?? []), ...(e.must_not_have ?? []), ...(e.should_have ?? [])]) {
        for (const p of x.title_matches ?? []) {
          expect(() => new RegExp(p, "i"), `${m.name}/${x.id}: ${p}`).not.toThrow()
        }
      }
    }
  })
})

describe("the committed baseline", () => {
  const base = JSON.parse(readFileSync(join(import.meta.dirname, "..", "baseline.json"), "utf8")) as {
    corpus: number; promptHash: string; manuals: Record<string, number>
  }

  it("exists, so a future change can report a delta", () => {
    expect(base.corpus).toBeGreaterThan(0)
    expect(base.promptHash).toMatch(/^[0-9a-f]{12}$/)
  })

  it("covers every manual in the corpus", () => {
    const corpus = JSON.parse(readFileSync(join(import.meta.dirname, "..", "corpus", "corpus.json"), "utf8")) as { manuals: { name: string }[] }
    for (const m of corpus.manuals) expect(base.manuals[m.name], `${m.name} missing from baseline`).toBeGreaterThan(0)
  })
})
