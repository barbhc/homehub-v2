/**
 * The product lookup after it left the add screen (round 18).
 *
 * The contract these pin, from the approved mockup and the owner's decisions:
 * category fills silently but only a blank; the composed "Brand Model"
 * placeholder is renamed to the KIND of thing while a typed name is never
 * touched; specs are stored as suggestions rather than applied; and a miss
 * writes nothing at all — the item page must have no way to know a search
 * even happened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { ItemUnit } from "@/integrations/types"

const lookupProduct = vi.fn()
const updateItemUnit = vi.fn()
const getItemUnit = vi.fn()
const getItemUnits = vi.fn()
const getRooms = vi.fn()

vi.mock("@/modules/inventory/services/productLookupService", () => ({
  lookupProduct: (...a: unknown[]) => lookupProduct(...a),
}))
vi.mock("@/modules/items", () => ({
  updateItemUnit: (...a: unknown[]) => updateItemUnit(...a),
  getItemUnit: (...a: unknown[]) => getItemUnit(...a),
  getItemUnits: (...a: unknown[]) => getItemUnits(...a),
}))
vi.mock("@/modules/home", () => ({
  getRooms: (...a: unknown[]) => getRooms(...a),
}))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))

import { runPostCreateLookup } from "./postCreateLookup"

/** Looks `item` up with the item unchanged when the answer lands — the common
 *  case. The lookup re-reads the item before it writes (see the last block). */
const run = (item: ItemUnit) => {
  getItemUnit.mockResolvedValue({ data: item, error: null })
  return runPostCreateLookup(item)
}

const baseItem = (over: Partial<ItemUnit> = {}): ItemUnit =>
  ({
    item_unit_id: "i1",
    home_id: "h1",
    room_id: "r-kitchen",
    display_name: "Fisher & Paykel DD24DAX9",
    category: "other",
    item_category: null,
    sub_type: null,
    category_fields: null,
    brand: "Fisher & Paykel",
    model: "DD24DAX9",
    serial_number: null,
    purchase_date: null,
    install_date: null,
    status: "active",
    notes: null,
    photo_storage_ref: null,
    store_name: null,
    price_paid: null,
    receipt_storage_path: null,
    warranty_duration_months: null,
    warranty_coverage: null,
    warranty_expiry_date: null,
    manufactured_year: null,
    recall_status: null,
    recall_checked_at: null,
    recall_notes: null,
    tags: [],
    created_at: "",
    updated_at: "",
    deleted_at: null,
    ...over,
  }) as ItemUnit

const found = (over: Record<string, unknown> = {}) => ({
  data: {
    safe: { category: null, subType: null },
    candidates: [],
    knowledgeConfidence: "high",
    identity: { name: "DD24DAX9 Dishwasher", rawCategory: "dishwasher", source: "icecat", confidence: "high" },
    variantCandidates: [],
    source: "llm",
    cacheHit: false,
    ...over,
  },
  error: null,
})

beforeEach(() => {
  vi.clearAllMocks()
  updateItemUnit.mockResolvedValue({ data: {}, error: null })
  getItemUnits.mockResolvedValue({ data: [], error: null })
  getRooms.mockResolvedValue({ data: [{ room_id: "r-kitchen", name: "Kitchen" }], error: null })
})

