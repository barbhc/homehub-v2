/**
 * The before-friends words (mock 3, owner-approved 2026-11-24).
 *
 * Reads the shipped sources as text so a revert of any one sentence fails here,
 * and pins the replaced sentences ABSENT: a renamed string that only had a
 * presence check would let the old one come back unnoticed.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"

// Repo-root relative, like the other static guards (tsc -b rejects __dirname here).
const landing = readFileSync("src/pages/Landing.tsx", "utf8")
const tour = readFileSync("src/lib/tourSteps.ts", "utf8")
const beta = readFileSync("public/beta.html", "utf8")

// tourSteps.ts splits long strings over lines with `" +\n "`; join them back.
const joined = (src: string) => src.replace(/"\s*\+\s*\n\s*"/g, "")

const LANDING_NEW = [
  "Items, manuals, warranties, maintenance and a built-in assistant, organized to effortlessly care for your home.",
  "Model, purchase date, warranty and manual for every appliance, kept in one place.",
  "Common upkeep for what most homes have, plus the exact schedule from your manual when you add one. Proactive reminders so nothing slips.",
  "Ask about anything you own. With its manual you get a clear, sourced answer; without one, general guidance.",
  "Set up in a minute",
  "Your zip code and type of home are all it takes to get started.",
  "We build the care plan",
  "Tailored to your home, your climate and what you own.",
]
const LANDING_OLD = [
  "Items, manuals, warranties, maintenance and a built-in assistant — organized to effortlessly care for your home.",
  "Scan a label or snap a photo. Homehub identifies the model and files it by room.",
  "From your real manuals, not generic advice — with calm reminders so nothing slips.",
  "Ask a question to any item's manual and get a clear, sourced answer in seconds.",
  "Add your home's items",
  "Photo, scan, or search — a few taps each.",
  "Tailored to your manuals and your home.",
]

const TOUR_NEW = [
  "Home is what your house needs from you: what's due now, what's coming up, and a place to ask questions.",
  "Add what you own. Common things get their typical care; add a manual and we'll read it for the exact upkeep, the cleaning and the how-tos.",
  "Why it's beeping, which filter it takes, how to reset it after a power cut. Ask about anything you own; once you've added its manual, the answer comes straight out of it.",
]
const TOUR_OLD = [
  "most important first",
  "notifications on your phone are separate, and yours to allow.",
  "Add anything you own that came with a manual.",
  "ask anything about anything you own, and the answer comes straight out of that item's own manual.",
]

const BETA_NEW = [
  "Model, purchase date, warranty and manual for every appliance, kept in one place.",
  "with proactive reminders so nothing slips.",
]
const BETA_OLD = [
  "Scan a label or type the brand and model. Homehub files each item by room, with its manual, warranty and notes in one place.",
  "<strong>By room,</strong>",
  "with calm reminders so nothing slips.",
]

describe("before-friends copy (mock 3)", () => {
  it.each(LANDING_NEW)("the welcome page says %s", (s) => {
    expect(landing).toContain(s)
  })
  it.each(LANDING_OLD)("the welcome page no longer says %s", (s) => {
    expect(landing).not.toContain(s)
  })

  it.each(TOUR_NEW)("the tour says %s", (s) => {
    expect(joined(tour)).toContain(s)
  })
  it.each(TOUR_OLD)("the tour no longer says %s", (s) => {
    expect(joined(tour)).not.toContain(s)
  })

  it.each(BETA_NEW)("/beta says %s", (s) => {
    expect(beta).toContain(s)
  })
  it.each(BETA_OLD)("/beta no longer says %s", (s) => {
    expect(beta).not.toContain(s)
  })

  it("no new sentence carries an em dash", () => {
    for (const s of [...LANDING_NEW, ...TOUR_NEW, ...BETA_NEW]) expect(s).not.toContain("—")
  })
})
