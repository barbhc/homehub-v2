/**
 * The add wizard's confirm, driven through the real screens.
 *
 * HH-130: "Add the manual" → Back → "Add the manual" again created a SECOND
 * item and orphaned the first. Here the Back button is pressed for real, and
 * the second confirm must update the item the first one made.
 *
 * HH-112: appliance-lane items were saved as "Brand Model" because the hidden
 * name IdentifyStep syncs to "<brand> <model>" reached composeItemName as a
 * typed name. A label scan that knows the category must now name the item for
 * what it is — and with no category, the placeholder must be exactly the one
 * the (real) post-create lookup renames.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import type { ItemUnit } from "@/integrations/types"

const svc = vi.hoisted(() => ({
  createItemUnit: vi.fn(),
  updateItemUnit: vi.fn(),
  getItemUnit: vi.fn(),
  getItemUnits: vi.fn(),
  getRooms: vi.fn(),
  lookupProduct: vi.fn(),
  extractFromImage: vi.fn(),
}))

vi.mock("@/modules/items", () => ({
  createItemUnit: (...a: unknown[]) => svc.createItemUnit(...a),
  updateItemUnit: (...a: unknown[]) => svc.updateItemUnit(...a),
  getItemUnit: (...a: unknown[]) => svc.getItemUnit(...a),
  getItemUnits: (...a: unknown[]) => svc.getItemUnits(...a),
}))
vi.mock("@/modules/home", () => ({
  useCurrentPropertyCompat: () => ({ property: { id: "h1", name: "Home" }, loading: false, refresh: vi.fn() }),
  useCurrentHome: () => ({ home: { home_id: "h1", name: "Home" } }),
  getRooms: (...a: unknown[]) => svc.getRooms(...a),
  createRoom: vi.fn(),
}))
vi.mock("@/modules/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }))
// The REAL post-create lookup runs; only its network call is stubbed.
vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: (...a: unknown[]) => svc.lookupProduct(...a),
  lookupBrandForModel: vi.fn().mockResolvedValue(null),
}))
vi.mock("@/modules/inventory/services/ocrService", () => ({
  extractFromImage: (...a: unknown[]) => svc.extractFromImage(...a),
  isEmptyOcrExtraction: () => false,
}))
vi.mock("@/lib/downscaleImage", () => ({ downscaleImage: async (f: File) => f }))
vi.mock("@/modules/inventory/services/storageService", () => ({
  MAX_UPLOAD_BYTES: 50 * 1024 * 1024,
  uploadManualPdf: vi.fn(),
  removeManualPdf: vi.fn(),
  uploadItemPhoto: vi.fn().mockResolvedValue({ data: null, error: null }),
}))
vi.mock("@/integrations/firebase", () => ({ resolveStorageUrl: vi.fn(), db: {}, callable: () => vi.fn() }))
vi.mock("@/modules/knowledge/services/manualDocumentService", () => ({ deleteManualDocument: vi.fn() }))
vi.mock("@/modules/knowledge", () => ({ createManualDocument: vi.fn(), detectDocType: vi.fn() }))
vi.mock("@/modules/knowledge/services/parseManualService", () => ({ startParse: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("@/hooks/useAutoFindManuals", () => ({ useAutoFindManuals: () => [false, vi.fn()] }))
vi.mock("@/components/smart-add/FindManualCard", () => ({ FindManualCard: () => null }))

const { default: SmartAddItem } = await import("./SmartAddItem")
const { getWizardSession } = await import("@/lib/wizardSession")

/** The item the emulated Firestore holds: whatever the last write made it. */
let stored: ItemUnit | null = null
const asItem = (id: string, fields: Record<string, unknown>): ItemUnit =>
  ({ item_unit_id: id, home_id: "h1", status: "active", tags: [], ...(stored ?? {}), ...fields }) as ItemUnit

