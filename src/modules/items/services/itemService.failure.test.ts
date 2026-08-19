/**
 * Failure-path coverage for the add-appliance and delete-item writes.
 *
 * These two flows live inside 600–700 line page components (SmartAddItem's
 * wizard, ItemDetailPage), so the assertion here is at the service boundary
 * rather than the rendered page — driving a multi-step wizard to its save step
 * through fifteen mocked modules tests the mocks more than the code.
 *
 * What is asserted is the thing the pages depend on to show anything at all:
 * when the write fails, the service returns an ERROR shape and never a
 * success-shaped result. Both call sites branch on exactly that —
 *
 *   SmartAddItem:    if (result.error) { setError(result.error.message); return }
 *   ItemDetailPage:  if (result.success) { navigate(...) } else { setError(...) }
 *
 * — so a service that swallowed the throw and returned `{ data: null, error:
 * null }` would send the user to the inventory list believing a delete
 * happened, or close the wizard on an item that was never created. That is the
 * failure this file exists to prevent.
 *
 * The user-visible half of the same guarantee is covered at the component level
 * for the flows whose surfaces were actually swallowing errors:
 * HomeMembersSection.failure.test.tsx and RefinedWeek.failure.test.tsx.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const commit = vi.fn()
const getDocs = vi.fn()
const getDoc = vi.fn()

vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({})),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "ts"),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  writeBatch: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    commit: (...a: unknown[]) => commit(...a),
  })),
  // A real class: the row mappers use `instanceof Timestamp`, and an object
  // literal there throws "Right-hand side of 'instanceof' is not callable"
  // inside the try, which would make every test pass for the wrong reason.
  Timestamp: class { toDate() { return new Date(0) } },
}))

import { createItemUnit, softDeleteItemUnit } from "./itemService"

const INPUT = {
  home_id: "home-1",
  room_id: null,
  display_name: "Furnace",
  category: "furnace",
  item_category: "system" as const,
  sub_type: "furnace",
  category_fields: {},
  brand: null, model: null, serial_number: null,
  purchase_date: null, price_paid: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  getDocs.mockResolvedValue({ docs: [] })
  getDoc.mockResolvedValue({ data: () => ({}) })
})

describe("createItemUnit — a failed write is never reported as a created item", () => {
  it("write rejects → error shape, no data", async () => {
    commit.mockRejectedValue(new Error("PERMISSION_DENIED: insufficient permissions"))

    const res = await createItemUnit(INPUT)

    expect(res.error).toBeTruthy()
    expect(res.error?.message).toMatch(/permission/i)
    // The page reads `result.data` right after the error branch; a null-data,
    // null-error result would fall through as a created item with no id.
    expect(res.data).toBeNull()
  })

  it("write succeeds → data, and error is explicitly null (the control case)", async () => {
    commit.mockResolvedValue(undefined)

    const res = await createItemUnit(INPUT)

    expect(res.error).toBeNull()
    expect(res.data).not.toBeNull()
  })
})

describe("softDeleteItemUnit — a failed delete is never reported as success", () => {
  it("write rejects → success:false with a message", async () => {
    commit.mockRejectedValue(new Error("network unreachable"))

    const res = await softDeleteItemUnit("home-1", "item-1")

    expect(res.success).toBe(false)
    if (!res.success) expect(res.error).toMatch(/network/i)
  })

  it("the cascade query rejects → still success:false, not a partial success", async () => {
    // The task-template sweep runs BEFORE commit. If it throws and the function
    // reported success anyway, the item would vanish from the list while its
    // tasks kept generating instances against a deleted item.
    getDocs.mockRejectedValue(new Error("index missing"))

    const res = await softDeleteItemUnit("home-1", "item-1")

    expect(res.success).toBe(false)
  })

  it("write succeeds → success:true (the control case)", async () => {
    commit.mockResolvedValue(undefined)

    const res = await softDeleteItemUnit("home-1", "item-1")

    expect(res.success).toBe(true)
  })
})
