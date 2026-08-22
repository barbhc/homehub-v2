import { describe, it, expect, beforeEach } from "vitest"
import { dismissPurchaseNudge, isPurchaseNudgeDismissed, shouldOfferPurchaseNudge } from "./purchaseNudge"

describe("purchase nudge memory", () => {
  beforeEach(() => localStorage.clear())

  it("offers on a fresh item with no purchase date", () => {
    expect(shouldOfferPurchaseNudge("i1", null)).toBe(true)
  })

  it("stays dismissed for that item only", () => {
    dismissPurchaseNudge("i1")
    expect(isPurchaseNudgeDismissed("i1")).toBe(true)
    expect(shouldOfferPurchaseNudge("i1", null)).toBe(false)
    expect(shouldOfferPurchaseNudge("i2", null)).toBe(true)
  })

  it("never asks for what the item already has", () => {
    expect(shouldOfferPurchaseNudge("i3", "2026-02-14")).toBe(false)
  })
})
