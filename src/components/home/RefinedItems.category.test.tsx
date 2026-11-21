/**
 * The Items row names what an item is in words, never as a stored slug.
 *
 * Picking "Washer" in "What is it?" stores sub_type "washing-machine". The row
 * subtitle used to print the raw `category` field, so the list read
 * "LG · washing-machine". It now goes through categoryLabel, like the item page.
 */
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"
import { RefinedItems } from "./RefinedItems"

describe("RefinedItems · row subtitle", () => {
  it("shows the readable type, not the slug", () => {
    const washer = {
      item_unit_id: "i1", home_id: "h1", room_id: null, display_name: "Washer",
      category: "washing-machine", item_category: "major_appliance", sub_type: "washing-machine",
      brand: "LG", model: null, status: "active", deleted_at: null, created_at: "2026-09-01T00:00:00Z",
    } as ItemUnit
    render(<MemoryRouter><RefinedItems rooms={[]} items={[washer]} /></MemoryRouter>)
    const row = screen.getByText("Washer").closest("a") as HTMLElement
    expect(row.textContent).not.toContain("washing-machine")
    expect(row.textContent).toMatch(/LG · Washing machine|LG · Washer/i)
  })
})
