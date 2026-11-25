import { describe, expect, it } from "vitest"
import { APPLIANCES, applianceCare, appliancesToOffer, askStarters, askStartersForHome, careForPicks, exactModelsTarget, HOME_PICK_GROUPS, KIND_SUBTYPE, nextQuestion, type HomePick } from "./dayOne"

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

  it("does not ask what a task already answers: an alarm test means there are smoke alarms", () => {
    const facts = { has_air_filter: false, has_water_heater: false }
    // A stored "Test smoke and CO alarms" (the library's title before
    // before-friends B1) answers the smoke question — but not the carbon
    // monoxide (CO) one: the CO check is a different archetype.
    expect(nextQuestion(facts, { existingTitles: ["Test smoke and CO alarms"] })!.fact).toBe("has_co_alarms")
    expect(nextQuestion({ ...facts, has_co_alarms: false }, { existingTitles: ["Test smoke and CO alarms"] })!.fact).toBe("has_extinguisher")
  })

  it("asks the carbon monoxide (CO) question once smoke is answered and CO is not (existing homes)", () => {
    const q = nextQuestion({ has_air_filter: false, has_water_heater: false, has_smoke_alarms: true }, { existingTitles: [] })!
    expect(q.fact).toBe("has_co_alarms")
    expect(q.text).toBe("Do you have carbon monoxide (CO) alarms?")
    expect(q.entries.map((e) => e.key)).toEqual(["home.co_alarm_check"])
    expect(q.hint).toBe("Yes adds a yearly check of its replace-by date. You choose before anything is added.")
  })

  it("the smoke question is about smoke alarms alone", () => {
    const q = nextQuestion({ has_air_filter: false, has_water_heater: false }, { existingTitles: [] })!
    expect(q.text).toBe("Do you have smoke alarms?")
    expect(q.entries.map((e) => e.key)).toEqual(["home.alarm_test", "home.alarm_batteries"])
  })

  it("offers only what is missing when a dismissal, not a task, removed one", () => {
    const q = nextQuestion({ has_air_filter: false, has_water_heater: false }, { existingTitles: [], dismissed: ["home.alarm_test"] })!
    expect(q.entries.map((e) => e.key)).toEqual(["home.alarm_batteries"])
    expect(q.hint).toBe("Yes adds a yearly battery change. You choose before anything is added.")
  })

  it("does not ask about gutters when the building handles the outside", () => {
    const facts = { has_air_filter: false, has_water_heater: false, has_smoke_alarms: false, has_co_alarms: false, has_extinguisher: false, building_handles_exterior: true }
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

describe("askStartersForHome", () => {
  it("reads the month from today and the facts from the profile", () => {
    expect(askStartersForHome({ freeze_risk: false, area: { hazards: ["earthquake"] } }, "2026-11-21"))
      .toEqual(askStarters({ month: 11, freezeRisk: false, hazards: ["earthquake"] }))
  })
  it("no profile: the defaults, never an appliance", () => {
    const labels = askStartersForHome(null, "2026-06-01").map((s) => s.label)
    expect(labels).toEqual(["Air filter: how often?", "This month's upkeep?"])
  })
})

// ── before-friends B2: the empty-Home card's picks ─────────────────────────────

const pick = (id: string) => HOME_PICK_GROUPS.flatMap((g) => g.picks).find((p) => p.id === id)!
const rowKeys = (picks: HomePick[], ctx: Parameters<typeof careForPicks>[1] = { existingTitles: [] }) => careForPicks(picks, ctx).map((r) => r.entry.key)

describe("HOME_PICK_GROUPS", () => {
  it("three groups in the mock's order, smoke and carbon monoxide (CO) separate", () => {
    expect(HOME_PICK_GROUPS.map((g) => g.title)).toEqual(["Safety", "Heating and water", "Appliances"])
    expect(HOME_PICK_GROUPS.map((g) => g.picks.map((p) => p.label))).toEqual([
      ["Smoke alarms", "Carbon monoxide (CO) alarms", "Fire extinguisher"],
      ["Furnace", "Central air", "Water heater"],
      ["Dishwasher", "Washer", "Dryer", "Fridge", "Range hood", "Air purifier", "Coffee machine", "Food recycler"],
    ])
  })

  it("only Range hood and the three small appliances sit behind More…", () => {
    const more = HOME_PICK_GROUPS.flatMap((g) => g.picks).filter((p) => p.type === "appliance" && p.more).map((p) => p.label)
    expect(more).toEqual(["Range hood", "Air purifier", "Coffee machine", "Food recycler"])
  })

  it("fact chips save their own fact; D3: Smoke alarms offers the alarm test only", () => {
    expect(pick("smoke")).toMatchObject({ type: "fact", fact: "has_smoke_alarms", entries: ["home.alarm_test"] })
    expect(pick("co")).toMatchObject({ type: "fact", fact: "has_co_alarms", entries: ["home.co_alarm_check"] })
    expect(pick("extinguisher")).toMatchObject({ type: "fact", fact: "has_extinguisher", entries: ["home.extinguisher"] })
  })

  it("appliance chips are APPLIANCES' own entries (one list of appliances, not two)", () => {
    for (const p of HOME_PICK_GROUPS.flatMap((g) => g.picks)) {
      if (p.type === "appliance") expect(APPLIANCES).toContain(p.appliance)
    }
  })
})

describe("careForPicks", () => {
  it("smoke + carbon monoxide (CO) + water heater + dishwasher: the mock's four rows, in group order", () => {
    // Ticked in a different order from the groups': the rows still follow the groups.
    const rows = careForPicks([pick("dishwasher"), pick("water_heater"), pick("co"), pick("smoke")], { existingTitles: [] })
    expect(rows.map((r) => r.entry.title)).toEqual([
      "Test the smoke alarms",
      "Check the carbon monoxide (CO) alarm's date",
      "Flush the water heater",
      "Clean the dishwasher filter",
    ])
    expect(rows.map((r) => r.pickId)).toEqual(["smoke", "co", "water_heater", "dishwasher"])
  })

  it("in an earthquake area the water heater adds its quake-strap check", () => {
    expect(rowKeys([pick("smoke"), pick("co"), pick("water_heater"), pick("dishwasher")], { existingTitles: [], area: ["earthquake"] }))
      .toEqual(["home.alarm_test", "home.co_alarm_check", "home.water_heater", "home.quake_straps", "dishwasher.filter"])
  })

  it("Furnace plus Central air gives ONE air-filter row and one service", () => {
    const rows = careForPicks([pick("furnace"), pick("hvac")], { existingTitles: [] })
    expect(rows.filter((r) => r.entry.archetype === "filter.replace.air")).toHaveLength(1)
    expect(rows.map((r) => r.entry.key)).toEqual(["furnace.filter", "home.hvac_service"])
  })

  it("skips a dismissed key and a covered archetype", () => {
    expect(rowKeys([pick("dryer")], { existingTitles: [], dismissed: ["dryer.duct"] })).toEqual(["dryer.lint"])
    expect(rowKeys([pick("smoke"), pick("furnace")], { existingTitles: ["Test smoke and CO alarms", "Replace the air filter"] })).toEqual(["home.hvac_service"])
  })

  it("nothing ticked, nothing offered", () => {
    expect(careForPicks([], { existingTitles: [] })).toEqual([])
  })
})

describe("Add My Exact Models — where it goes", () => {
  it("nothing made: the appliance lane, with the kind only for exactly one appliance that has a chip", () => {
    expect(exactModelsTarget([], [])).toBe("/inventory/add?lane=appliance")
    expect(exactModelsTarget([], ["dishwasher"])).toBe("/inventory/add?lane=appliance&kind=dishwasher")
    expect(exactModelsTarget([], ["washer"])).toBe("/inventory/add?lane=appliance&kind=washing-machine")
    expect(exactModelsTarget([], ["dishwasher", "dryer"])).toBe("/inventory/add?lane=appliance")
    expect(exactModelsTarget([], ["hvac"])).toBe("/inventory/add?lane=appliance")
    expect(exactModelsTarget([], ["range_hood"])).toBe("/inventory/add?lane=appliance")
  })

  it("an item made in this visit: its page; several: Items", () => {
    expect(exactModelsTarget(["item-1"], ["dishwasher"])).toBe("/items/item-1")
    expect(exactModelsTarget(["item-1", "item-2"], [])).toBe("/inventory")
  })

  it("every kind it sends is one of the add screen's chips", async () => {
    const { KIND_CHIPS } = await import("../../src/components/smart-add/identifyData")
    const chips = new Set(KIND_CHIPS.map((k) => k.subType))
    for (const sub of Object.values(KIND_SUBTYPE)) expect(chips.has(sub!), sub).toBe(true)
    expect(KIND_SUBTYPE).toEqual({
      dishwasher: "dishwasher", washer: "washing-machine", dryer: "dryer",
      refrigerator: "refrigerator", water_heater: "water-heater", furnace: "hvac-furnace",
    })
  })
})
