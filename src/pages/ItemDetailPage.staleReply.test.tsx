/**
 * The item page's re-reads after a saved review land only on the item they
 * were read for (H4).
 *
 * Saving a review (the hand-off card's, or the Review tasks button's) re-reads
 * the item's tasks — and the hand-off's, its chunks too — and put whatever
 * came back into the page. The page stays mounted when it moves to another
 * item (/items/A → /items/B: the parse tray's "review ready" for B, say), so a
 * re-read of A answering after that move put A's tasks on B's page.
 *
 * The page itself is real here, with its real load (useItemDetailLoad); its
 * big children are stand-ins that show the tasks and fire the two callbacks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom"

type TasksRead = { data: { task_template_id: string; title: string }[]; error: null }
const svc = vi.hoisted(() => ({
  getItemUnit: vi.fn(),
  getTasks: vi.fn(),
  getChunks: vi.fn(),
  /** Per item: answers to hand the NEXT task reads, before the defaults. */
  queuedTasks: new Map<string, Promise<unknown>[]>(),
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
  softDeleteItemUnit: vi.fn(),
  updateItemUnit: vi.fn(),
}))
vi.mock("@/modules/care", () => ({ getTaskTemplatesWithSchedulesByItem: (...a: unknown[]) => svc.getTasks(...a) }))
vi.mock("@/modules/knowledge", () => ({
  getChunksByItem: (...a: unknown[]) => svc.getChunks(...a),
  getFaqsByItem: async () => ({ data: [], error: null }),
  updateChunkSourcePages: vi.fn(),
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
// The page's children, as stand-ins: the tasks it hands down, and the two doors.
vi.mock("@/components/home/RefinedItemDetail", () => ({
  RefinedItemDetail: (p: { tasks: { task_template_id: string; title: string }[]; handoffSlot: React.ReactNode; reviewAction: React.ReactNode }) => (
    <div>
      <ul>{p.tasks.map((t) => <li key={t.task_template_id}>{t.title}</li>)}</ul>
      {p.handoffSlot}
      {p.reviewAction}
    </div>
  ),
}))
vi.mock("@/components/manuals/ParsePickupCard", () => ({
  ParsePickupCard: (p: { onReviewSaved: () => void }) => <button type="button" onClick={p.onReviewSaved}>hand-off review saved</button>,
}))
vi.mock("@/components/manuals/ReviewItemTasksButton", () => ({
  ReviewItemTasksButton: (p: { onDone: () => void }) => <button type="button" onClick={p.onDone}>review tasks saved</button>,
}))
vi.mock("@/components/home/DesktopItemDetail", () => ({ DesktopItemDetail: () => null }))
vi.mock("@/components/item-care/ItemDetailsSheet", () => ({ ItemDetailsSheet: () => null }))
vi.mock("@/components/home/RoomPickerDialog", () => ({ RoomPickerDialog: () => null }))
vi.mock("@/components/home/CategoryPickerDialog", () => ({ CategoryPickerDialog: () => null }))
vi.mock("@/components/care/ManualDockPanel", () => ({ ManualDockPanel: () => null }))
vi.mock("./item-detail", () => ({
  HeroCard: () => null, ManualSection: () => null, KnowledgeSection: () => null,
  SpecsSection: () => null, HistorySection: () => null,
}))

const { default: ItemDetailPage } = await import("./ItemDetailPage")

const TASKS: Record<string, TasksRead> = {
  "item-a": { data: [{ task_template_id: "ta", title: "Replace the dishwasher filter" }], error: null },
  "item-b": { data: [{ task_template_id: "tb", title: "Vacuum the fridge coils" }], error: null },
}
const itemFor = (id: string) => ({ item_unit_id: id, display_name: id, brand: null, model: null, category: null })

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}
/** Hand item A's NEXT task read a reply that arrives when the test says. */
function holdNextTaskRead(itemId: string) {
  const d = deferred<TasksRead>()
  svc.queuedTasks.set(itemId, [...(svc.queuedTasks.get(itemId) ?? []), d.promise])
  return d
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
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  svc.queuedTasks.clear()
  svc.getItemUnit.mockImplementation(async (_h: string, id: string) => ({ data: itemFor(id), error: null }))
  svc.getTasks.mockImplementation((_h: string, id: string) => svc.queuedTasks.get(id)?.shift() ?? Promise.resolve(TASKS[id]))
  svc.getChunks.mockResolvedValue({ data: [], error: null })
})

describe("ItemDetailPage — a re-read for the last item lands nowhere", () => {
  it("the hand-off's re-read of item A, answering after the move to item B, leaves B's tasks", async () => {
    renderPage()
    expect(await screen.findByText("Replace the dishwasher filter")).toBeInTheDocument()
    const reread = holdNextTaskRead("item-a")
    fireEvent.click(screen.getByRole("button", { name: "hand-off review saved" }))

    fireEvent.click(screen.getByRole("button", { name: "go to item b" }))
    expect(await screen.findByText("Vacuum the fridge coils")).toBeInTheDocument()

    await act(async () => { reread.resolve(TASKS["item-a"]) })
    expect(screen.getByText("Vacuum the fridge coils")).toBeInTheDocument()
    expect(screen.queryByText("Replace the dishwasher filter")).toBeNull()
  })

  it("the Review tasks re-read of item A, answering after the move to item B, leaves B's tasks", async () => {
    renderPage()
    expect(await screen.findByText("Replace the dishwasher filter")).toBeInTheDocument()
    const reread = holdNextTaskRead("item-a")
    fireEvent.click(screen.getByRole("button", { name: "review tasks saved" }))

    fireEvent.click(screen.getByRole("button", { name: "go to item b" }))
    expect(await screen.findByText("Vacuum the fridge coils")).toBeInTheDocument()

    await act(async () => { reread.resolve(TASKS["item-a"]) })
    expect(screen.getByText("Vacuum the fridge coils")).toBeInTheDocument()
    expect(screen.queryByText("Replace the dishwasher filter")).toBeNull()
  })

  it("on the same item, the re-read still lands (control)", async () => {
    renderPage()
    expect(await screen.findByText("Replace the dishwasher filter")).toBeInTheDocument()
    const reread = holdNextTaskRead("item-a")
    fireEvent.click(screen.getByRole("button", { name: "review tasks saved" }))

    await act(async () => {
      reread.resolve({ data: [{ task_template_id: "ta2", title: "Clean the spray arms" }], error: null })
    })
    expect(screen.getByText("Clean the spray arms")).toBeInTheDocument()
  })
})
