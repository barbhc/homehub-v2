/**
 * HH-80 — the state between "no items" and "a working home".
 *
 * The owner added an LG dryer, its manual search offered two wrong documents
 * (HH-73), so nothing was scheduled — and Home answered with "All quiet ·
 * Nothing scheduled yet" above a nag to finish her profile. Nothing on the
 * screen was false and nothing was any use.
 *
 * These pin the three-way split and the precedence, because the failure mode is
 * subtle: every branch reads as reasonable on its own, and the bug is which one
 * wins.
 */
import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const home = readFileSync(resolve(__dirname, "./Home.tsx"), "utf8")
const dash = readFileSync(resolve(__dirname, "../lib/dashboard.ts"), "utf8")

/** The state machine, mirrored from Home.tsx so the cases are readable here. */
function state(totalItems: number, scheduledTaskCount: number) {
  const isNewUser = totalItems === 0
  const hasItemsNoUpkeep = !isNewUser && scheduledTaskCount === 0
  if (isNewUser) return "empty-hero"
  if (hasItemsNoUpkeep) return "no-upkeep-hero"
  return "agenda"
}

describe("which Home a user gets", () => {
  it("a brand-new account is offered the setup hero", () => {
    expect(state(0, 0)).toBe("empty-hero")
  })

  it("items with no upkeep get the add-a-manual hero — the reported case", () => {
    expect(state(1, 0)).toBe("no-upkeep-hero")
  })

  it("a working home gets its agenda", () => {
    expect(state(3, 7)).toBe("agenda")
  })

  it("upkeep that is merely NOT DUE still counts as a working home", () => {
    // The trap: dueSoonCount and overdueTaskCount are both zero for a home whose
    // only tasks are months out. Gating on either would show "no upkeep yet" to
    // someone with a full schedule.
    expect(state(3, 5)).toBe("agenda")
  })
})

describe("the count that drives it", () => {
  it("is taken before the cleaning filter and before any date test", () => {
    // An item whose only upkeep is cleaning still has upkeep; saying otherwise
    // would repeat HH-82's lie on a different screen.
    const i = dash.indexOf("scheduledTaskCount++")
    const c = dash.indexOf('r.careType === "cleaning"')
    expect(i).toBeGreaterThan(-1)
    expect(i).toBeLessThan(c)
  })
})

describe("precedence", () => {
  it("the profile nag yields to the upkeep prompt", () => {
    // Both ask for the user's next action. Four profile questions produce no
    // tasks; a manual does.
    expect(home).toContain("{!isNewUser && !hasItemsNoUpkeep && profileIncomplete && homeId && (")
  })

  it("does not tell them to add an item they have already added", () => {
    expect(home).toContain("No upkeep yet — add a manual")
  })
})

describe("HH-92 / HH-95 — the young home's screen stops stacking disappointments", () => {
  it("the feed horizon clears a calendar month", () => {
    // commitDraft seeds first-due one CALENDAR month out; 30 days missed a
    // monthly task by one day in every 31-day month, and Home denied the
    // schedule until tomorrow. 45 clears any month plus the window's edge.
    expect(dash).toContain("addDays(todayStr, 45)")
    expect(dash).not.toContain("addDays(todayStr, 30)")
  })

  it("stats carry the soonest future task with its window-open date", () => {
    expect(dash).toContain("nextUp = { dueDate: d, windowStart: w.start }")
  })

  it("the briefing waits for a month of history or a real completion", () => {
    expect(home).toContain("ageDays >= 21 || (stats?.completedThisMonth ?? 0) > 0")
  })

  it("the all-quiet card never asserts an empty schedule over a full one", () => {
    const composed = readFileSync(resolve(__dirname, "../components/home/HomeComposed.tsx"), "utf8")
    expect(composed).toContain("the next window opens")
    expect(composed).toContain("briefingReady && (")
  })
})
