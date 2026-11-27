/**
 * The before-friends words (mock 3, owner-approved 2026-11-24).
 *
 * Reads the shipped sources as text so a revert of any one sentence fails here,
 * and pins the replaced sentences ABSENT: a renamed string that only had a
 * presence check would let the old one come back unnoticed.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, statSync } from "node:fs"

// Repo-root relative, like the other static guards (tsc -b rejects __dirname here).
const landing = readFileSync("src/pages/Landing.tsx", "utf8")
const tour = readFileSync("src/lib/tourSteps.ts", "utf8")
const beta = readFileSync("public/beta.html", "utf8")
const ask = readFileSync("src/pages/ChatPage.tsx", "utf8")

// tourSteps.ts splits long strings over lines with `" +\n "`; join them back.
const joined = (src: string) => src.replace(/"\s*\+\s*\n\s*"/g, "")

// Seventeen fixes (mock m6, owner-approved 2026-11-25) replaced the hero's line
// and the Ask title: the first thing a new person does is type a zip.
const LANDING_NEW = [
  "Tell us your zip and the kind of home you have. Homehub gives you the few tasks that matter this month and reminds you when they&rsquo;re due.",
  "Answers about your home",
  "Model, purchase date, warranty and manual for every appliance, kept in one place.",
  "Common upkeep for what most homes have, plus the exact schedule from your manual when you add one. Proactive reminders so nothing slips.",
  "Ask about anything you own. With its manual you get a clear, sourced answer; without one, general guidance.",
  "Set up in a minute",
  "Your zip code and type of home are all it takes to get started.",
  "We build the care plan",
  "Tailored to your home, your climate and what you own.",
]
const LANDING_OLD = [
  "Items, manuals, warranties, maintenance and a built-in assistant, organized to effortlessly care for your home.",
  "Answers from your manuals",
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
  "<h3>Answers from your manuals</h3>",
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
  it("/beta's Ask headline matches the welcome page (seventeen fixes, m6)", () => {
    expect(beta).toContain("<h3>Answers about your home</h3>")
  })

  it("no new sentence carries an em dash", () => {
    for (const s of [...LANDING_NEW, ...TOUR_NEW, ...BETA_NEW]) expect(s).not.toContain("—")
  })
})

describe("/beta leads with what matters most (owner, 2026-11-27)", () => {
  // "Make sure the most compelling benefits are listed first, such as
  // Maintenance over Inventory", and the words that read as written by AI go.
  const at = (text: string) => {
    const i = beta.indexOf(text)
    expect(i, `/beta should say ${text}`).toBeGreaterThan(-1)
    return i
  }
  it("features run Maintenance, Ask, Warranties, then Inventory", () => {
    const order = [
      "<h3>A schedule that builds itself</h3>",
      "<h3>Answers about your home</h3>",
      "<h3>Know what&rsquo;s still under warranty</h3>",
      "<h3>Every appliance, organized</h3>",
    ].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
  it("the headline says the benefit, and the zip-first line follows it", () => {
    at("<h1>See what your home needs this month.</h1>")
    at("Enter your zip and the kind of home you have. Homehub gives you the few tasks that matter this month and reminds you when they&rsquo;re due.")
  })
  it.each([
    "Everything your home needs, in one place.",
    "organized to effortlessly care for your home",
    "Built around your home",
    "Coverage you won&rsquo;t forget",
    "Coverage you won't forget",
    "all in one tidy list",
    "in seconds",
    "not generic advice",
    "so safety comes before polish",
    "Up and running in minutes",
    'class="kicker"',
  ])("/beta no longer says %s", (s) => {
    expect(beta).not.toContain(s)
  })
  it("carries no em dash in its words", () => {
    expect(beta.split("<body>")[1]).not.toContain("—")
  })
})

describe("the welcome page's phone (seventeen fixes, mock m6)", () => {
  it.each(["public/landing/first-list-light.webp", "public/landing/first-list-dark.webp"])("%s ships, small enough for a hero", (file) => {
    expect(existsSync(file)).toBe(true)
    expect(statSync(file).size).toBeLessThan(150_000)
    expect(landing).toContain(file.replace(/^public/, ""))
  })
})

describe("the Ask tab's line (gallery 2026-11-26)", () => {
  // The welcome page and /beta moved to "Answers about your home" in #309/#311;
  // the Ask tab itself still led with manuals.
  it("leads with your home, as the welcome page does", () => {
    expect(ask).toContain("Answers about your home, from your manuals when you have them.")
  })
  it("no longer leads with manuals", () => {
    expect(ask).not.toContain("Answers from your manuals")
  })
})
