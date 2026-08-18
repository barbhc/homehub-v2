/**
 * getMyHomes — the multi-home lookup that replaced getPrimaryHome in the
 * provider. Two behaviours are load-bearing and pinned here:
 *
 *  · An EMPTY answer served from Firestore's local cache is not evidence of
 *    anything. Offline, a collectionGroup query resolves empty without throwing,
 *    so "couldn't reach the server" and "you belong to no home" look identical —
 *    and the second one routes to onboarding and invites the user to create a
 *    home they already own. That is the duplicate-home incident.
 *  · Ordering must be deterministic even when two memberships are both flagged
 *    primary (data created before the add-home flow passed isPrimary: false),
 *    otherwise "which home is primary" depends on iteration order.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"

const getDocs = vi.fn()
const getDoc = vi.fn()

vi.mock("firebase/firestore", () => ({
  // `Timestamp` must be a real class: toHome's date coercion does
  // `v instanceof Timestamp`, and `instanceof undefined` throws a TypeError that
  // the service's catch turns into a generic error — which looks like a logic
  // bug rather than a missing mock.
  Timestamp: class {},
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn().mockReturnThis(), commit: vi.fn() })),
  updateDoc: vi.fn(),
}))
vi.mock("@/integrations/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "uid-1" } },
}))

import { getMyHomes } from "./homeService"

/** A membership doc as myMemberships reads it: homeId from the parent's parent. */
const membership = (homeId: string, isPrimary: boolean) => ({
  ref: { parent: { parent: { id: homeId } } },
  get: (k: string) => (k === "isPrimary" ? isPrimary : undefined),
})

/** A home doc snapshot. `deletedAt` non-null means soft-deleted. */
const homeSnap = (id: string, name: string, createdAt: string, deletedAt: string | null = null) => ({
  id,
  exists: () => true,
  data: () => ({ name, timezone: "America/Los_Angeles", createdAt, updatedAt: createdAt, deletedAt }),
  get: (k: string) => (k === "deletedAt" ? deletedAt : undefined),
})

beforeEach(() => {
  getDocs.mockReset()
  getDoc.mockReset()
})

describe("getMyHomes", () => {
  it("reports an offline empty answer as a FAILURE, never as 'no homes'", async () => {
    getDocs.mockResolvedValue({ docs: [], metadata: { fromCache: true } })
    const res = await getMyHomes()
    expect(res.data).toBeNull()
    expect(res.error?.message).toMatch(/couldn't reach the server/i)
  })

  it("a server-confirmed empty answer genuinely means no homes", async () => {
    getDocs.mockResolvedValue({ docs: [], metadata: { fromCache: false } })
    const res = await getMyHomes()
    expect(res.error).toBeNull()
    expect(res.data).toEqual({ homes: [], primaryHomeId: null })
  })

  it("returns the primary first, then the rest oldest-first", async () => {
    getDocs.mockResolvedValue({
      docs: [membership("h1", false), membership("h2", true)],
      metadata: { fromCache: false },
    })
    getDoc
      .mockResolvedValueOnce(homeSnap("h1", "My House", "2026-01-01T00:00:00Z"))
      .mockResolvedValueOnce(homeSnap("h2", "Parents SF", "2026-06-01T00:00:00Z"))

    const res = await getMyHomes()
    expect(res.error).toBeNull()
    expect(res.data?.primaryHomeId).toBe("h2")
    expect(res.data?.homes.map((h) => h.name)).toEqual(["Parents SF", "My House"])
  })

  it("breaks a two-primary tie by age, so the original home wins", async () => {
    getDocs.mockResolvedValue({
      docs: [membership("h1", true), membership("h2", true)],
      metadata: { fromCache: false },
    })
    getDoc
      .mockResolvedValueOnce(homeSnap("h1", "My House", "2026-01-01T00:00:00Z"))
      .mockResolvedValueOnce(homeSnap("h2", "Parents SF", "2026-06-01T00:00:00Z"))

    const res = await getMyHomes()
    expect(res.data?.primaryHomeId).toBe("h1")
    expect(res.data?.homes.map((h) => h.name)).toEqual(["My House", "Parents SF"])
  })

  it("filters out soft-deleted homes", async () => {
    getDocs.mockResolvedValue({
      docs: [membership("h1", true), membership("h2", false)],
      metadata: { fromCache: false },
    })
    getDoc
      .mockResolvedValueOnce(homeSnap("h1", "My House", "2026-01-01T00:00:00Z"))
      .mockResolvedValueOnce(homeSnap("h2", "Old Place", "2026-02-01T00:00:00Z", "2026-07-01T00:00:00Z"))

    const res = await getMyHomes()
    expect(res.data?.homes.map((h) => h.name)).toEqual(["My House"])
  })

  it("fans the home-doc reads out in parallel rather than awaiting each in turn", async () => {
    getDocs.mockResolvedValue({
      docs: [membership("h1", true), membership("h2", false)],
      metadata: { fromCache: false },
    })
    let inFlight = 0
    let maxInFlight = 0
    getDoc.mockImplementation(async (ref: { path: string }) => {
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      await Promise.resolve()
      inFlight--
      const id = ref.path.split("/").pop()!
      return homeSnap(id, id, "2026-01-01T00:00:00Z")
    })

    await getMyHomes()
    // Sequential reads would never overlap; this is the boot-budget guard.
    expect(maxInFlight).toBeGreaterThan(1)
  })
})
