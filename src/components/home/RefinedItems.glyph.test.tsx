/**
 * The Items list's thumbnail glyph — one of a fixed set, picked by keyword.
 *
 * Restructured for the whole-app lint (H5): the resolver used to hand back the
 * icon component itself, which react-hooks/static-components reads as a
 * component created during render. It now answers with a key into a
 * module-level table. Pinned: every keyword family still draws its own glyph,
 * the first family in the list still wins, and anything else is a package.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { RefinedItems } from "./RefinedItems"

const item = (id: string, display_name: string, category: string | null = null): ItemUnit =>
  ({
    item_unit_id: id, home_id: "h1", room_id: null, display_name, category, item_category: null,
    brand: null, model: null, status: "active", deleted_at: null, created_at: "2026-09-01T00:00:00Z",
  }) as ItemUnit

/** The lucide glyph drawn in the row that names this item. */
function glyphOf(name: string): string {
  const row = screen.getByText(name).closest("a") as HTMLElement
  const svg = row.querySelector("svg.lucide")
  const cls = [...(svg?.classList ?? [])].find((c) => c.startsWith("lucide-"))
  return cls ?? "none"
}

describe("RefinedItems · thumbnail glyph", () => {
  it("draws the glyph for each keyword family, and a package for the rest", () => {
    render(
      <MemoryRouter>
        <RefinedItems
          rooms={[]}
          items={[
            item("i1", "LG French Door Refrigerator"),
            item("i2", "Carrier Infinity", "HVAC"),
            item("i3", "Rheem Water Heater"),
            item("i4", "Samsung Dryer"),
            item("i5", "GE Profile Oven"),
            item("i6", "Shop Vac"),
            // Matches both the laundry and the kitchen families: the earlier
            // entry in the table wins, as it always has.
            item("i7", "Bosch Dishwasher"),
          ]}
        />
      </MemoryRouter>,
    )
    expect(glyphOf("LG French Door Refrigerator")).toBe("lucide-refrigerator")
    expect(glyphOf("Carrier Infinity")).toBe("lucide-wind")
    expect(glyphOf("Rheem Water Heater")).toBe("lucide-flame")
    expect(glyphOf("Samsung Dryer")).toBe("lucide-washing-machine")
    expect(glyphOf("GE Profile Oven")).toBe("lucide-utensils")
    expect(glyphOf("Shop Vac")).toBe("lucide-package")
    expect(glyphOf("Bosch Dishwasher")).toBe("lucide-washing-machine")
  })
})
