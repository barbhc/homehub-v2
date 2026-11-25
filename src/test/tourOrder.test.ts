/**
 * The tour's shape: what order it visits, and where it leaves you.
 *
 * Both are owner decisions (2026-08-27) that read as arbitrary from inside the
 * code, which is exactly why they need pinning — a later edit that "tidies" the
 * array or simplifies the destroy handler would undo them silently, and the
 * only symptom would be a new user landing on Settings.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { tourSteps } from "@/lib/tourSteps"

// Repo-root relative, like the other static guards in this tree — __dirname is
// not defined under this tsconfig and tsc -b fails on it even though vitest,
// which transforms the file, runs it happily. The build is the gate.
const hook = readFileSync("src/hooks/useFeatureTour.ts", "utf8")

describe("tour order", () => {
  it("visits each destination exactly once — no nav button gets two bubbles", () => {
    const routes = tourSteps.map((s) => s.route)
    expect(new Set(routes).size).toBe(routes.length)
  })

  it("visits Home, Tasks, Items, Ask, Settings — the payoff before the chore", () => {
    expect(tourSteps.map((s) => s.route)).toEqual([
      "/home",        // welcome + how we'll reach you, merged
      "/maintenance", // Tasks — what your house needs
      "/inventory",   // Items — how to get more of it
      "/chat",
      "/settings",
    ])
  })

  it("never names the product in a title, so a rename does not reach onboarding", () => {
    for (const step of tourSteps) {
      expect(step.popover?.title ?? "").not.toMatch(/homehub/i)
    }
  })

  it("says what Home holds, in the owner's 2026-11-24 words", () => {
    // This step used to carry the HH-144 notifications sentence ("It appears
    // here on its own; notifications on your phone are separate, and yours to
    // allow"). The owner replaced it on 2026-11-24 (before-friends mock 3), so
    // the absence is pinned too: a revert would bring the old sentence back.
    const home = `${tourSteps[0].popover?.description}`
    expect(home).toBe(
      "Home is what your house needs from you: what's due now, what's coming up, and a place to ask questions.",
    )
    expect(home).not.toMatch(/notifications on your phone|yours to allow/i)
  })

  it("promises no day-specific deadline", () => {
    // A house does not issue due dates; the calm register is what lets a
    // genuinely time-critical thing sound different when it appears.
    const all = tourSteps.map((s) => `${s.popover?.title} ${s.popover?.description}`).join(" ")
    expect(all).not.toMatch(/\bdue (today|this week|on)\b/i)
    expect(all).not.toMatch(/the day it's due/i)
  })
})

describe("where the tour leaves you", () => {
  it("finishing drops you into the add-item flow", () => {
    expect(hook).toContain('navigate("/inventory/add")')
  })

  it("but only on the last step — dismissing early must not hijack the user", () => {
    // If this guard is ever dropped, tapping X anywhere in the tour would fling
    // the user into a wizard they were actively trying to escape.
    expect(hook).toContain("const finished = idx === steps.length - 1")
    expect(hook).toContain("if (finished) navigate")
  })
})
