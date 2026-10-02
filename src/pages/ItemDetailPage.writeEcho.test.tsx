/**
 * The item page: a save's answer lands only on the item it was for.
 *
 * The page stays mounted when it moves to another item (/items/A → /items/B:
 * the parse tray's "review ready", a push, the back swipe). Every edit on it
 * handed its result straight to the page's item — onItemUpdate={setItem} for
 * the name, photo, warranty, details and edit dialog; setItem for the room and
 * the category — so an edit to A that answered after the move put A on B's
 * page, under B's URL. A failed room or category change put A's old copy back
 * there instead, with "Could not change the room" said about B. A delete of A
 * that answered after the move navigated away from B, and its confirmation,
 * still open, asked "Delete B?". A saved Q&A deleted on A replaced B's saved
 * Q&A with A's.
 *
 * The page itself is real, with its real load; its big children are stand-ins
 * that save the way the real ones do — with the props of the render the tap
 * happened in, handing the result back when the write answers.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"
import type { ChatFaq, ItemUnit } from "@/integrations/types"

const svc = vi.hoisted(() => ({
  getItemUnit: vi.fn(),
  getFaqs: vi.fn(),
  updateItemUnit: vi.fn(),
  softDeleteItemUnit: vi.fn(),
  deleteFaq: vi.fn(),
  /** The stand-in item view's own save (the name), answered when the test says. */
  saveName: vi.fn(),
}))

