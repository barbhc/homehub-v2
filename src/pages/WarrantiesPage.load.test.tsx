/**
 * Warranties: what a home switch does to the list.
 *
 * The clear-to-loading used to be setState inside the effect that reads (H5,
 * react-hooks/set-state-in-effect); it now happens in the render that switches
 * homes, and the effect reads by home id. Pinned: the first home's empty state,
 * then on a switch the other home's — the first home's never stands in for it;
 * and a failed read says so.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const svc = vi.hoisted(() => ({ homeId: "home-1", getItemUnits: vi.fn(), getRooms: vi.fn() }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: svc.homeId } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))

const { default: WarrantiesPage } = await import("./WarrantiesPage")

const page = () => (
  <MemoryRouter>
    <WarrantiesPage />
  </MemoryRouter>
)

describe("WarrantiesPage · reading by home", () => {
  beforeEach(() => {
    svc.homeId = "home-1"
    svc.getRooms.mockReset().mockResolvedValue({ data: [], error: null })
    svc.getItemUnits.mockReset().mockResolvedValue({ data: [], error: null })
  })

  it("reads the home it is on, and reads again for the next one", async () => {
    const { rerender } = render(page())
    await waitFor(() => expect(screen.getByText("No warranties on file yet")).toBeInTheDocument())
    expect(svc.getItemUnits).toHaveBeenLastCalledWith("home-1")

    let answer!: (v: unknown) => void
    svc.getItemUnits.mockReturnValueOnce(new Promise((r) => { answer = r }))
    svc.homeId = "home-2"
    rerender(page())
    // Loading — not the last home's answer standing in for this one.
    expect(screen.queryByText("No warranties on file yet")).toBeNull()
    expect(svc.getItemUnits).toHaveBeenLastCalledWith("home-2")
    answer({ data: [], error: null })
    await waitFor(() => expect(screen.getByText("No warranties on file yet")).toBeInTheDocument())
  })

  it("a failed read says so", async () => {
    svc.getItemUnits.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    render(page())
    await waitFor(() => expect(screen.getByText("We couldn't load your warranties just now.")).toBeInTheDocument())
  })
})

describe("WarrantiesPage · a row", () => {
  beforeEach(() => {
    svc.homeId = "home-1"
    svc.getRooms.mockReset().mockResolvedValue({ data: [], error: null })
  })

  it("gives the name its own wrapping line, with the status on the line under it", async () => {
    const name = "Bosch 800 Series Dishwasher with a very long model name"
    svc.getItemUnits.mockReset().mockResolvedValue({
      data: [
        { item_unit_id: "i1", display_name: name, category: "dishwasher", warranty_expiry_date: "2099-12-05" },
        { item_unit_id: "i2", display_name: "Old fridge", category: "refrigerator", warranty_expiry_date: "2020-04-14" },
      ],
      error: null,
    })
    render(page())
    const nameLine = await screen.findByText(name)
    expect(nameLine.className).not.toMatch(/\btruncate\b/)
    // The very next line is the status — not a column beside the name.
    expect(nameLine.nextElementSibling?.textContent).toBe("Covered · Dec 5, 2099")
    expect(screen.getByText("Old fridge").nextElementSibling?.textContent).toBe("Lapsed · Apr 14, 2020")
  })
})
