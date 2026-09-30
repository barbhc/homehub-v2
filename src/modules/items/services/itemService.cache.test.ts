/**
 * The item service is the seam that keeps the cached Items list honest.
 *
 * ItemDetailPage deletes an item and navigates straight to /inventory; the list
 * there is now cached (useHomeItems), so unless the delete itself patches the
 * cache, the deleted item is painted from it until the refetch lands. The page
 * isn't the place for the patch — every create/update/delete caller would need
 * to remember — so the service does it, and only after the write succeeded.
 *
 * Asserted through the persisted snapshot (what the next launch paints) with a
 * snapshot seeded as an earlier launch would have left it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { mutate } from "swr"
import type { ItemUnit } from "@/integrations/types"

const commit = vi.fn()
const getDocs = vi.fn()
const getDoc = vi.fn()

vi.mock("@/integrations/firebase", () => ({ db: {} }))
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }))
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, path?: string) => ({ id: path ? path.split("/").pop() : "new-id" })),
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "ts"),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  writeBatch: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    commit: (...a: unknown[]) => commit(...a),
  })),
  Timestamp: class { toDate() { return new Date(0) } },
}))

const { createItemUnit, updateItemUnit, softDeleteItemUnit } = await import("./itemService")
const { persistSwrSnapshot, readPersistedSwrFallback } = await import("@/lib/swrPersist")

const KEY = "items:v1:home-1"
const row = (id: string, name: string) =>
  ({ item_unit_id: id, home_id: "home-1", room_id: null, display_name: name, status: "active", deleted_at: null }) as ItemUnit
const listed = () => (readPersistedSwrFallback()[KEY] as { items: ItemUnit[] } | undefined)?.items.map((i) => i.display_name)

beforeEach(async () => {
  vi.clearAllMocks()
  localStorage.clear()
  // A fresh session: nothing in SWR's in-memory cache (the patches write there
  // too), only the snapshot an earlier launch persisted.
  await mutate(() => true, undefined, { revalidate: false })
  persistSwrSnapshot(KEY, { items: [row("furnace", "Furnace"), row("fridge", "Fridge")], rooms: [] })
  getDocs.mockResolvedValue({ docs: [] })
})

describe("softDeleteItemUnit patches the cached list", () => {
  it("a successful delete takes the item off the list before the caller navigates to it", async () => {
    commit.mockResolvedValue(undefined)
    const res = await softDeleteItemUnit("home-1", "furnace")
    expect(res.success).toBe(true)
    expect(listed()).toEqual(["Fridge"])
  })

  it("a failed delete leaves the list alone — the item still exists", async () => {
    commit.mockRejectedValue(new Error("network unreachable"))
    const res = await softDeleteItemUnit("home-1", "furnace")
    expect(res.success).toBe(false)
    expect(listed()).toEqual(["Furnace", "Fridge"])
  })
})

describe("createItemUnit / updateItemUnit patch the cached list", () => {
  it("a created item is on the list, first", async () => {
    commit.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ displayName: "Washer", status: "active", deletedAt: null }) })
    const res = await createItemUnit({ home_id: "home-1", display_name: "Washer", category: "washer" })
    expect(res.error).toBeNull()
    expect(listed()).toEqual(["Washer", "Furnace", "Fridge"])
  })

  it("a renamed item is renamed on the list, in place", async () => {
    commit.mockResolvedValue(undefined)
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ displayName: "Basement furnace", status: "active", deletedAt: null }) })
    const res = await updateItemUnit("home-1", "furnace", { display_name: "Basement furnace" })
    expect(res.error).toBeNull()
    expect(listed()).toEqual(["Basement furnace", "Fridge"])
  })

  it("a failed write patches nothing", async () => {
    commit.mockRejectedValue(new Error("PERMISSION_DENIED"))
    await createItemUnit({ home_id: "home-1", display_name: "Washer", category: "washer" })
    await updateItemUnit("home-1", "furnace", { display_name: "Basement furnace" })
    expect(listed()).toEqual(["Furnace", "Fridge"])
  })
})