describe("runPostCreateLookup", () => {
  it("a miss writes NOTHING — the page cannot know a search happened", async () => {
    lookupProduct.mockResolvedValue(found({ identity: null, candidates: [] }))
    await run(baseItem())
    expect(updateItemUnit).not.toHaveBeenCalled()
  })

  it("an error writes nothing and does not throw", async () => {
    lookupProduct.mockResolvedValue({ data: null, error: { message: "quota" } })
    await expect(run(baseItem())).resolves.toBeUndefined()
    expect(updateItemUnit).not.toHaveBeenCalled()
  })

  it("category fills a blank silently, and the placeholder name becomes the kind of thing", async () => {
    lookupProduct.mockResolvedValue(found())
    await run(baseItem())
    const updates = updateItemUnit.mock.calls[0][2]
    expect(updates.item_category).toBe("major_appliance")
    expect(updates.display_name).toBe("Dishwasher")
  })

  it("appends the room only when the plain name is taken", async () => {
    getItemUnits.mockResolvedValue({ data: [{ item_unit_id: "other", display_name: "Dishwasher" }], error: null })
    lookupProduct.mockResolvedValue(found())
    await run(baseItem())
    expect(updateItemUnit.mock.calls[0][2].display_name).toBe("Dishwasher — Kitchen")
  })

  it("never renames an item the user named themselves", async () => {
    lookupProduct.mockResolvedValue(found())
    await run(baseItem({ display_name: "Beer fridge" }))
    expect(updateItemUnit.mock.calls[0][2].display_name).toBeUndefined()
  })

  it("never overwrites a category the user chose — and then leaves the name alone too", async () => {
    lookupProduct.mockResolvedValue(found())
    await run(baseItem({ item_category: "small_appliance", sub_type: "kettle" }))
    const updates = updateItemUnit.mock.calls.length ? updateItemUnit.mock.calls[0][2] : {}
    expect(updates.item_category).toBeUndefined()
    expect(updates.display_name).toBeUndefined()
  })

  it("stores specs as suggestions, never as category_fields", async () => {
    lookupProduct.mockResolvedValue(
      found({ candidates: [{ key: "filter_type", label: "Filter type", value: "HEPA", rationale: null }] }),
    )
    await run(baseItem())
    const updates = updateItemUnit.mock.calls[0][2]
    expect(updates.lookup_suggestions).toEqual([{ key: "filter_type", label: "Filter type", value: "HEPA" }])
    expect(updates.category_fields).toBeUndefined()
  })

  it("refuses off-schema keys and keys that already hold a value", async () => {
    lookupProduct.mockResolvedValue(
      found({
        candidates: [
          { key: "power", label: "Power (W)", value: 700, rationale: null },          // not in any schema
          { key: "filter_type", label: "Filter type", value: "HEPA", rationale: null }, // already filled
        ],
      }),
    )
    await run(baseItem({ category_fields: { filter_type: "charcoal" } }))
    expect(updateItemUnit.mock.calls[0][2].lookup_suggestions).toBeUndefined()
  })

  it("skips entirely without a usable brand+model", async () => {
    await run(baseItem({ brand: "", model: "X" }))
    expect(lookupProduct).not.toHaveBeenCalled()
  })
})

/**
 * The lookup takes seconds; the item does not stand still while it runs. Its
 * findings are applied to the item as it is when they LAND, never to the
 * snapshot it started from.
 */
describe("runPostCreateLookup — decided against the item as it is now", () => {
  it("writes nothing when the add flow re-identified the item meanwhile (HH-130)", async () => {
    // Back from the manual step, the model corrected, "Add the manual" again:
    // the item is now a different product, and this lookup was for the old one.
    lookupProduct.mockResolvedValue(found())
    getItemUnit.mockResolvedValue({ data: baseItem({ model: "DD24DAX9-B", display_name: "Fisher & Paykel DD24DAX9-B" }), error: null })
    await runPostCreateLookup(baseItem())
    expect(updateItemUnit).not.toHaveBeenCalled()
  })

  it("keeps a name the owner gave it on the item page while the lookup was out (HH-125)", async () => {
    lookupProduct.mockResolvedValue(found())
    getItemUnit.mockResolvedValue({ data: baseItem({ display_name: "Upstairs dishwasher" }), error: null })
    await runPostCreateLookup(baseItem())
    const updates = updateItemUnit.mock.calls[0][2]
    expect(updates.display_name).toBeUndefined()
    // The category was still blank, so it is still filled.
    expect(updates.item_category).toBe("major_appliance")
  })

  it("does not overwrite a category chosen while the lookup was out", async () => {
    lookupProduct.mockResolvedValue(found())
    getItemUnit.mockResolvedValue({ data: baseItem({ item_category: "small_appliance", sub_type: "kettle" }), error: null })
    await runPostCreateLookup(baseItem())
    const updates = updateItemUnit.mock.calls.length ? updateItemUnit.mock.calls[0][2] : {}
    expect(updates.item_category).toBeUndefined()
    expect(updates.display_name).toBeUndefined()
  })

  it("writes nothing to an item deleted while the lookup was out", async () => {
    lookupProduct.mockResolvedValue(found())
    getItemUnit.mockResolvedValue({ data: null, error: null })
    await runPostCreateLookup(baseItem())
    expect(updateItemUnit).not.toHaveBeenCalled()
  })

  it("writes nothing when the item cannot be re-read — never a guess", async () => {
    lookupProduct.mockResolvedValue(found())
    getItemUnit.mockResolvedValue({ data: null, error: { message: "offline" } })
    await expect(runPostCreateLookup(baseItem())).resolves.toBeUndefined()
    expect(updateItemUnit).not.toHaveBeenCalled()
  })
})
