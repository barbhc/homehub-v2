/**
 * The offline-empty guard on the three reads that now feed a PERSISTED warm
 * snapshot (Items: items + rooms; Tasks: the agenda).
 *
 * Firestore's getDocs doesn't throw when it can't reach the server — it answers
 * from the local cache, and on a cold cache that answer is EMPTY. Believed, it
 * paints "No items yet" / "Nothing due — enjoy the calm" over a full home, and
 * the page's onSuccess then persists that emptiness as the snapshot every
 * later launch starts from. With `refuseOfflineEmpty` the read reports the
 * failure it is, so SWR keeps the last good list and the page says it couldn't
 * reach the server.
 *
 * Without the option every caller keeps today's behaviour — the guard is opt-in.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()

// `callable`: weekAgenda imports taskService, which builds its callables at module scope.
vi.mock("@/integrations/firebase", () => ({ db: {}, auth: { currentUser: null }, callable: vi.fn(() => vi.fn()) }))
vi.mock("firebase/firestore", () => ({
  Timestamp: class { toDate() { return new Date(0) } },
  collection: vi.fn(() => ({})),
  collectionGroup: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  serverTimestamp: vi.fn(() => "ts"),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  writeBatch: vi.fn(() => ({ set: vi.fn().mockReturnThis(), commit: vi.fn() })),
}))

const { assertServed } = await import("./assertServed")
const { getItemUnits } = await import("@/modules/items/services/itemService")
const { getRooms } = await import("@/modules/home/services/homeService")
const { getWeekAgenda } = await import("@/modules/care/services/weekAgenda")

const snap = (docs: Array<{ id: string; data: Record<string, unknown> }>, fromCache: boolean) => ({
  metadata: { fromCache },
  empty: docs.length === 0,
  docs: docs.map((d) => ({ id: d.id, data: () => d.data, get: (k: string) => d.data[k] })),
})
const OFFLINE_EMPTY = snap([], true)
const SERVED_EMPTY = snap([], false)

beforeEach(() => {
  vi.clearAllMocks()
  getDoc.mockResolvedValue({ get: () => undefined, exists: () => true, data: () => ({}) })
})

describe("assertServed", () => {
  it("throws only for an EMPTY answer that came from the local cache", () => {
    expect(() => assertServed(OFFLINE_EMPTY, "items")).toThrow("Couldn't reach the server to load your items.")
    expect(() => assertServed(SERVED_EMPTY, "items")).not.toThrow() // a real empty home
    expect(() => assertServed(snap([{ id: "a", data: {} }], true), "items")).not.toThrow()
  })
})

describe("getItemUnits({ refuseOfflineEmpty })", () => {
  it("an offline empty read is an error, not 'no items'", async () => {
    getDocs.mockResolvedValue(OFFLINE_EMPTY)
    const res = await getItemUnits("h1", { refuseOfflineEmpty: true })
    expect(res).toEqual({ data: null, error: { message: "Couldn't reach the server to load your items." } })
  })

  it("a served empty read is a real empty home", async () => {
    getDocs.mockResolvedValue(SERVED_EMPTY)
    expect(await getItemUnits("h1", { refuseOfflineEmpty: true })).toEqual({ data: [], error: null })
  })

  it("without the option, callers keep today's behaviour", async () => {
    getDocs.mockResolvedValue(OFFLINE_EMPTY)
    expect(await getItemUnits("h1")).toEqual({ data: [], error: null })
  })
})

describe("getRooms({ refuseOfflineEmpty })", () => {
  it("an offline empty read is an error, a served one is a real empty list", async () => {
    getDocs.mockResolvedValue(OFFLINE_EMPTY)
    expect((await getRooms("h1", { refuseOfflineEmpty: true })).error?.message).toBe("Couldn't reach the server to load your rooms.")
    expect(await getRooms("h1")).toEqual({ data: [], error: null })
    getDocs.mockResolvedValue(SERVED_EMPTY)
    expect(await getRooms("h1", { refuseOfflineEmpty: true })).toEqual({ data: [], error: null })
  })
})

describe("getWeekAgenda({ refuseOfflineEmpty })", () => {
  it("an offline empty read is an error — never 'nothing due'", async () => {
    getDocs.mockResolvedValue(OFFLINE_EMPTY)
    const res = await getWeekAgenda("h1", { days: 31, refuseOfflineEmpty: true })
    expect(res).toEqual({ data: null, error: { message: "Couldn't reach the server to load your tasks." } })
  })

  it("a served empty read is a real empty agenda; without the option nothing changes", async () => {
    // An empty agenda withheld nothing either — and says so, with its rows.
    const empty = { data: [], error: null, withheld: { beyondHorizon: 0, nextDueDate: null, itemCleaning: 0 } }
    getDocs.mockResolvedValue(SERVED_EMPTY)
    expect(await getWeekAgenda("h1", { days: 31, refuseOfflineEmpty: true })).toEqual(empty)
    getDocs.mockResolvedValue(OFFLINE_EMPTY)
    expect(await getWeekAgenda("h1", { days: 31 })).toEqual(empty)
  })
})
