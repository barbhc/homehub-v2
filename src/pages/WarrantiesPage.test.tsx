/**
 * Items → Warranties (WarrantiesView, what was the Warranties page).
 *
 * The view no longer reads: it is handed the items and rooms the Items page
 * already holds, so reading by home — a switch never paints the last home's
 * list, a failed read says so — is pinned where that read lives now
 * (Inventory.test.tsx, useHomeItems). Pinned here: what it draws from them,
 * and that it no longer titles itself (the page's title is "Items", above the
 * Items | Warranties control — design/tasks-items-views.md).
 */
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"

const { WarrantiesView } = await import("./WarrantiesPage")

const item = (over: Partial<ItemUnit>) => ({ category: null, room_id: null, brand: null, ...over }) as ItemUnit
const view = (items: ItemUnit[], rooms: { room_id: string; name: string }[] = []) =>
  render(
    <MemoryRouter>
      <WarrantiesView items={items} rooms={rooms} />
    </MemoryRouter>,
  )

describe("WarrantiesView", () => {
  it("has no title or subtitle of its own (not rendered)", () => {
    view([item({ item_unit_id: "i1", display_name: "Furnace", warranty_expiry_date: "2099-01-01" })])
    expect(screen.queryByRole("heading", { name: "Warranties" })).toBeNull()
    expect(screen.queryByText("Coverage across your home, at a glance.")).toBeNull()
  })

  it("with no warranty on any item, says so and points at the list", () => {
    view([item({ item_unit_id: "i1", display_name: "Furnace" })])
    expect(screen.getByText("No warranties on file yet")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go to items" })).toHaveAttribute("href", "/inventory")
  })

  it("gives the name its own wrapping line, with the status on the line under it", () => {
    const name = "Bosch 800 Series Dishwasher with a very long model name"
    view(
      [
        item({ item_unit_id: "i1", display_name: name, category: "dishwasher", warranty_expiry_date: "2099-12-05", room_id: "r1" }),
        item({ item_unit_id: "i2", display_name: "Old fridge", category: "refrigerator", warranty_expiry_date: "2020-04-14" }),
      ],
      [{ room_id: "r1", name: "Kitchen" }],
    )
    const nameLine = screen.getByText(name)
    expect(nameLine.className).not.toMatch(/\btruncate\b/)
    // The very next line is the status — not a column beside the name.
    expect(nameLine.nextElementSibling?.textContent).toBe("Covered · Dec 5, 2099")
    // The room comes from the rooms the Items page read, not a read of its own.
    expect(nameLine.nextElementSibling?.nextElementSibling?.textContent).toBe("Kitchen")
    expect(screen.getByText("Old fridge").nextElementSibling?.textContent).toBe("Lapsed · Apr 14, 2020")
  })
})
