/**
 * placeAll — the Tasks page's Suggested group is one pure placement over the
 * home's items, templates, facts and dismissals. The manual wins; dismissed
 * rows stay gone; home-level care rides on the facts.
 */
import { describe, it, expect } from "vitest"
import { placeAll } from "./useCareSuggestions"
import { kindOf } from "../../shared/care/library"
import type { ItemUnit, TaskTemplate } from "@/integrations/types"

const levoit = { item_unit_id: "i1", display_name: "Levoit Core 400S Air Purifier", category: "Air purifier" } as unknown as ItemUnit
const blender = { item_unit_id: "i2", display_name: "Vitamix blender", category: "Small appliance" } as unknown as ItemUnit

const tpl = (over: Partial<TaskTemplate>): TaskTemplate =>
  ({ task_template_id: "t1", title: "x", scope_type: "item_unit", item_unit_id: "i1", is_active: true, deleted_at: null, external_key: null, ...over }) as unknown as TaskTemplate

describe("placeAll", () => {
  it("the purifier is a known kind; the blender is not", () => {
    expect(kindOf(levoit)).toBe("air_purifier")
    expect(kindOf(blender)).toBeNull()
  })

  it("offers every purifier entry the item lacks, labelled with the item's name", () => {
    const rows = placeAll([levoit, blender], [], {}, [])
    const forLevoit = rows.filter((r) => r.itemUnitId === "i1")
    expect(forLevoit.map((r) => r.entry.key).sort()).toEqual(["air_purifier.hepa", "air_purifier.prefilter", "air_purifier.sensor"])
    expect(forLevoit.every((r) => r.itemName === "Levoit Core 400S Air Purifier")).toBe(true)
    expect(rows.some((r) => r.itemUnitId === "i2")).toBe(false)
  })

  it("the manual wins: a parsed task covering the archetype removes the offer", () => {
    const rows = placeAll([levoit], [tpl({ title: "Replace the HEPA filter", schedule: { scheduleType: "semiannual", intervalDays: null } })], {}, [])
    expect(rows.map((r) => r.entry.key)).not.toContain("air_purifier.hepa")
    expect(rows.map((r) => r.entry.key)).toContain("air_purifier.prefilter")
  })

  it("home facts unlock whole-home care with no item behind it; dismissals remove it", () => {
    const withGutters = placeAll([], [], { has_gutters: true }, [])
    const gutters = withGutters.find((r) => r.entry.key === "home.gutters")
    expect(gutters).toBeTruthy()
    expect(gutters!.itemUnitId).toBeNull()
    expect(placeAll([], [], { has_gutters: true }, ["home.gutters"]).some((r) => r.entry.key === "home.gutters")).toBe(false)
  })

  it("the building handling pests suppresses every pest entry even when the risk facts are true", () => {
    const rows = placeAll([], [], { termite_risk: true, birds_roosting: true, building_handles_pests: true }, [])
    expect(rows.some((r) => r.entry.key.startsWith("home.termite") || r.entry.key.startsWith("home.birds"))).toBe(false)
  })
})
