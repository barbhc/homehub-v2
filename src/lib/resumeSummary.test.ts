import { describe, it, expect } from "vitest"
import { resumeSummary, describeWhen } from "./resumeSummary"
import type { WizardSession } from "@/lib/wizardSession"

const T0 = Date.parse("2026-08-25T12:00:00.000Z")

const session = (over: Partial<WizardSession> = {}): WizardSession =>
  ({
    itemId: "i1",
    propertyId: "h1",
    step: "manual",
    itemName: "",
    brand: null,
    model: null,
    locationId: null,
    hasManual: false,
    hasTasks: false,
    createdAt: new Date(T0 - 20 * 60_000).toISOString(),
    ...over,
  }) as WizardSession

describe("describeWhen — coarse on purpose; recognition, not precision", () => {
  it("calls the last two minutes 'just now'", () => {
    expect(describeWhen(new Date(T0 - 30_000).toISOString(), T0)).toBe("just now")
  })
  it("counts minutes within the hour", () => {
    expect(describeWhen(new Date(T0 - 20 * 60_000).toISOString(), T0)).toBe("20 minutes ago")
  })
  it("switches to hours, singular at one", () => {
    expect(describeWhen(new Date(T0 - 60 * 60_000).toISOString(), T0)).toBe("an hour ago")
    expect(describeWhen(new Date(T0 - 5 * 60 * 60_000).toISOString(), T0)).toBe("5 hours ago")
  })
  it("says yesterday, then days", () => {
    expect(describeWhen(new Date(T0 - 26 * 60 * 60_000).toISOString(), T0)).toBe("yesterday")
    expect(describeWhen(new Date(T0 - 72 * 60 * 60_000).toISOString(), T0)).toBe("3 days ago")
  })
  it("says nothing rather than something wrong", () => {
    expect(describeWhen(null, T0)).toBe("")
    expect(describeWhen("not a date", T0)).toBe("")
  })
  it("never reports a negative age from a clock skew", () => {
    expect(describeWhen(new Date(T0 + 5 * 60_000).toISOString(), T0)).toBe("just now")
  })
})

describe("resumeSummary — name the thing and say what is missing", () => {
  it("prefers the typed name", () => {
    expect(resumeSummary(session({ itemName: "Beer fridge" }), T0).title).toBe("Beer fridge")
  })

  it("falls back to brand and model", () => {
    expect(
      resumeSummary(session({ brand: "Fisher & Paykel", model: "RF135BDRUX4" }), T0).title
    ).toBe("Fisher & Paykel RF135BDRUX4")
  })

  it("does not present the placeholder name as a real one", () => {
    // composeItemName falls back to "Item"; echoing that back reads as a bug.
    expect(resumeSummary(session({ itemName: "Item" }), T0).title).toBe("an item you started adding")
  })

  it("says something recognisable even when nothing at all was entered", () => {
    expect(resumeSummary(session(), T0).title).toBe("an item you started adding")
  })

  it("names the manual first, because without it there is no upkeep", () => {
    expect(resumeSummary(session({ hasManual: false }), T0).missing).toMatch(/manual isn't attached/)
  })

  it("moves on to the scan once a manual is there", () => {
    expect(resumeSummary(session({ hasManual: true, hasTasks: false }), T0).missing)
      .toMatch(/nothing has been scanned/)
  })

  it("ends at the review when everything else is done", () => {
    expect(resumeSummary(session({ hasManual: true, hasTasks: true }), T0).missing)
      .toMatch(/waiting to be reviewed/)
  })

  it("carries the age so Start fresh is not a guess", () => {
    expect(resumeSummary(session(), T0).when).toBe("20 minutes ago")
  })

  it("never says 'an incomplete setup' — the whole complaint", () => {
    const s = resumeSummary(session({ brand: "LG", model: "DLGX3901B" }), T0)
    expect(`${s.title} ${s.missing}`).not.toMatch(/incomplete setup/i)
  })
})
