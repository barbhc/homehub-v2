/**
 * identityWrite — what the add form writes, first time and on Back.
 *
 * HH-112: items added in the appliance lane were still being named "Brand
 * Model". IdentifyStep keeps a hidden name synced to "<brand> <model>" in that
 * lane, and the wizard passed it to composeItemName as if the user had typed
 * it — which wins outright — so the type-based name never applied.
 *
 * HH-130: Back from the manual step, then "Add the manual" again, created a
 * second item. The second confirm now re-identifies the first.
 */
import { describe, it, expect } from "vitest"
import type { ItemUnit } from "@/integrations/types"
import { DEFAULT_IDENTIFY_DATA, type IdentifyData } from "./IdentifyStep"
import { identityWrite, typedItemName } from "./identifyWrite"

const form = (over: Partial<IdentifyData> = {}): IdentifyData => ({ ...DEFAULT_IDENTIFY_DATA, ...over })

/** What the appliance lane holds after typing (or scanning) a brand and model:
 *  IdentifyStep has already synced the hidden name to "<brand> <model>". */
const appliance = (over: Partial<IdentifyData> = {}) =>
  form({ brand: "Coway", model: "AP-1512HH", name: "Coway AP-1512HH", ...over })

const saved = (over: Partial<ItemUnit> = {}): ItemUnit =>
  ({
    item_unit_id: "item-1",
    home_id: "h1",
    room_id: null,
    display_name: "Coway AP-1512HH",
    category: "other",
    item_category: null,
    sub_type: null,
    category_fields: {},
    brand: "Coway",
    model: "AP-1512HH",
    serial_number: null,
    purchase_date: null,
    price_paid: null,
    ...over,
  }) as ItemUnit

const first = (mode: "appliance" | "simple", data: IdentifyData, otherNames: string[] = []) =>
  identityWrite({ mode, data, current: null, roomName: null, otherNames })

describe("HH-112 — only a name the user typed is theirs", () => {
  it("the appliance lane's hidden 'Brand Model' is never a typed name", () => {
    expect(typedItemName("appliance", { name: "Coway AP-1512HH" })).toBeNull()
    expect(typedItemName("simple", { name: "  Beer fridge " })).toBe("Beer fridge")
    expect(typedItemName("simple", { name: "   " })).toBeNull()
  })

  it("category known at creation (a label scan filled it): the item is named for what it IS", () => {
    const w = first("appliance", appliance({ itemCategory: "small_appliance", subType: "air-purifier" }))
    expect(w.fields.display_name).toBe("Air purifier")
    // The model number stays on the record, where it belongs.
    expect(w.fields.brand).toBe("Coway")
    expect(w.fields.model).toBe("AP-1512HH")
  })

  it("category blank: the exact 'Brand Model' placeholder the lookup knows is ours to rename", () => {
    const w = first("appliance", appliance())
    // postCreateLookup renames only `${brand} ${model}` — byte for byte.
    expect(w.fields.display_name).toBe(`${w.fields.brand} ${w.fields.model}`)
  })

  it("a type that is already taken gets the room, as composeItemName decides", () => {
    const w = identityWrite({
      mode: "appliance",
      data: appliance({ itemCategory: "small_appliance", subType: "air-purifier" }),
      current: null,
      roomName: "Bedroom",
      otherNames: ["Air purifier"],
    })
    expect(w.fields.display_name).toBe("Air purifier — Bedroom")
  })

  it("the simple lane's visible name wins, even when the category is known", () => {
    const w = first("simple", form({ name: "Beer fridge", itemCategory: "major_appliance", subType: "refrigerator" }))
    expect(w.fields.display_name).toBe("Beer fridge")
  })

  it("saves what a scan already read — date, price, serial — with the item", () => {
    const w = first("appliance", appliance({ serialNumber: " QX44-778812 ", purchaseDate: "2026-05-01", purchasePrice: 199 }))
    expect(w.fields.serial_number).toBe("QX44-778812")
    expect(w.fields.purchase_date).toBe("2026-05-01")
    expect(w.fields.price_paid).toBe(199)
  })
})

describe("HH-130 — Back, then 'Add the manual' again, re-identifies the same item", () => {
  it("unchanged: keeps the category and name the lookup filled in", () => {
    // The lookup came back between the two presses: category filled, the
    // placeholder renamed. Nothing on the form changed.
    const current = saved({
      display_name: "Air purifier",
      item_category: "small_appliance",
      sub_type: "air-purifier",
      category: "air-purifier",
    })
    const w = identityWrite({ mode: "appliance", data: appliance(), current, roomName: null, otherNames: [] })
    expect(w.sameProduct).toBe(true)
    expect(w.fields.item_category).toBe("small_appliance")
    expect(w.fields.sub_type).toBe("air-purifier")
    expect(w.fields.category).toBe("air-purifier")
    expect(w.fields.display_name).toBe("Air purifier")
  })

  it("its own name is not a collision with itself", () => {
    const current = saved({ display_name: "Air purifier", item_category: "small_appliance", sub_type: "air-purifier" })
    // otherNames excludes this item (the caller filters it out); another item
    // called something else does not change anything.
    const w = identityWrite({ mode: "appliance", data: appliance(), current, roomName: "Bedroom", otherNames: ["Dishwasher"] })
    expect(w.fields.display_name).toBe("Air purifier")
  })

  it("a corrected model is a different product: the old lookup's category does not survive", () => {
    const current = saved({ display_name: "Air purifier", item_category: "small_appliance", sub_type: "air-purifier" })
    const w = identityWrite({
      mode: "appliance",
      data: appliance({ model: "AP-1512HHB", name: "Coway AP-1512HHB" }),
      current,
      roomName: null,
      otherNames: [],
    })
    expect(w.sameProduct).toBe(false)
    expect(w.fields.item_category).toBeNull()
    expect(w.fields.sub_type).toBeNull()
    expect(w.fields.model).toBe("AP-1512HHB")
    // Back to the placeholder, so the fresh lookup can name it.
    expect(w.fields.display_name).toBe("Coway AP-1512HHB")
  })

  it("a category on the form (a scan after Back) is the user's, and wins over the kept one", () => {
    const current = saved({ item_category: "small_appliance", sub_type: "kettle" })
    const w = identityWrite({
      mode: "appliance",
      data: appliance({ itemCategory: "small_appliance", subType: "air-purifier" }),
      current,
      roomName: null,
      otherNames: [],
    })
    expect(w.fields.sub_type).toBe("air-purifier")
    expect(w.fields.display_name).toBe("Air purifier")
  })
})
