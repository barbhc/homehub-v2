/**
 * HH-166 (owner, 2026-10-16): "Winterize the washer for cold storage" sat on
 * her agenda as "Usually autumn" in a mild-climate home. In a home that does
 * not freeze it is an as-needed job (when the washer goes into unheated
 * storage), not a yearly autumn one.
 *
 * Gate-1 review narrowed it: only the literal phrase "cold storage", only in a
 * home that said it doesn't freeze, and only while it still carries the
 * parser's seasonal cadence. A cold-climate home's "Winterize … before storing
 * it" is real autumn work and stays put.
 */
import { describe, it, expect } from "vitest"
import { isAsNeededColdStorage, isColdStorageWinterizing, seasonalFamily } from "./houseRules"

const OWNERS = "Winterize Washer for Cold Storage"

describe("isColdStorageWinterizing — the literal phrase only", () => {
  it("catches the owner's task", () => {
    for (const t of [OWNERS, "Winterize the washer for cold storage", "Prepare for cold-storage"]) {
      expect(isColdStorageWinterizing(t), t).toBe(true)
    }
  })

  it("does not catch storing/moving wording — that can be real autumn work", () => {
    for (const t of [
      "Winterize the pressure washer before storing it",
      "Winterize the washer before moving",
      "Winterize the outdoor faucets",
      "Store the hose reel",
    ]) expect(isColdStorageWinterizing(t), t).toBe(false)
  })

  it("stays in the freeze_prep family, so the climate offer still lists it", () => {
    expect(seasonalFamily(OWNERS)).toBe("freeze_prep")
  })
})

describe("isAsNeededColdStorage — the climate gate", () => {
  it("a mild (freeze-free) home: 'Winterize Washer for Cold Storage' on its parsed seasonal cadence is as-needed", () => {
    expect(isAsNeededColdStorage({ title: OWNERS, scheduleType: "seasonal", freezeFree: true })).toBe(true)
  })

  it("a cold-climate home keeps it — and its seasonal 'winterize … before storing' — on the agenda", () => {
    expect(isAsNeededColdStorage({ title: OWNERS, scheduleType: "seasonal", freezeFree: false })).toBe(false)
    expect(isAsNeededColdStorage({ title: "Winterize the pressure washer before storing it", scheduleType: "seasonal", freezeFree: false })).toBe(false)
    // …and that one is not cold-storage wording even in a mild home.
    expect(isAsNeededColdStorage({ title: "Winterize the pressure washer before storing it", scheduleType: "seasonal", freezeFree: true })).toBe(false)
  })

  it("a cadence the owner chose is kept", () => {
    expect(isAsNeededColdStorage({ title: OWNERS, scheduleType: "annual", freezeFree: true })).toBe(false)
    expect(isAsNeededColdStorage({ title: OWNERS, scheduleType: "every_n_days", freezeFree: true })).toBe(false)
  })
})