const MISS = {
  data: { safe: { category: null, subType: null }, candidates: [], identity: null, variantCandidates: [], cacheHit: false },
  error: null,
}
const FOUND_AIR_PURIFIER = {
  data: {
    safe: { category: null, subType: null },
    candidates: [],
    identity: { name: "Coway Airmega", rawCategory: "air purifier", source: "icecat", confidence: "high" },
    variantCandidates: [],
    cacheHit: false,
  },
  error: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  stored = null
  svc.getRooms.mockResolvedValue({ data: [], error: null })
  svc.getItemUnits.mockImplementation(async () => ({ data: stored ? [stored] : [], error: null }))
  svc.getItemUnit.mockImplementation(async () => ({ data: stored, error: null }))
  svc.createItemUnit.mockImplementation(async (input: Record<string, unknown>) => {
    const fields = Object.fromEntries(Object.entries(input).filter(([k]) => k !== "home_id"))
    stored = asItem("item-1", fields)
    return { data: stored, error: null }
  })
  svc.updateItemUnit.mockImplementation(async (_h: string, id: string, fields: Record<string, unknown>) => {
    stored = asItem(id, fields)
    return { data: stored, error: null }
  })
  svc.lookupProduct.mockResolvedValue(MISS)
})

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/inventory/add"]}>
      <Routes>
        <Route path="/inventory/add" element={<SmartAddItem />} />
        <Route path="/items/:id" element={<p>item page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function typeApplianceAndConfirm(brand: string, model: string) {
  fireEvent.click(screen.getByRole("button", { name: /Appliance or device/ }))
  fireEvent.change(document.getElementById("identify-brand")!, { target: { value: brand } })
  fireEvent.change(document.getElementById("identify-model")!, { target: { value: model } })
  fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
  await screen.findByRole("heading", { name: "Add the manual" })
}

async function backAndConfirmAgain() {
  fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
  await screen.findByRole("button", { name: /^Add the manual$/ })
  fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
  await screen.findByRole("heading", { name: "Add the manual" })
}

describe("HH-130 — Back, then Add the manual again, is ONE item", () => {
  it("creates once, then updates that item on the second confirm", async () => {
    renderWizard()
    await typeApplianceAndConfirm("Coway", "AP-1512HH")
    expect(svc.createItemUnit).toHaveBeenCalledTimes(1)

    await backAndConfirmAgain()

    // Still exactly one create — the second press re-identified item-1.
    expect(svc.createItemUnit).toHaveBeenCalledTimes(1)
    expect(svc.getItemUnit).toHaveBeenCalledWith("h1", "item-1")
    expect(svc.updateItemUnit).toHaveBeenCalledTimes(1)
    const [home, id, fields] = svc.updateItemUnit.mock.calls[0]
    expect([home, id]).toEqual(["h1", "item-1"])
    expect(fields).toMatchObject({ brand: "Coway", model: "AP-1512HH", display_name: "Coway AP-1512HH" })
    // The wizard still holds the one item it made.
    expect(getWizardSession()?.itemId).toBe("item-1")
    // Same product: the lookup it already started is not paid for twice.
    await waitFor(() => expect(svc.lookupProduct).toHaveBeenCalledTimes(1))
  })

  it("a corrected model updates the same item, drops the old findings and looks the new one up", async () => {
    renderWizard()
    await typeApplianceAndConfirm("Coway", "AP-1512HH")

    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
    fireEvent.change(await screen.findByDisplayValue("AP-1512HH"), { target: { value: "AP-1512HHB" } })
    fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
    await screen.findByRole("heading", { name: "Add the manual" })

    expect(svc.createItemUnit).toHaveBeenCalledTimes(1)
    const fields = svc.updateItemUnit.mock.calls[0][2]
    expect(fields).toMatchObject({ model: "AP-1512HHB", display_name: "Coway AP-1512HHB", lookup_suggestions: null })
    // The subtitle carries what was just typed (HH-130's original ask).
    expect(screen.getByText("For your Coway AP-1512HHB.")).toBeInTheDocument()
    await waitFor(() => expect(svc.lookupProduct).toHaveBeenCalledTimes(2))
    expect(svc.lookupProduct.mock.calls[1][0]).toMatchObject({ brand: "Coway", model: "AP-1512HHB" })
  })

  it("an item that has gone meanwhile is replaced, never updated into nothing", async () => {
    renderWizard()
    await typeApplianceAndConfirm("Coway", "AP-1512HH")
    svc.getItemUnit.mockResolvedValueOnce({ data: null, error: null }) // deleted from another tab
    await backAndConfirmAgain()
    expect(svc.updateItemUnit).not.toHaveBeenCalled()
    expect(svc.createItemUnit).toHaveBeenCalledTimes(2)
  })

  it("a failed read of the item stops and says so — it does not guess and create a duplicate", async () => {
    renderWizard()
    await typeApplianceAndConfirm("Coway", "AP-1512HH")
    svc.getItemUnit.mockResolvedValueOnce({ data: null, error: { message: "Couldn't reach the server." } })
    fireEvent.click(screen.getByRole("button", { name: /^Back$/ }))
    fireEvent.click(await screen.findByRole("button", { name: /^Add the manual$/ }))
    expect(await screen.findByText("Couldn't reach the server.")).toBeInTheDocument()
    expect(svc.createItemUnit).toHaveBeenCalledTimes(1)
    expect(svc.updateItemUnit).not.toHaveBeenCalled()
  })
})

describe("HH-112 — the item is named for what it is, not its model number", () => {
  it("a label scan that knows the category names the item at creation", async () => {
    svc.extractFromImage.mockResolvedValue({
      data: { brand: "Coway", model: "AP-1512HH", name: "Coway AP-1512HH", category: "air purifier", docType: "nameplate", confidence: 0.9 },
      error: null,
    })
    renderWizard()
    fireEvent.click(screen.getByRole("button", { name: /Appliance or device/ }))
    const label = new File([new Uint8Array([1, 2, 3])], "label.png", { type: "image/png" })
    fireEvent.change(document.querySelector('input[type="file"][capture]')!, { target: { files: [label] } })
    await waitFor(() => expect((document.getElementById("identify-model") as HTMLInputElement).value).toBe("AP-1512HH"))
    // Let IdentifyStep's effects settle, as they have long before a person can
    // press the button: the hidden name is now synced to "Coway AP-1512HH" —
    // the value that used to reach composeItemName as a typed name.
    await act(async () => {})

    fireEvent.click(screen.getByRole("button", { name: /^Add the manual$/ }))
    await screen.findByRole("heading", { name: "Add the manual" })

    expect(svc.createItemUnit.mock.calls[0][0]).toMatchObject({
      display_name: "Air purifier",
      brand: "Coway",
      model: "AP-1512HH",
      item_category: "small_appliance",
      sub_type: "air-purifier",
    })
  })

  it("with no category, the placeholder is created and the post-create lookup renames it", async () => {
    svc.lookupProduct.mockResolvedValue(FOUND_AIR_PURIFIER)
    renderWizard()
    await typeApplianceAndConfirm("Coway", "AP-1512HH")

    expect(svc.createItemUnit.mock.calls[0][0]).toMatchObject({ display_name: "Coway AP-1512HH", item_category: null })
    await waitFor(() => expect(svc.updateItemUnit).toHaveBeenCalled())
    expect(svc.updateItemUnit.mock.calls[0][2]).toMatchObject({
      display_name: "Air purifier",
      item_category: "small_appliance",
    })
  })

  it("the simple lane keeps the name the user typed", async () => {
    renderWizard()
    fireEvent.click(screen.getByRole("button", { name: /Everything else/ }))
    fireEvent.change(document.getElementById("identify-name")!, { target: { value: "Beer fridge" } })
    fireEvent.click(screen.getByRole("button", { name: /^Add item$/ }))
    await screen.findByText("item page")
    expect(svc.createItemUnit.mock.calls[0][0]).toMatchObject({ display_name: "Beer fridge" })
  })
})
