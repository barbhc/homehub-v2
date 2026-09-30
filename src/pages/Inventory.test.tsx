/**
 * Items (HH-158, "pages are slow to load"). The page used to load in a plain
 * effect with `loading` starting true, so EVERY visit — a back-navigation from
 * an item included — showed a full skeleton until Firestore answered; a hung
 * read was a skeleton forever; and the skeleton was the pre-redesign page
 * ("Inventory", an "Add Item" pill, 3-column grids).
 *
 * The contract pinned here:
 *   · data in hand — even a persisted snapshot while the read is still in
 *     flight — paints the list, never a skeleton (SWR's `isLoading` is true in
 *     exactly that state, which is the trap Home fell into first);
 *   · a cold start's skeleton is the redesigned page: "Items" and a live "+";
 *   · a failed read is a visible failure with Try again — never "No items yet";
 *   · a home switch never paints the other home's items, even when that home's
 *     answer arrives late.
 *
 * RTL doesn't run StrictMode, so a per-render SWR cache provider is safe here
 * (App deliberately doesn't use one — see swrPersist.ts).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { SWRConfig } from "swr"
import type { ItemUnit, Room } from "@/integrations/types"

const svc = vi.hoisted(() => ({
  getItemUnits: vi.fn(),
  getRooms: vi.fn(),
  getHomeNotes: vi.fn(),
  homeId: "h1",
}))
vi.mock("@/modules/items", () => ({ getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a) }))
vi.mock("@/modules/home", () => ({
  useCurrentHome: () => ({ home: { home_id: svc.homeId } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
}))
vi.mock("@/modules/care", () => ({ getHomeNotes: (...a: unknown[]) => svc.getHomeNotes(...a) }))

const { default: Inventory } = await import("./Inventory")

const item = (id: string, name: string, home = "h1", room: string | null = "r1"): ItemUnit =>
  ({
    item_unit_id: id, home_id: home, room_id: room, display_name: name, category: "HVAC", item_category: null,
    brand: "Carrier", model: null, status: "active", deleted_at: null, created_at: "2026-09-01T00:00:00Z",
  }) as ItemUnit
const room = (id: string, name: string, home = "h1"): Room =>
  ({ room_id: id, home_id: home, name, created_at: "", updated_at: "", deleted_at: null }) as Room

const FURNACE = item("i1", "Carrier Infinity Furnace")
const ROOMS = [room("r1", "Basement")]
const ok = <T,>(data: T) => ({ data, error: null })
/** A read that never answers — the in-flight state a warm start revalidates in. */
const never = () => new Promise<never>(() => {})

function renderPage(fallback: Record<string, unknown> = {}) {
  const ui = () => (
    <SWRConfig value={{ provider: () => new Map(), fallback, shouldRetryOnError: false }}>
      <MemoryRouter>
        <Inventory />
      </MemoryRouter>
    </SWRConfig>
  )
  const r = render(ui())
  return { ...r, rerenderPage: () => r.rerender(ui()) }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  svc.homeId = "h1"
  svc.getHomeNotes.mockResolvedValue(ok([]))
})
afterEach(() => {
  vi.useRealTimers()
})

describe("Items — a warm cache paints, never a skeleton", () => {
  it("a persisted snapshot + a read still in flight renders the list with NO skeleton", async () => {
    // The trap, exactly: SWR reports isLoading=true here (fallback data isn't
    // "loaded" by its definition). A page gated on isLoading hides this list.
    svc.getItemUnits.mockReturnValue(never())
    svc.getRooms.mockReturnValue(never())

    renderPage({ "items:v1:h1": { items: [FURNACE], rooms: ROOMS } })

    // Painted on the first render, before any read has even started.
    expect(screen.getAllByText("Carrier Infinity Furnace").length).toBeGreaterThan(0) // both trees render in jsdom
    expect(screen.queryByTestId("items-skeleton")).toBeNull()

    // SWR defers a revalidation behind data it can already show; once it IS in
    // flight (through the offline-empty guard), the list must still be there.
    await waitFor(() => expect(svc.getItemUnits).toHaveBeenCalledWith("h1", { refuseOfflineEmpty: true }))
    expect(svc.getRooms).toHaveBeenCalledWith("h1", { refuseOfflineEmpty: true })
    expect(screen.getAllByText("Carrier Infinity Furnace").length).toBeGreaterThan(0)
    expect(screen.queryByTestId("items-skeleton")).toBeNull()
  })

  it("a successful read persists the list for the next launch", async () => {
    svc.getItemUnits.mockResolvedValue(ok([FURNACE]))
    svc.getRooms.mockResolvedValue(ok(ROOMS))

    renderPage()

    expect((await screen.findAllByText("Carrier Infinity Furnace")).length).toBeGreaterThan(0)
    const stored = JSON.parse(localStorage.getItem("hh-swr-dashboard-cache") ?? "[]") as [string, unknown][]
    expect(Object.fromEntries(stored)["items:v1:h1"]).toEqual({ items: [FURNACE], rooms: ROOMS })
  })
})

