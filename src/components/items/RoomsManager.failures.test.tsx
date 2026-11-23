/**
 * Rooms (Items → Edit rooms) when a write or a read fails (audit H6).
 *
 * These cases moved here with the code, from Settings.failures.test.tsx: the
 * rooms list left Settings for /inventory/rooms (design/settings-your-home.md)
 * unchanged in behaviour. Each used to fail in silence — a room delete the
 * server refused closed its dialog with the room still listed and nothing
 * said; a list that never loaded rendered as empty. Each test forces the
 * failure and asserts the person SEES it, with no success state left standing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const m = vi.hoisted(() => ({
  getRooms: vi.fn(),
  deleteRoom: vi.fn(),
  renameRoom: vi.fn(),
  createRoom: vi.fn(),
  getDocs: vi.fn(),
}))

vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: "home-1", name: "Test Home" } }),
  getRooms: (...a: unknown[]) => m.getRooms(...a),
  createRoom: (...a: unknown[]) => m.createRoom(...a),
  renameRoom: (...a: unknown[]) => m.renameRoom(...a),
  deleteRoom: (...a: unknown[]) => m.deleteRoom(...a),
}))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: (...a: unknown[]) => m.getDocs(...a),
}))

const { default: RoomsPage } = await import("@/pages/RoomsPage")

beforeEach(() => {
  vi.clearAllMocks()
  m.getRooms.mockResolvedValue({ data: [{ room_id: "r1", name: "Kitchen" }], error: null })
  m.deleteRoom.mockResolvedValue({ data: true, error: null })
  m.getDocs.mockResolvedValue({ docs: [] })
})

const renderRooms = () => render(<MemoryRouter><RoomsPage /></MemoryRouter>)

describe("Rooms — the page", () => {
  it("is headed Rooms once, with a link back to Items", async () => {
    renderRooms()
    expect(await screen.findByRole("button", { name: "Kitchen" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Rooms" })).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 1, name: "Rooms" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute("href", "/inventory")
  })

  it("says how many items a room holds, from the items read", async () => {
    m.getDocs.mockResolvedValue({ docs: [{ data: () => ({ roomId: "r1" }) }, { data: () => ({ roomId: "r1" }) }, { data: () => ({ roomId: null }) }, { data: () => ({ roomId: 7 }) }] })
    renderRooms()
    expect(await screen.findByText("2 items")).toBeInTheDocument()
  })

  it("adds a room and lists it", async () => {
    m.createRoom.mockResolvedValue({ data: { room_id: "r2", name: "Attic" }, error: null })
    renderRooms()
    fireEvent.click(await screen.findByRole("button", { name: /Add room/ }))
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Attic" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByRole("button", { name: "Attic" })).toBeInTheDocument()
    expect(m.createRoom).toHaveBeenCalledWith({ home_id: "home-1", name: "Attic" })
  })

  it("an add the server refuses keeps the form open with the name typed, and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.createRoom.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderRooms()
    fireEvent.click(await screen.findByRole("button", { name: /Add room/ }))
    fireEvent.change(screen.getByLabelText("Room name"), { target: { value: "Attic" } })
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("Couldn't add that room. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByLabelText("Room name")).toHaveValue("Attic")
    expect(screen.queryByRole("button", { name: "Attic" })).toBeNull()
  })
})

describe("Rooms — failures are said", () => {
  it("a room delete the server refuses keeps the room and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.deleteRoom.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderRooms()

    fireEvent.click(await screen.findByRole("button", { name: "Delete Kitchen" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    expect(await screen.findByText("Couldn't delete Kitchen. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Kitchen" })).toBeInTheDocument()
  })

  it("a delete that works removes the room (the control case)", async () => {
    renderRooms()
    fireEvent.click(await screen.findByRole("button", { name: "Delete Kitchen" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Kitchen" })).toBeNull())
    expect(m.deleteRoom).toHaveBeenCalledWith("home-1", "r1")
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a rename the server refuses keeps the editor open with what was typed, and says so", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.renameRoom.mockResolvedValue({ data: null, error: { message: "permission-denied" } })
    renderRooms()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    fireEvent.change(input, { target: { value: "Pantry" } })
    fireEvent.keyDown(input, { key: "Enter" })

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
    // Still editing, with the typed name — like Add room's form, ready for Enter again.
    expect(screen.getByDisplayValue("Pantry")).toBeInTheDocument()
  })

  /** Past the tick a refocus would be scheduled on. */
  const nextTick = () => act(() => new Promise<void>((r) => setTimeout(r, 20)))

  it("a rename that fails because the person LEFT the field does not pull them back, or re-send it as they leave again", async () => {
    // The trap: blur saves, the save fails, the field took focus back — so the
    // next tap elsewhere saved, failed and refocused again, with Escape the
    // only way out (and nothing saying so).
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.renameRoom.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderRooms()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: "Pantry" } })
    // They tap elsewhere: focus moves on, and leaving the field saves.
    const elsewhere = screen.getByRole("button", { name: "Delete Kitchen" })
    act(() => elsewhere.focus())

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Pantry")).toBeInTheDocument()
    await nextTick()
    expect(document.activeElement).toBe(elsewhere)

    // Back into the field and out again, same name: nothing is re-sent.
    act(() => screen.getByDisplayValue("Pantry").focus())
    act(() => elsewhere.focus())
    await nextTick()
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(elsewhere)

    // A changed name is a new rename, and leaving the field sends it.
    act(() => screen.getByDisplayValue("Pantry").focus())
    fireEvent.change(screen.getByDisplayValue("Pantry"), { target: { value: "Larder" } })
    act(() => elsewhere.focus())
    await waitFor(() => expect(m.renameRoom).toHaveBeenCalledTimes(2))
    expect(m.renameRoom.mock.calls[1]).toEqual(["home-1", "r1", "Larder"])
  })

  it("a rename that fails on Enter puts the person back in the field, ready to try again", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    let answer!: (v: unknown) => void
    m.renameRoom.mockReturnValueOnce(new Promise((r) => { answer = r }))
    renderRooms()

    fireEvent.click(await screen.findByRole("button", { name: "Rename Kitchen" }))
    const input = screen.getByDisplayValue("Kitchen")
    await waitFor(() => expect(document.activeElement).toBe(input))
    fireEvent.change(input, { target: { value: "Pantry" } })
    fireEvent.keyDown(input, { key: "Enter" })
    // In a browser the field can lose focus as it disables itself mid-save;
    // here focus is moved off it while the save is in flight.
    act(() => screen.getByRole("button", { name: "Delete Kitchen" }).focus())
    await act(async () => answer({ data: null, error: { message: "unavailable" } }))

    expect(await screen.findByText("Couldn't rename that room. Check your connection and try again.")).toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByDisplayValue("Pantry")))
    // The blur mid-save did not start a second write.
    expect(m.renameRoom).toHaveBeenCalledTimes(1)
  })

  it("rooms that could not be read say so instead of an empty list", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRooms.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderRooms()
    expect(await screen.findByText("Couldn't load your rooms.")).toBeInTheDocument()
  })

  it("item counts that could not be read say so, and the rooms that did arrive are still listed", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getDocs.mockRejectedValue(new Error("unavailable"))
    renderRooms()
    expect(await screen.findByText("Couldn't load your rooms.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Kitchen" })).toBeInTheDocument()
  })

  // H5 moved the read into one reader + one apply (readRooms/applyRooms). Try
  // again is the imperative path through them.
  it("Try again on rooms reads them again and lists them", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    m.getRooms.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } })
    renderRooms()
    const failed = (await screen.findByText("Couldn't load your rooms.")).closest("[role=alert]") as HTMLElement
    fireEvent.click(within(failed).getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Kitchen")).toBeInTheDocument()
    expect(screen.queryByText("Couldn't load your rooms.")).toBeNull()
    expect(m.getRooms).toHaveBeenCalledTimes(2)
  })
})
