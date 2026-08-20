/**
 * Chris's first session (TestFlight, iPhone 17, 2026-08-20). Three reports,
 * three different failures — all pinned here.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { isAgendaEligible } from "../../shared/tasks/agendaEligibility"

const read = (p: string) =>
  readFileSync(resolve(__dirname, p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

describe("empty Tasks must not contradict the item page", () => {
  it("confirms the exclusion that produced the contradiction", () => {
    // Chris's whole home: one air fryer, three scheduled tasks, all of them
    // item-scoped cleaning — so the agenda is legitimately empty.
    const his = [
      { title: "Wipe Main Unit and Control Panel", careType: "cleaning", scopeType: "item_unit" },
      { title: "Clean Baskets and Crisper Plates", careType: "cleaning", scopeType: "item_unit" },
      { title: "Inspect and Clear Air Vents", careType: "cleaning", scopeType: "item_unit" },
    ]
    expect(his.filter(isAgendaEligible)).toEqual([])
  })

  it("home-scoped cleaning and item maintenance still reach the agenda", () => {
    expect(isAgendaEligible({ careType: "cleaning", scopeType: "home" })).toBe(true)
    expect(isAgendaEligible({ careType: "maintenance", scopeType: "item_unit" })).toBe(true)
  })

  it("the empty state explains where the work went", () => {
    const src = read("../components/home/RefinedWeek.tsx")
    expect(src).toContain("hiddenCleaning")
    expect(src).toContain("live in your guides")
    // Only counted when the agenda is actually empty — no cost on the common path.
    expect(src).toContain("countHiddenCleaning")
  })
})

describe("screens outside AppLayout clear the Dynamic Island", () => {
  // AppLayout supplies pt-safe-top; these three render outside it, so Chris's
  // "Add your first items" heading sat under the island on an iPhone 17.
  for (const page of ["OnboardingInventory", "OnboardingProfile", "SampleHome"]) {
    it(`${page} carries the top inset`, () => {
      expect(read(`../pages/${page}.tsx`)).toContain("pt-safe-top")
    })
  }
})

describe("What's New only speaks to people who were there", () => {
  it("skips an entry that predates the account", () => {
    const src = read("../components/dashboard/WhatsNewBanner.tsx")
    expect(src).toContain("accountPredatesEntry")
    expect(src).toContain("creationTime")
  })
})