describe("Items — the cold-start skeleton is the redesigned page", () => {
  it("says 'Items' with a live '+', and never the old 'Inventory' / 'Add Item'", () => {
    svc.getItemUnits.mockReturnValue(never())
    svc.getRooms.mockReturnValue(never())

    renderPage()

    const skeleton = screen.getByTestId("items-skeleton")
    // Phone and desktop headers (one is display:none on a device).
    expect(within(skeleton).getAllByRole("heading", { name: "Items" })).toHaveLength(2)
    // The round "+" is the real control, usable while the list loads.
    expect(within(skeleton).getByRole("link", { name: "Add item" })).toHaveAttribute("href", "/inventory/add")
    // The pre-redesign skeleton: gone from the DOM entirely, not just hidden.
    expect(screen.queryByText(/add item/i)).toBeNull()
    expect(screen.queryByRole("heading", { name: "Inventory" })).toBeNull()
    expect(screen.queryByLabelText("Loading inventory")).toBeNull()
    // Screen readers hear that it's loading.
    expect(within(skeleton).getAllByRole("status")[0]).toHaveTextContent("Loading items…")
  })

  it("after SKELETON_PATIENCE_MS it says 'Still loading…' and Try again starts a fresh read", async () => {
    vi.useFakeTimers()
    svc.getItemUnits.mockReturnValue(never())
    svc.getRooms.mockReturnValue(never())

    renderPage()
    expect(screen.queryByText("Still loading…")).toBeNull()

    await act(async () => { vi.advanceTimersByTime(6000) })
    expect(screen.getAllByText("Still loading…").length).toBeGreaterThan(0)

    const calls = svc.getItemUnits.mock.calls.length
    await act(async () => { fireEvent.click(screen.getAllByRole("button", { name: "Try again" })[0]) })
    expect(svc.getItemUnits.mock.calls.length).toBe(calls + 1)
    // The retry restarts the wait rather than leaving the note up.
    expect(screen.queryByText("Still loading…")).toBeNull()
  })
})

describe("Items — a failed read says so", () => {
  it("a rejected read shows the failure and Try again — never 'No items yet'", async () => {
    svc.getItemUnits.mockResolvedValue({ data: null, error: { message: "Couldn't reach the server to load your items." } })
    svc.getRooms.mockResolvedValue(ok(ROOMS))

    renderPage()

    const retry = await screen.findByRole("button", { name: /try again/i })
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your items")
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the server to load your items.")
    expect(screen.queryByText("No items yet")).toBeNull()
    expect(localStorage.getItem("hh-swr-dashboard-cache")).toBeNull() // a failure is never persisted

    svc.getItemUnits.mockResolvedValue(ok([FURNACE]))
    fireEvent.click(retry)
    expect((await screen.findAllByText("Carrier Infinity Furnace")).length).toBeGreaterThan(0)
    expect(screen.queryByRole("alert")).toBeNull()
  })

  it("a thrown rejection lands in the same visible state (never an endless skeleton)", async () => {
    svc.getItemUnits.mockRejectedValue(new Error("network down"))
    svc.getRooms.mockResolvedValue(ok(ROOMS))

    renderPage()

    expect(await screen.findByRole("alert")).toHaveTextContent("network down")
    expect(screen.queryByTestId("items-skeleton")).toBeNull()
  })

  it("a failed refresh behind a snapshot keeps the list and says so quietly", async () => {
    svc.getItemUnits.mockResolvedValue({ data: null, error: { message: "Couldn't reach the server to load your items." } })
    svc.getRooms.mockResolvedValue(ok(ROOMS))

    renderPage({ "items:v1:h1": { items: [FURNACE], rooms: ROOMS } })

    expect((await screen.findAllByText(/Showing your last saved view/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Carrier Infinity Furnace").length).toBeGreaterThan(0)
    expect(screen.queryByText("No items yet")).toBeNull()
    expect(screen.queryByRole("alert")).toBeNull()
  })
})

describe("Items — a home switch never shows the other home's items", () => {
  it("switching homes shows the skeleton (or that home's own list), and a late answer for the old home never paints", async () => {
    let answerA: (v: unknown) => void = () => {}
    let answerB: (v: unknown) => void = () => {}
    svc.getItemUnits.mockImplementation((homeId: string) =>
      new Promise((resolve) => { if (homeId === "hA") answerA = resolve; else answerB = resolve }),
    )
    svc.getRooms.mockImplementation((homeId: string) => Promise.resolve(ok([room("r1", "Basement", homeId)])))

    svc.homeId = "hA"
    const { rerenderPage } = renderPage()
    expect(screen.getByTestId("items-skeleton")).toBeInTheDocument()

    // Switch before A answers.
    svc.homeId = "hB"
    rerenderPage()
    await act(async () => { answerB(ok([item("b1", "Home B Washer", "hB")])) })
    expect((await screen.findAllByText("Home B Washer")).length).toBeGreaterThan(0)

    // A's answer lands late — it belongs to A's key, and must not paint under B.
    await act(async () => { answerA(ok([item("a1", "Home A Fridge", "hA")])) })
    expect(screen.queryByText("Home A Fridge")).toBeNull()
    expect(screen.getAllByText("Home B Washer").length).toBeGreaterThan(0)
  })

  it("a warm snapshot for one home is never painted under another", () => {
    svc.getItemUnits.mockReturnValue(never())
    svc.getRooms.mockReturnValue(never())
    svc.homeId = "hB"

    renderPage({ "items:v1:hA": { items: [item("a1", "Home A Fridge", "hA")], rooms: [] } })

    expect(screen.getByTestId("items-skeleton")).toBeInTheDocument()
    expect(screen.queryByText("Home A Fridge")).toBeNull()
  })
})