vi.mock("@/modules/auth", () => {
  const auth = { user: { id: "uid-1" } }
  return { useAuth: () => auth }
})
vi.mock("@/modules/home", () => {
  const ctx = { home: { home_id: "home-1", name: "Home" } }
  return { useCurrentHome: () => ctx, getRooms: async () => ({ data: [], error: null }) }
})
vi.mock("@/modules/items", () => ({
  getItemUnit: (...a: unknown[]) => svc.getItemUnit(...a),
  softDeleteItemUnit: (...a: unknown[]) => svc.softDeleteItemUnit(...a),
  updateItemUnit: (...a: unknown[]) => svc.updateItemUnit(...a),
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: async () => ({ data: [], error: null }) }))
vi.mock("@/modules/knowledge", () => ({
  getChunksByItem: async () => ({ data: [], error: null }),
  getFaqsByItem: (...a: unknown[]) => svc.getFaqs(...a),
  updateChunkSourcePages: vi.fn(),
  deleteFaq: (...a: unknown[]) => svc.deleteFaq(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(),
  getDocs: async () => ({ docs: [] }),
}))
vi.mock("@/lib/scanCapacity", () => ({ dueScans: () => [], unqueueScan: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({ startParse: vi.fn() }))
vi.mock("@/lib/manualReviewState", () => ({ itemManualState: () => ({ hasManual: false }) }))
vi.mock("@/hooks/useItemManuals", () => {
  const live = { manuals: [], status: "ready", error: null, watched: new Set(), retry: () => {} }
  return { useItemManuals: () => live }
})
vi.mock("@/hooks/useNotificationsBlocked", () => ({ useNotificationsBlocked: () => false }))
vi.mock("@/hooks/useIsDesktop", () => ({ useIsDesktop: () => false }))
vi.mock("@/hooks/useManualManagement", () => {
  const mgmt = {
    parsePhase: false, parsingManualId: null, deletingManualId: null, startedReadPending: () => false,
    parseNotice: null, parseError: null, parseReceipt: null, setParseError: () => {}, setParseReceipt: () => {},
    addManualOpen: false, setAddManualOpen: () => {}, addMode: "upload", addRole: "primary", setAddRole: () => {},
    titleInput: "", setTitleInput: () => {}, labelInput: "", setLabelInput: () => {}, addError: null,
    setAddError: () => {}, addLoading: false, handleOpenAddManual: () => {}, handleAddManual: () => {},
    handleReadManual: () => {}, handleFillGaps: () => {}, handleDeleteManual: () => {},
  }
  return { useManualManagement: () => mgmt, useManualUrls: () => ({}) }
})
// The item view, as a stand-in: what it shows of the item, and one of its own
// saves (the name) — made with the props of the render it was tapped in, and
// handed back through onItemUpdate when it answers, as RefinedItemDetail does.
vi.mock("@/components/home/RefinedItemDetail", () => ({
  RefinedItemDetail: (p: { item: ItemUnit; onItemUpdate?: (i: ItemUnit) => void; recordsSlot: React.ReactNode }) => (
    <div>
      <h1>{p.item.display_name}</h1>
      <p>Room: {p.item.room_id ?? "none"} · Category: {p.item.item_category ?? "none"}</p>
      <button
        type="button"
        onClick={() => {
          const { item, onItemUpdate } = p
          void svc.saveName(item).then((saved: ItemUnit) => onItemUpdate?.(saved))
        }}
      >
        save the name
      </button>
      {p.recordsSlot}
    </div>
  ),
}))
vi.mock("@/components/home/RoomPickerDialog", () => ({
  RoomPickerDialog: (p: { onPick: (roomId: string | null) => void }) => (
    <button type="button" onClick={() => p.onPick("room-garage")}>pick the garage</button>
  ),
}))
vi.mock("@/components/home/CategoryPickerDialog", () => ({
  CategoryPickerDialog: (p: { onPick: (category: string, subType: string | null) => void }) => (
    <button type="button" onClick={() => p.onPick("small_appliance", null)}>pick small appliance</button>
  ),
}))
vi.mock("@/components/manuals/ParsePickupCard", () => ({ ParsePickupCard: () => null }))
vi.mock("@/components/manuals/ReviewItemTasksButton", () => ({ ReviewItemTasksButton: () => null }))
vi.mock("@/components/home/DesktopItemDetail", () => ({ DesktopItemDetail: () => null }))
vi.mock("@/components/item-care/ItemDetailsSheet", () => ({ ItemDetailsSheet: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
// The real saved Q&A section; the rest of the records half as nothing.
vi.mock("./item-detail", async () => ({
  KnowledgeSection: (await vi.importActual<typeof import("./item-detail/KnowledgeSection")>("./item-detail/KnowledgeSection")).KnowledgeSection,
  HeroCard: () => null, ManualSection: () => null, SpecsSection: () => null, HistorySection: () => null,
}))

const { default: ItemDetailPage } = await import("./ItemDetailPage")

const ITEMS: Record<string, ItemUnit> = {
  "item-a": { item_unit_id: "item-a", home_id: "home-1", display_name: "Dishwasher", room_id: null, item_category: null } as ItemUnit,
  "item-b": { item_unit_id: "item-b", home_id: "home-1", display_name: "Fridge", room_id: null, item_category: null } as ItemUnit,
}
const faq = (id: string, item: string, question: string): ChatFaq =>
  ({ faq_id: id, home_id: "home-1", item_unit_id: item, question, answer: "Yes.", created_at: "2026-09-01" })
const FAQS: Record<string, ChatFaq[]> = {
  "item-a": [faq("fa1", "item-a", "Can it run a half load?"), faq("fa2", "item-a", "Where is the filter?")],
  "item-b": [faq("fb1", "item-b", "How cold should it be?")],
}

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

function GoToItemB() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate("/items/item-b")}>go to item b</button>
}
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/items/item-a"]}>
      <GoToItemB />
      <Routes>
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/inventory" element={<p>the items list</p>} />
      </Routes>
    </MemoryRouter>,
  )
/** Item A's page, then the move to item B's — B's page fully shown. `hidden`:
 *  with A's delete confirmation open the page behind it is aria-hidden, and the
 *  move then comes from outside it (a push, the back swipe). */
async function moveToItemB() {
  fireEvent.click(screen.getByRole("button", { name: "go to item b", hidden: true }))
  expect(await screen.findByRole("heading", { name: "Fridge", hidden: true })).toBeInTheDocument()
}
function expectItemBUntouched() {
  expect(screen.getByRole("heading", { name: "Fridge" })).toBeInTheDocument()
  expect(screen.queryByRole("heading", { name: /Dishwasher/ })).toBeNull()
  expect(screen.getByText("Room: none · Category: none")).toBeInTheDocument()
  expect(screen.queryByText(/Could not/)).toBeNull()
  expect(screen.queryByText("the items list")).toBeNull()
}

beforeEach(() => {
  vi.clearAllMocks()
  svc.getItemUnit.mockImplementation(async (_h: string, id: string) => ({ data: ITEMS[id], error: null }))
  svc.getFaqs.mockImplementation(async (_h: string, id: string) => ({ data: FAQS[id], error: null }))
})

describe("ItemDetailPage — a save for the last item lands nowhere", () => {
  it("an edit to item A, answering after the move to item B, leaves B's page showing B", async () => {
    const save = deferred<ItemUnit>()
    svc.saveName.mockReturnValue(save.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "save the name" }))

    await moveToItemB()
    await act(async () => { save.resolve({ ...ITEMS["item-a"], display_name: "Dishwasher (kitchen)" }) })

    expectItemBUntouched()
  })

  it("on the same item, the edit still lands (control)", async () => {
    const save = deferred<ItemUnit>()
    svc.saveName.mockReturnValue(save.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "save the name" }))

    await act(async () => { save.resolve({ ...ITEMS["item-a"], display_name: "Dishwasher (kitchen)" }) })
    expect(screen.getByRole("heading", { name: "Dishwasher (kitchen)" })).toBeInTheDocument()
  })

  it.each([
    ["the room", "pick the garage", { ...ITEMS["item-a"], room_id: "room-garage" }],
    ["the category", "pick small appliance", { ...ITEMS["item-a"], item_category: "small_appliance" }],
  ] as const)("%s changed on A and saved after the move: B's page stays B's", async (_what, pick, saved) => {
    const update = deferred<{ data: ItemUnit | null; error: { message: string } | null }>()
    svc.updateItemUnit.mockReturnValue(update.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: pick }))

    await moveToItemB()
    await act(async () => { update.resolve({ data: saved as ItemUnit, error: null }) })

    expect(svc.updateItemUnit).toHaveBeenCalledWith("home-1", "item-a", expect.anything())
    expectItemBUntouched()
  })

  it.each([
    ["the room", "pick the garage"],
    ["the category", "pick small appliance"],
  ] as const)("%s change on A failing after the move: neither A's old copy nor A's error lands on B — it is logged", async (what, pick) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const update = deferred<{ data: ItemUnit | null; error: { message: string } | null }>()
    svc.updateItemUnit.mockReturnValue(update.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: pick }))

    await moveToItemB()
    await act(async () => { update.resolve({ data: null, error: { message: "unavailable" } }) })

    expectItemBUntouched()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`${what.replace("the ", "")} of item item-a`)), "unavailable")
  })

  it("a change on the same item that fails still puts the item back and says so (control)", async () => {
    svc.updateItemUnit.mockResolvedValue({ data: null, error: { message: "unavailable" } })
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "pick the garage" }))

    expect(await screen.findByText("Could not change the room: unavailable")).toBeInTheDocument()
    expect(screen.getByText("Room: none · Category: none")).toBeInTheDocument()
  })

  it("a delete of A answering after the move to B: the person stays on B, and nothing asks to delete B", async () => {
    const del = deferred<{ success: true }>()
    svc.softDeleteItemUnit.mockReturnValue(del.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))
    expect(screen.getByRole("button", { name: "Deleting..." })).toBeDisabled()

    await moveToItemB()
    // A's confirmation ended with the move — it never reads "Delete Fridge?".
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByText("Delete Fridge?")).toBeNull()

    await act(async () => { del.resolve({ success: true }) })
    expect(svc.softDeleteItemUnit).toHaveBeenCalledWith("home-1", "item-a")
    expectItemBUntouched()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("a delete of A failing after the move says nothing on B — it is logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const del = deferred<{ success: false; error: string }>()
    svc.softDeleteItemUnit.mockReturnValue(del.promise)
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    await moveToItemB()
    await act(async () => { del.resolve({ success: false, error: "unavailable" }) })

    expectItemBUntouched()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("could not delete item item-a"), "unavailable")
  })

  it("a delete on the same item still closes and goes to the items list (control)", async () => {
    svc.softDeleteItemUnit.mockResolvedValue({ success: true })
    renderPage()
    expect(await screen.findByRole("heading", { name: "Dishwasher" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Delete item" }))
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))
    expect(await screen.findByText("the items list")).toBeInTheDocument()
  })

  it("a saved Q&A deleted on A, answering after the move to B, leaves B's saved Q&A", async () => {
    const del = deferred<{ data: true; error: null }>()
    svc.deleteFaq.mockReturnValue(del.promise)
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Saved Q&A (2)" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Delete saved Q&A" })[0])

    await moveToItemB()
    fireEvent.click(await screen.findByRole("button", { name: "Saved Q&A (1)" }))
    expect(screen.getByText("How cold should it be?")).toBeInTheDocument()

    await act(async () => { del.resolve({ data: true, error: null }) })
    expect(svc.deleteFaq).toHaveBeenCalledWith("home-1", "fa1")
    expect(screen.getByRole("button", { name: "Saved Q&A (1)" })).toBeInTheDocument()
    expect(screen.getByText("How cold should it be?")).toBeInTheDocument()
    expect(screen.queryByText("Where is the filter?")).toBeNull()
  })

  it("a saved Q&A deleted on the same item leaves the list (control)", async () => {
    svc.deleteFaq.mockResolvedValue({ data: true, error: null })
    renderPage()
    fireEvent.click(await screen.findByRole("button", { name: "Saved Q&A (2)" }))
    fireEvent.click(screen.getAllByRole("button", { name: "Delete saved Q&A" })[0])

    expect(await screen.findByRole("button", { name: "Saved Q&A (1)" })).toBeInTheDocument()
    expect(screen.queryByText("Can it run a half load?")).toBeNull()
    expect(screen.getByText("Where is the filter?")).toBeInTheDocument()
  })
})
