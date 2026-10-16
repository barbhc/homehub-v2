/**
 * The item page's one-tap suggestions say when they fail (audit 2026-10-15).
 *
 * "Add" on a looked-up detail, "Hide them", and the room/name chips each wrote
 * the item and, on a refused write, did nothing at all: the chip stayed, the
 * page stayed, and nothing said why. Each failure now shows a line where the
 * tap happened.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

const m = vi.hoisted(() => ({
  updateItemUnit: vi.fn(),
  getItemUnits: vi.fn(),
}))
vi.mock("@/modules/items", () => ({
  updateItemUnit: (...a: unknown[]) => m.updateItemUnit(...a),
  getItemUnits: (...a: unknown[]) => m.getItemUnits(...a),
}))
vi.mock("@/lib/lateSuggestions", () => ({
  lateRoomSuggestion: () => ({ room_id: "r-kitchen", name: "Kitchen" }),
  lateNameSuggestion: () => "Dishwasher",
}))
vi.mock("@/lib/manualReviewState", () => ({ askHint: () => "" }))
vi.mock("@/components/item-care/CareBlock", () => ({ CareBlock: () => null }))
vi.mock("@/components/item-care/WarrantyPanel", () => ({ WarrantyPanel: () => null }))
vi.mock("@/components/notes/NotesSection", () => ({ NotesSection: () => null }))
vi.mock("./ItemPhoto", () => ({ ItemPhoto: () => null }))

const { RefinedItemDetail } = await import("./RefinedItemDetail")

const item = {
  item_unit_id: "i1",
  home_id: "h1",
  display_name: "Bosch SHPM65Z55N",
  brand: "Bosch",
  model: "SHPM65Z55N",
  room_id: null,
  tags: [],
  category_fields: {},
  lookup_suggestions: [{ key: "capacity", label: "Capacity", value: "16 place settings" }],
  lookup_dismissed_at: null,
} as never

const renderPage = () =>
  render(
    <MemoryRouter>
      <RefinedItemDetail
        item={item} rooms={[]} homeId="h1" tasks={[]} chunks={[]}
        manualState={{} as never} notificationsBlocked={false} onBack={() => {}}
      />
    </MemoryRouter>,
  )

const refused = { data: null, error: { message: "permission-denied" } }

beforeEach(() => {
  vi.clearAllMocks()
  m.updateItemUnit.mockResolvedValue(refused)
  m.getItemUnits.mockResolvedValue({ data: [], error: null })
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

describe("RefinedItemDetail — suggestion writes that fail say so", () => {
  it("Add on a looked-up detail", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    expect(await screen.findByText("Couldn't add that. Try again.")).toBeInTheDocument()
  })

  it("Hide them", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: "Hide them" }))
    expect(await screen.findByText("Couldn't hide them. Try again.")).toBeInTheDocument()
  })

  it("the room chip", async () => {
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /Kitchen/ }))
    expect(await screen.findByText("Couldn't set the room. Try again.")).toBeInTheDocument()
  })

  it("the name chip — including when the other names cannot be read", async () => {
    m.getItemUnits.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderPage()
    fireEvent.click(screen.getByRole("button", { name: /Name it/ }))
    expect(await screen.findByText("Couldn't rename it. Try again.")).toBeInTheDocument()
    // Never named without the dedupe.
    expect(m.updateItemUnit).not.toHaveBeenCalled()
  })

  it("a write that lands shows no error (the control case)", async () => {
    const onItemUpdate = vi.fn()
    m.updateItemUnit.mockResolvedValue({ data: { ...(item as object), lookup_dismissed_at: "now" }, error: null })
    render(
      <MemoryRouter>
        <RefinedItemDetail
          item={item} rooms={[]} homeId="h1" tasks={[]} chunks={[]}
          manualState={{} as never} notificationsBlocked={false} onBack={() => {}} onItemUpdate={onItemUpdate}
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole("button", { name: "Hide them" }))
    await waitFor(() => expect(onItemUpdate).toHaveBeenCalled())
    expect(screen.queryByRole("alert")).toBeNull()
  })
})
