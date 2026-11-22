/** Home's sections below Next up (design/home-next.md, owner-approved 2026-11-21). */
import { describe, expect, it } from "vitest"
import type { CareNote, ServiceProvider } from "@/integrations/types"
import type { MaintenanceTaskFull } from "@/lib/dashboard"
import { comingUpRows, headsUpRows, pinchSpots, pinnedNotes, prosSummary } from "./homeSections"

const note = (over: Partial<CareNote>): CareNote => ({
  note_id: "n", home_id: "h", room_id: null, item_unit_id: null, scope: "home", category: null, chunk_type: "care",
  title: null, content: "", source: "user", source_url: null, task_template_id: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z", deleted_at: null, pinned_at: null, ...over,
})
const provider = (name: string, category: string): ServiceProvider => ({
  provider_id: name, home_id: "h", name, category, phone: null, email: null, website: null, notes: null,
  created_at: "", updated_at: "", deleted_at: null,
})
const task = (id: string, due: string, over: Partial<MaintenanceTaskFull> = {}): MaintenanceTaskFull => ({
  id, title: `Task ${id}`, description: null, task_template_id: null, notes: null, next_due_date: due,
  is_recurring: true, frequency_value: null, frequency_unit: null, item_id: null, itemName: null,
  locationId: null, locationName: null, priority: "high", effort: null, isOverdue: false, isDueSoon: false,
  lastCompletedAt: null, completionCount: 0, careType: "maintenance", duePhrase: null, safetyNote: null, ...over,
} as MaintenanceTaskFull)

describe("In a pinch", () => {
  it("fills each shutoff from the house note whose heading names it, and leaves the rest empty", () => {
    const rows = pinchSpots([note({ content: "Water shutoff: Garage, left of the water heater" })])
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Water shutoff", "Garage, left of the water heater"],
      ["Gas shutoff", null],
      ["Breaker panel", null],
    ])
  })

  it("matches the ways people name them, so a noted shutoff never says Add", () => {
    const rows = pinchSpots([
      note({ note_id: "a", content: "Main water valve: Basement, by the meter" }),
      note({ note_id: "b", content: "Gas shut-off: Left side of the house" }),
      note({ note_id: "c", content: "Electrical panel: Garage" }),
      note({ note_id: "d", content: "Water filter: change yearly" }),
    ])
    expect(rows.map((r) => r.value)).toEqual(["Basement, by the meter", "Left side of the house", "Garage"])
  })

  it("reads house notes only — a room's 'Breaker panel' note is not the house's", () => {
    const rows = pinchSpots([note({ scope: "room", room_id: "r1", content: "Breaker panel: Kitchen wall" })])
    expect(rows.find((r) => r.key === "power")!.value).toBeNull()
  })

  it("two notes with the same heading: the most recently updated wins", () => {
    const rows = pinchSpots([
      note({ note_id: "old", content: "Water shutoff: Basement", updated_at: "2026-01-01T00:00:00Z" }),
      note({ note_id: "new", content: "Water shutoff: Garage", updated_at: "2026-11-01T00:00:00Z" }),
    ])
    expect(rows[0].value).toBe("Garage")
  })

  it("a deleted note doesn't count", () => {
    expect(pinchSpots([note({ content: "Gas shutoff: By the meter", deleted_at: "2026-11-02T00:00:00Z" })])[1].value).toBeNull()
  })

  it("names the saved pros for water, power and heat, whatever the category was called", () => {
    const s = prosSummary([provider("Pro Plumb", "plumbing"), provider("Bright Spark", "electrician"), provider("Ace Heating", "hvac"), provider("Sears", "appliance")])
    expect(s).toEqual({ names: ["Pro Plumb", "Bright Spark", "Ace Heating"], missing: [] })
    expect(prosSummary([provider("Pro Plumb", "plumber")]).missing).toEqual(["electrician", "heating"])
  })
})

describe("Heads up", () => {
  it("a recall, a manual ready to review, then a warranty ending within 60 days", () => {
    const rows = headsUpRows({
      recalls: [{ item_unit_id: "i1", display_name: "GE Range", recall_notes: "Knob may turn on burner" }],
      ready: [{ manualId: "m1", itemUnitId: "i2", title: "Sharp Microwave manual" }],
      warranties: [{ item_unit_id: "i3", display_name: "Washer", warranty_expiry_date: "2026-12-05", days_remaining: 14 }],
    })
    expect(rows.map((r) => r.kind)).toEqual(["recall", "review", "warranty"])
    expect(rows[2].title).toBe("Washer warranty ends Dec 5")
    expect(rows[2].sub).toBe("In 14 days")
  })

  it("a warranty already ended, or months away, is not news", () => {
    expect(headsUpRows({ recalls: [], ready: [], warranties: [
      { item_unit_id: "i", display_name: "Fridge", warranty_expiry_date: "2026-04-14", days_remaining: -220 },
      { item_unit_id: "j", display_name: "Dishwasher", warranty_expiry_date: "2027-05-19", days_remaining: 180 },
    ] })).toEqual([])
  })
})

describe("Coming up", () => {
  const today = "2026-06-23"
  it("up to three tasks after this week, soonest first", () => {
    const rows = comingUpRows([task("a", "2026-08-01"), task("b", "2026-06-25"), task("c", "2026-07-15"), task("d", "2026-07-02"), task("e", "2026-09-01")], today)
    expect(rows.map((r) => r.id)).toEqual(["d", "c", "a"])
  })

  it("never repeats a task that is already in this week (Next up), even as a later round", () => {
    const rows = comingUpRows([task("next-round", "2026-07-20", { title: "Replace filter", itemName: "Furnace" }), task("other", "2026-07-25")], today, 3, null,
      [{ id: "now", title: "Replace filter", itemName: "Furnace" }])
    expect(rows.map((r) => r.id)).toEqual(["other"])
  })

  it("a new home with nothing on the calendar yet shows each task's next round, month only", () => {
    const rows = comingUpRows([], today, 3, { date: "2026-12-01", titles: ["Test smoke and CO alarms"], again: true })
    expect(rows).toEqual([{ id: "forecast:Test smoke and CO alarms", title: "Test smoke and CO alarms", item: "Its next round", month: "DEC", day: null, href: "/maintenance", when: "In December" }])
  })

  it("a window shows its month only; a real deadline shows the day too", () => {
    const rows = comingUpRows([task("w", "2026-07-15"), task("d", "2026-07-20", { dueKind: "deadline" })], today)
    expect(rows.map((r) => [r.month, r.day, r.when])).toEqual([["JUL", null, "In July"], ["JUL", "20", "By July 20"]])
  })
})

describe("Pinned by you", () => {
  it("only pinned, live notes, most recently pinned first", () => {
    const rows = pinnedNotes([
      note({ note_id: "a", pinned_at: "2026-11-01T00:00:00Z" }),
      note({ note_id: "b" }),
      note({ note_id: "c", pinned_at: "2026-11-05T00:00:00Z" }),
      note({ note_id: "d", pinned_at: "2026-11-06T00:00:00Z", deleted_at: "2026-11-07T00:00:00Z" }),
    ])
    expect(rows.map((n) => n.note_id)).toEqual(["c", "a"])
  })
})
