/**
 * The add flow's room pickers read the selected home's rooms (H4). Both
 * applied whatever came back, so home A's slow read, landing after a switch to
 * home B, offered A's rooms for an item being added to B — RoomSelector in its
 * dropdown, IdentifyStep in its one-tap room chip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { DEFAULT_IDENTIFY_DATA } from "./identifyData"

const m = vi.hoisted(() => ({ homeId: "home-a", getRooms: vi.fn() }))
vi.mock("@/modules/home", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useCurrentHome: () => ({ home: { home_id: m.homeId, name: m.homeId } }),
  getRooms: (...a: unknown[]) => m.getRooms(...a),
}))
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: async () => ({ data: null, error: null }),
  lookupBrandForModel: async () => null,
}))

const { RoomSelector } = await import("./RoomSelector")
const { IdentifyStep } = await import("./IdentifyStep")

type RoomsRead = { data: { room_id: string; name: string }[]; error: null }
const ROOMS: Record<string, RoomsRead> = {
  "home-a": { data: [{ room_id: "ka", name: "Main Kitchen" }], error: null },
  "home-b": { data: [{ room_id: "kb", name: "Back Kitchen" }], error: null },
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

let slowA: ReturnType<typeof deferred<RoomsRead>>
beforeEach(() => {
  m.homeId = "home-a"
  slowA = deferred<RoomsRead>()
  m.getRooms.mockReset().mockImplementation((homeId: string) =>
    homeId === "home-a" ? slowA.promise : Promise.resolve(ROOMS[homeId]))
})

describe("RoomSelector — a late reply for the last home lands nowhere", () => {
  it("home A's slow rooms, answering after the switch to B, leave B's in the dropdown", async () => {
    const picker = () => <RoomSelector value={null} onChange={vi.fn()} />
    const { rerender } = render(picker())
    m.homeId = "home-b"
    rerender(picker())
    expect(await screen.findByRole("option", { name: "Back Kitchen" })).toBeInTheDocument()

    await act(async () => { slowA.resolve(ROOMS["home-a"]) })
    expect(screen.getByRole("option", { name: "Back Kitchen" })).toBeInTheDocument()
    expect(screen.queryByRole("option", { name: "Main Kitchen" })).toBeNull()
  })
})

describe("IdentifyStep — a late reply for the last home lands nowhere", () => {
  it("home A's slow rooms, answering after the switch to B, leave B's room chip", async () => {
    // A fridge, room not yet chosen: the step offers its home's kitchen as a one-tap chip.
    const data = { ...DEFAULT_IDENTIFY_DATA, name: "Refrigerator", subType: "refrigerator" }
    const step = () => (
      <IdentifyStep
        mode="simple" data={data} onModeChange={vi.fn()} onDataChange={vi.fn()}
        onConfirm={vi.fn()} isCreating={false} error={null}
      />
    )
    const { rerender } = render(step())
    m.homeId = "home-b"
    rerender(step())
    expect(await screen.findByRole("button", { name: /Back Kitchen/ })).toBeInTheDocument()

    await act(async () => { slowA.resolve(ROOMS["home-a"]) })
    expect(screen.getByRole("button", { name: /Back Kitchen/ })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Main Kitchen/ })).toBeNull()
  })
})
