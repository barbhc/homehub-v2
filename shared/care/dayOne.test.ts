import { describe, expect, it } from "vitest"
import { APPLIANCES, applianceCare, appliancesToOffer, askStarters, nextQuestion } from "./dayOne"

const by = (label: string) => APPLIANCES.find((a) => a.label === label)!
const keys = (rows: { entry: { key: string } }[]) => rows.map((r) => r.entry.key)

describe("appliances to offer", () => {
  it("offers every chip to an empty home, with three behind More", () => {
    const all = appliancesToOffer([])
    expect(all.filter((a) => !a.more).map((a) => a.label)).toEqual(["Furnace", "Central air", "Water heater", "Dishwasher", "Washer", "Dryer", "Fridge", "Range hood"])
    expect(all.filter((a) => a.more)).toHaveLength(3)
  })

  it("drops a kind the home already has, however the item is named", () => {
    const left = appliancesToOffer([{ display_name: "Bosch 800 Series Dishwasher", category: "dishwasher" }])
    expect(left.map((a) => a.label)).not.toContain("Dishwasher")
  })

  it("only offers kinds the library has care for", () => {
    for (const a of APPLIANCES) expect(applianceCare(a, { existingTitles: [], area: ["earthquake"] }).length, a.label).toBeGreaterThan(0)
  })
})

describe("an appliance's typical care", () => {
  it("a furnace: the filter, pre-checked; the service by a pro, not", () => {
    const rows = applianceCare(by("Furnace"), { existingTitles: [] })
    expect(keys(rows)).toEqual(["furnace.filter", "home.hvac_service"])
    expect(rows.map((r) => r.checked)).toEqual([true, false])
  })

  it("never doubles a task the home already has (the onboarding air filter)", () => {
    const rows = applianceCare(by("Furnace"), { existingTitles: ["Replace the air filter"] })
    expect(keys(rows)).toEqual(["home.hvac_service"])
  })

  it("skips what was dismissed", () => {
    expect(keys(applianceCare(by("Dryer"), { existingTitles: [], dismissed: ["dryer.duct"] }))).toEqual(["dryer.lint"])
  })

  it("a water heater's quake-strap check only where earthquakes are a risk", () => {
    expect(keys(applianceCare(by("Water heater"), { existingTitles: [] }))).toEqual(["home.water_heater"])
    expect(keys(applianceCare(by("Water heater"), { existingTitles: [], area: ["earthquake"] }))).toEqual(["home.water_heater", "home.quake_straps"])
  })
})

describe("the next question", () => {
  it("asks the first unanswered fact, and says what Yes adds", () => {
    const q = nextQuestion({}, { existingTitles: [] })!
    expect(q.text).toBe("Do you have a furnace or central air?")
    expect(q.hint).toBe("Yes adds a filter change every 1–3 months. You choose before anything is added.")
  })

  it("skips a question whose tasks the home already has", () => {
    const q = nextQuestion({}, { existingTitles: ["Replace the air filter"] })!
    expect(q.fact).toBe("has_water_heater")
  })

  it("never asks an answered fact, whichever way it was answered", () => {
    expect(nextQuestion({ has_air_filter: false, has_water_heater: true }, { existingTitles: [] })!.fact).toBe("has_smoke_alarms")
  })

  it("does not ask what a task already answers: an alarm test means there are alarms", () => {
    const q = nextQuestion({ has_air_filter: false, has_water_heater: false }, { existingTitles: ["Test smoke and CO alarms"] })!
    expect(q.fact).toBe("has_extinguisher")
  })

  it("offers only what is missing when a dismissal, not a task, removed one", () => {
    const q = nextQuestion({ has_air_filter: false, has_water_heater: false }, { existingTitles: [], dismissed: ["home.alarm_test"] })!
    expect(q.entries.map((e) => e.key)).toEqual(["home.alarm_batteries"])
    expect(q.hint).toBe("Yes adds a yearly battery change. You choose before anything is added.")
  })

  it("does not ask about gutters when the building handles the outside", () => {
    const facts = { has_air_filter: false, has_water_heater: false, has_smoke_alarms: false, has_extinguisher: false, building_handles_exterior: true }
    expect(nextQuestion(facts, { existingTitles: [] })).toBeNull()
  })

  it("honours Not sure on this device", () => {
    expect(nextQuestion({}, { existingTitles: [], skipped: ["has_air_filter"] })!.fact).toBe("has_water_heater")
  })
})

describe("askStarters", () => {
  it("a Dallas November: the freeze first, then the filter", () => {
    expect(askStarters({ month: 11, freezeRisk: true, hazards: [] }).map((s) => s.label)).toEqual(["Before the first freeze?", "Air filter: how often?"])
  })
  it("San Francisco: no freeze talk; the quake comes first", () => {
    expect(askStarters({ month: 11, freezeRisk: false, hazards: ["earthquake"] }).map((s) => s.label)).toEqual(["Earthquake-ready?", "Air filter: how often?"])
  })
  it("Miami in May: hurricane prep", () => {
    expect(askStarters({ month: 5, freezeRisk: false, hazards: ["hurricane"] })[0].question).toBe("When should I start preparing for hurricane season?")
  })
  it("every starter is a question the eval scores", async () => {
    // Imported as data (no node:fs in shared code's test environment).
    const goldens = (await import("../../evals/ask-general/goldens.json")).default as { cases: { question: string }[] }
    const asked = new Set(goldens.cases.map((c) => c.question))
    for (const s of [
      ...askStarters({ month: 11, freezeRisk: true, hazards: ["earthquake", "wildfire"] }),
      ...askStarters({ month: 6, freezeRisk: false, hazards: ["hurricane"] }),
      ...askStarters({ month: 6, freezeRisk: false, hazards: [] }),
    ]) expect(asked.has(s.question), s.question).toBe(true)
  })
})
