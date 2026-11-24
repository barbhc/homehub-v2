/**
 * Rooms (Items → Edit rooms): a late reply never lands on the wrong home (H4).
 *
 * Moved here with the code, from Settings.staleReply.test.tsx. The list is
 * read by one function and lands through one apply — on arrival, on a home
 * switch and on Try again. None of those used to check, when the answer came
 * back, that it was still for the home on screen: home A's slow read, landing
 * after a switch to home B, replaced B's list with A's.
 *
 * And a rename's answer closes only its own room's editor: leaving room X's
 * field for "Rename Y" saves X on the blur, and Y's editor, opened while that
 * save was in flight, was closed by it landing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const m = vi.hoisted(() => ({
  homeId: "home-a",
  getRooms: vi.fn(),
  renameRoom: vi.fn(),
}))

vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: m.homeId, name: m.homeId } }),
  getRooms: (...a: unknown[]) => m.getRooms(...a),
  createRoom: vi.fn(),
  renameRoom: (...a: unknown[]) => m.renameRoom(...a),
  deleteRoom: vi.fn(),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: [] })),
}))

const { default: RoomsPage } = await import("@/pages/RoomsPage")

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
const ROOMS: Record<string, { room_id: string; name: string }[]> = {
  "home-a": [{ room_id: "ka", name: "Kitchen" }],
  "home-b": [{ room_id: "gb", name: "Garage" }],
}

const page = () => <MemoryRouter><RoomsPage /></MemoryRouter>
const roomsCard = () => within(document.querySelector("[data-testid=rooms-page]") as HTMLElement)

beforeEach(() => {
  vi.clearAllMocks()
  m.homeId = "home-a"
  m.getRooms.mockImplementation(async (homeId: string) => ({ data: ROOMS[homeId], error: null }))
})

describe("Rooms — a late reply for the last home lands nowhere", () => {
  it("home A's slow first read, answering after the switch to B, leaves B's rooms", async () => {
    const slowA = deferred<{ data: { room_id: string; name: string }[]; error: null }>()
    m.getRooms.mockImplementation((homeId: string) =>
      homeId === "home-a" ? slowA.promise : Promise.resolve({ data: ROOMS[homeId], error: null }))
    const { rerender } = render(page())

    m.homeId = "home-b"
    rerender(page())
    expect(await roomsCard().findByText("Garage")).toBeInTheDocument()

    await act(async () => { slowA.resolve({ data: ROOMS["home-a"], error: null }) })
    expect(roomsCard().getByText("Garage")).toBeInTheDocument()
    expect(roomsCard().queryByText("Kitchen")).toBeNull()
  })

  it("Try again on A, answering after the switch to B, leaves B's rooms", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const retryA = deferred<{ data: { room_id: string; name: string }[]; error: null }>()
    m.getRooms
      .mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
      .mockImplementation((homeId: string) =>
        homeId === "home-a" ? retryA.promise : Promise.resolve({ data: ROOMS[homeId], error: null }))
    const { rerender } = render(page())
    fireEvent.click(await roomsCard().findByRole("button", { name: "Try again" }))

    m.homeId = "home-b"
    rerender(page())
    await waitFor(() => expect(roomsCard().getByText("Garage")).toBeInTheDocument())

    await act(async () => { retryA.resolve({ data: ROOMS["home-a"], error: null }) })
    expect(roomsCard().getByText("Garage")).toBeInTheDocument()
    expect(roomsCard().queryByText("Kitchen")).toBeNull()
  })
})

describe("Rooms — a rename's answer closes only its own room's editor", () => {
  type Renamed = { data: { room_id: string; name: string } | null; error: { message: string } | null }
  beforeEach(() => {
    m.getRooms.mockImplementation(async () => ({
      data: [{ room_id: "ka", name: "Kitchen" }, { room_id: "ba", name: "Bath" }], error: null,
    }))
  })
  /** Kitchen's editor, renamed to Pantry, left for Bath's "Rename": the blur saves Kitchen. */
  async function leaveKitchenForBath() {
    fireEvent.click(await roomsCard().findByRole("button", { name: "Rename Kitchen" }))
    const kitchen = roomsCard().getByDisplayValue("Kitchen")
    fireEvent.change(kitchen, { target: { value: "Pantry" } })
    fireEvent.blur(kitchen)
    expect(m.renameRoom).toHaveBeenCalledWith("home-a", "ka", "Pantry")
    fireEvent.click(roomsCard().getByRole("button", { name: "Rename Bath" }))
    expect(roomsCard().getByDisplayValue("Bath")).toBeInTheDocument()
  }

  it("Bath's editor, opened while Kitchen's save is in flight, stays open when Kitchen's save lands", async () => {
    const save = deferred<Renamed>()
    m.renameRoom.mockReturnValue(save.promise)
    render(page())
    await leaveKitchenForBath()

    await act(async () => { save.resolve({ data: { room_id: "ka", name: "Pantry" }, error: null }) })

    expect(roomsCard().getByRole("button", { name: "Pantry" })).toBeInTheDocument()
    expect(roomsCard().getByDisplayValue("Bath")).toBeEnabled()
  })

  it("…and stays open, Kitchen keeping its name, when Kitchen's save fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const save = deferred<Renamed>()
    m.renameRoom.mockReturnValue(save.promise)
    render(page())
    await leaveKitchenForBath()

    await act(async () => { save.resolve({ data: null, error: { message: "unavailable" } }) })

    expect(roomsCard().getByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    expect(roomsCard().getByRole("button", { name: "Kitchen" })).toBeInTheDocument()
    expect(roomsCard().getByDisplayValue("Bath")).toBeEnabled()
  })

  it("a room's own editor still closes when its save lands (control)", async () => {
    m.renameRoom.mockResolvedValue({ data: { room_id: "ka", name: "Pantry" }, error: null })
    render(page())
    fireEvent.click(await roomsCard().findByRole("button", { name: "Rename Kitchen" }))
    const kitchen = roomsCard().getByDisplayValue("Kitchen")
    fireEvent.change(kitchen, { target: { value: "Pantry" } })
    fireEvent.keyDown(kitchen, { key: "Enter" })

    expect(await roomsCard().findByRole("button", { name: "Pantry" })).toBeInTheDocument()
    expect(roomsCard().queryByDisplayValue("Pantry")).toBeNull()
  })
})
