/**
 * The room and name the add screen could not offer.
 *
 * From a real add: a Bosch dishwasher landed with no room and the name
 * "Bosch SHPM65Z55N/01". Both decisions are made from the item's TYPE at
 * creation, and since the lookup moved off the add screen the type usually
 * arrives afterwards — from the lookup or the manual parse. These re-offer
 * them once the answer exists.
 */
import { describe, it, expect } from "vitest"
import { lateRoomSuggestion, lateNameSuggestion } from "./lateSuggestions"
import type { ItemUnit, Room } from "@/integrations/types"

const rooms: Room[] = [
  { room_id: "r-kitchen", home_id: "h", name: "Kitchen", created_at: "", updated_at: "", deleted_at: null },
  { room_id: "r-laundry", home_id: "h", name: "Laundry Room", created_at: "", updated_at: "", deleted_at: null },
]

const item = (over: Partial<ItemUnit> = {}): ItemUnit =>
  ({
    item_unit_id: "i1", home_id: "h", room_id: null,
    display_name: "Bosch SHPM65Z55N/01", category: "dishwasher",
    item_category: "major_appliance", sub_type: "dishwasher", category_fields: null,
    brand: "Bosch", model: "SHPM65Z55N/01", serial_number: null,
    purchase_date: null, install_date: null, status: "active", notes: null,
    photo_storage_ref: null, store_name: null, price_paid: null, receipt_storage_path: null,
    warranty_duration_months: null, warranty_coverage: null, warranty_expiry_date: null,
    manufactured_year: null, recall_status: null, recall_checked_at: null, recall_notes: null,
    tags: [], created_at: "", updated_at: "", deleted_at: null, ...over,
  }) as ItemUnit

describe("lateRoomSuggestion", () => {
  it("offers the Kitchen for a dishwasher that has no room", () => {
    expect(lateRoomSuggestion(item(), rooms)?.name).toBe("Kitchen")
  })

  it("matches a home's own room name loosely", () => {
    // The hint is "Laundry"; the home calls it "Laundry Room".
    expect(lateRoomSuggestion(item({ sub_type: "dryer" }), rooms)?.name).toBe("Laundry Room")
  })

  it("says nothing once a room is set", () => {
    // Never second-guess a room the owner chose — only ever fill a blank.
    expect(lateRoomSuggestion(item({ room_id: "r-laundry" }), rooms)).toBeNull()
  })

  it("says nothing when the home has no matching room", () => {
    expect(lateRoomSuggestion(item(), [rooms[1]])).toBeNull()
  })

  it("says nothing without a sub-type — the case that started this", () => {
    expect(lateRoomSuggestion(item({ sub_type: null, item_category: null }), rooms)).toBeNull()
  })
})

describe("lateNameSuggestion", () => {
  it("offers the type when the name is still our Brand Model placeholder", () => {
    expect(lateNameSuggestion(item())).toBe("Dishwasher")
  })

  it("leaves a name the user typed alone", () => {
    // "Beer fridge" is a decision. Ours to respect, not to improve.
    expect(lateNameSuggestion(item({ display_name: "Beer fridge" }))).toBeNull()
  })

  it("says nothing when the name already IS the type", () => {
    expect(lateNameSuggestion(item({ display_name: "Dishwasher" }))).toBeNull()
  })

  it("says nothing without a category to name it by", () => {
    // All three cleared: categoryLabel also reads the legacy `category` slug,
    // so an item carrying only that one still HAS a usable type — and should
    // still be offered a name. Nulling item_category alone proves nothing.
    expect(lateNameSuggestion(item({ item_category: null, sub_type: null, category: "" }))).toBeNull()
  })

  it("still offers a name from the legacy category slug alone", () => {
    // Older items predate item_category/sub_type; they are not nameless.
    expect(lateNameSuggestion(item({ item_category: null, sub_type: null }))).toBe("Dishwasher")
  })
})
