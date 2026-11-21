/** The task card's rules (design/task-card.md, owner-approved 2026-11-21). */
import { describe, expect, it } from "vitest"
import { itemMinutesLine, tierOfPriority, whenTone, isProLine } from "./taskCard"

describe("whenTone", () => {
  it("a window stays grey: most tasks have a window, not a date", () => {
    for (const p of ["Good to do now", "This week", "In Sep", "Been a while", "Start anytime"]) expect(whenTone(p)).toBe("plain")
  })
  it("a real date is ink: a deadline someone set, or a day it's set for", () => {
    for (const p of ["By Dec 5", "Sat, Jun 27", "Today", "Tomorrow"]) expect(whenTone(p)).toBe("date")
  })
  it("a passed deadline or lapsed safety work is clay — never for a window", () => {
    expect(whenTone("By Jun 20", { trulyOverdue: true })).toBe("attention")
    expect(whenTone("Skipped last cycle", { safetyNote: "Skipped last cycle" })).toBe("attention")
    expect(whenTone(null)).toBe("plain")
  })
})

describe("itemMinutesLine", () => {
  it("joins whichever halves exist, and leaves out an empty slot", () => {
    expect(itemMinutesLine("Carrier Infinity Furnace", 10)).toBe("Carrier Infinity Furnace · 10 min")
    expect(itemMinutesLine("Whole home", null)).toBe("Whole home")
    expect(itemMinutesLine(null, 5)).toBe("5 min")
    expect(itemMinutesLine("  ", 0)).toBeNull()
  })
})

describe("tierOfPriority", () => {
  it("maps the legacy priorities to the calm tiers, unknown to Optional", () => {
    expect(tierOfPriority("critical")).toBe("essential")
    expect(tierOfPriority("high")).toBe("recommended")
    expect(tierOfPriority("medium")).toBe("optional")
    expect(tierOfPriority("nonsense")).toBe("optional")
    expect(tierOfPriority(null)).toBe("optional")
  })
})

it("the supply slot names who to book for pro work", () => {
  expect(isProLine("Schedule a visit with a technician.")).toBe(true)
  expect(isProLine("You'll need a 16 × 25 × 1 filter.")).toBe(false)
})
