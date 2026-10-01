/**
 * useChatFilters — Ask's room and appliance pickers.
 *
 * The read's starting state (loading, or empty with no home) used to be set
 * inside the effect that reads (H5, react-hooks/set-state-in-effect); it is
 * now set in the render that asks. Pinned: no home is an empty, settled
 * picker; a home loads its rooms and items; a failed item read is an error
 * (HH-149) and reload reads again, showing loading while it does.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook, waitFor } from "@testing-library/react"

const svc = vi.hoisted(() => ({ getRooms: vi.fn(), getItemUnits: vi.fn() }))
vi.mock("@/modules/home", () => ({ getRooms: (...a: unknown[]) => svc.getRooms(...a) }))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))

const { useChatFilters } = await import("./useChatFilters")

const ITEMS = [{ item_unit_id: "i1", display_name: "Dryer", brand: "LG", model: null }]

describe("useChatFilters", () => {
  beforeEach(() => {
    svc.getRooms.mockReset().mockResolvedValue({ data: [{ room_id: "r1", name: "Laundry" }], error: null })
    svc.getItemUnits.mockReset().mockResolvedValue({ data: ITEMS, error: null })
  })

  it("with no home: nothing to pick, and not loading", () => {
    const { result } = renderHook(() => useChatFilters(undefined))
    expect(result.current).toMatchObject({ rooms: [], items: [], loading: false, error: null })
    expect(svc.getItemUnits).not.toHaveBeenCalled()
  })

  it("loads the home's rooms and items", async () => {
    const { result } = renderHook(() => useChatFilters("home-1"))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.rooms).toEqual([{ room_id: "r1", name: "Laundry" }])
    expect(result.current.items.map((i) => i.display_name)).toEqual(["Dryer"])
  })

  it("a failed item read is an error, and reload reads again — loading meanwhile", async () => {
    svc.getItemUnits.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { result } = renderHook(() => useChatFilters("home-1"))
    await waitFor(() => expect(result.current.error).toBe("unavailable"))
    expect(result.current.loading).toBe(false)

    act(() => result.current.reload())
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.items.map((i) => i.display_name)).toEqual(["Dryer"])
    expect(svc.getItemUnits).toHaveBeenCalledTimes(2)
  })
})
