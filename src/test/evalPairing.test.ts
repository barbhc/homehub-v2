/**
 * Why the parse-eval goldens kept "rotting".
 *
 * The golden comparison walked the golden list in order, letting each entry
 * claim the best still-unclaimed new title. That is order-dependent: an early
 * golden can take a title a later one matches far better, so ONE rename
 * surfaces as a dropped task AND an added task — a phantom regression. The
 * furnace golden failed on exactly this, on the old AND new prompt.
 *
 * The scoring was never at fault. `titleSimilarity` scores every real rename in
 * that corpus 0.60–1.00 against a 0.5 threshold, hyphen case included — the
 * assignment was the bug, so this fixes the harness and leaves the production
 * matcher (non-negotiable #1) untouched.
 *
 * Lives in src/test/ because vitest only scans src/, shared/ and evals/, and
 * scripts/parse-eval/run.ts self-executes on import.
 */
import { describe, it, expect } from "vitest"
import { pairByBestScore } from "../../scripts/parse-eval/pairing"
import { titleSimilarity, TITLE_MATCH_THRESHOLD } from "../../shared/parse/parseCore"

describe("titleSimilarity was not the problem", () => {
  it("scores the furnace renames above threshold, hyphen included", () => {
    const pairs: [string, string][] = [
      ["Install High Altitude Pressure Switches", "Install High-Altitude Pressure Switches"],
      ["Inspect Condensate Drain System", "Inspect and Clear Condensate Drain"],
      ["Schedule Annual Professional Furnace Inspection", "Annual Professional Furnace Inspection"],
      ["Test Rollout Switch Reset", "Reset Rollout Switch After Trip"],
      ["Verify Gas Piping Connections at Startup", "Perform Gas Piping Leak Check at Startup"],
    ]
    for (const [a, b] of pairs) {
      expect(titleSimilarity(a, b), `${a} vs ${b}`).toBeGreaterThanOrEqual(TITLE_MATCH_THRESHOLD)
    }
  })
})

describe("pairByBestScore", () => {
  it("does not let an early entry steal a title a later one matches better", () => {
    // 0.25 vs 0.75 against the same new title. Order must not decide.
    const golden = ["Protect Condensate System from Freezing", "Inspect Condensate Drain System"]
    const next = ["Inspect and Clear Condensate Drain"]
    const { pairs, unmatchedGolden } = pairByBestScore(golden, next)
    expect(pairs).toEqual([[1, 0]])
    expect(unmatchedGolden).toEqual([0])
  })

  it("gives the same answer whatever order the lists arrive in", () => {
    const a = ["Clean the Pre-Filter", "Replace the HEPA Filter", "Clean the Dust Sensor"]
    const b = ["Replace HEPA Filter", "Clean Dust Sensor", "Clean Pre-Filter"]
    expect(pairByBestScore(a, b).pairs.length).toBe(3)
    expect(pairByBestScore([...a].reverse(), b).unmatchedGolden).toEqual([])
  })

  it("never pairs below the production threshold", () => {
    const r = pairByBestScore(["Replace the Water Filter"], ["Descale the Boiler"])
    expect(r.pairs).toEqual([])
    expect(r.unmatchedGolden).toEqual([0])
    expect(r.unmatchedNext).toEqual([0])
  })

  it("still reports genuine drops and additions", () => {
    const r = pairByBestScore(
      ["Clean the Pre-Filter", "Descale the Boiler"],
      ["Clean Pre-Filter", "Clean Flame Sensor"],
    )
    expect(r.pairs).toEqual([[0, 0]])
    expect(r.unmatchedGolden).toEqual([1])
    expect(r.unmatchedNext).toEqual([1])
  })

  it("is deterministic on ties, so two runs of the same data agree", () => {
    const g = ["Clean Filter A", "Clean Filter B"]
    const n = ["Clean Filter", "Clean Filter"]
    expect(pairByBestScore(g, n).pairs).toEqual(pairByBestScore(g, n).pairs)
  })
})
