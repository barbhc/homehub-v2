import { describe, it, expect } from "vitest"
import { dueLabel, greeting, priorityTier, effortMins, dens } from "./tokens"

describe("dueLabel", () => {
  it("labels overdue in calm language (negative days)", () => {
    expect(dueLabel(-1)).toBe("1 day overdue")
    expect(dueLabel(-5)).toBe("5 days overdue")
  })
  it("labels near-term days", () => {
    expect(dueLabel(0)).toBe("Today")
    expect(dueLabel(1)).toBe("Tomorrow")
    expect(dueLabel(4)).toBe("In 4 days")
  })
  it("falls back to a short date beyond a week", () => {
    // en-US short format, e.g. "Wed, Jul 22"
    expect(dueLabel(30)).toMatch(/^[A-Z][a-z]{2},? [A-Z][a-z]{2} \d+$/)
  })
})

describe("priorityTier", () => {
  it("maps legacy priority to calm tiers", () => {
    expect(priorityTier("critical")).toBe("essential")
    expect(priorityTier("high")).toBe("recommended")
    expect(priorityTier("medium")).toBe("optional")
    expect(priorityTier("low")).toBe("optional")
  })
})

describe("greeting", () => {
  it("varies by hour", () => {
    expect(greeting(new Date(2026, 0, 1, 9))).toBe("Good morning")
    expect(greeting(new Date(2026, 0, 1, 14))).toBe("Good afternoon")
    expect(greeting(new Date(2026, 0, 1, 20))).toBe("Good evening")
  })
})

describe("effortMins", () => {
  it("maps effort tiers, null when unset", () => {
    expect(effortMins("short")).toBe(5)
    expect(effortMins("medium")).toBe(15)
    expect(effortMins("long")).toBe(30)
    expect(effortMins(null)).toBeNull()
  })
})

describe("dens", () => {
  it("defaults to cozy", () => {
    expect(dens()).toEqual(dens("cozy"))
    expect(dens("compact").pad).toBe(16)
  })
})
