/**
 * HH-149 — the Ask page's item picker must not claim certainty it lacks.
 *
 * Owner, 2026-09-05: typing "Dishw" said "No appliances match" while her
 * Dishwasher sat in Items. The matcher was fine; the LIST was empty, because it
 * was still loading or had failed and told only the console. Three different
 * facts had been collapsed into one confident sentence.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { FilterBar } from "./FilterBar"

const base = {
  rooms: [{ room_id: "r1", name: "Kitchen" }],
  selectedRoomIds: [],
  selectedItemId: null,
  onRoomToggle: vi.fn(),
  onItemSelect: vi.fn(),
}
const type = (q: string) => {
  const input = screen.getAllByRole("textbox")[0] ?? screen.getAllByPlaceholderText(/search|item/i)[0]
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: q } })
}

describe("the picker's empty state tells the truth about WHY", () => {
  it("says it is still loading — never 'no match' — while the list is on its way", () => {
    render(<FilterBar {...base} items={[]} itemsLoading itemsError={null} />)
    type("dishw")
    expect(screen.getByText(/Loading your items/i)).toBeTruthy()
    expect(screen.queryByText(/No appliances match/i)).toBeNull()
  })

  it("surfaces a failed load with a retry the user can press", () => {
    const onRetryItems = vi.fn()
    render(<FilterBar {...base} items={[]} itemsLoading={false} itemsError="offline" onRetryItems={onRetryItems} />)
    type("dishw")
    expect(screen.getByRole("alert").textContent).toMatch(/Couldn't load your items/i)
    expect(screen.queryByText(/No appliances match/i)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Try again/i }))
    expect(onRetryItems).toHaveBeenCalledTimes(1)
  })

  it("says 'no match' ONLY when the list really arrived and has none", () => {
    render(<FilterBar {...base} items={[{ item_unit_id: "i1", display_name: "Toaster", brand: null, model: null }]} itemsLoading={false} itemsError={null} />)
    type("dishw")
    expect(screen.getByText(/No appliances match/i)).toBeTruthy()
  })

  it("finds the item the owner was looking for once the list is there", () => {
    render(<FilterBar {...base} items={[{ item_unit_id: "i1", display_name: "Dishwasher", brand: "Bosch", model: "SHPM65Z55N" }]} itemsLoading={false} itemsError={null} />)
    type("dishw")
    expect(screen.queryByText(/No appliances match/i)).toBeNull()
    expect(screen.getAllByText(/Dishwasher/).length).toBeGreaterThan(0)
  })
})
