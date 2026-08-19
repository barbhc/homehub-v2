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
/** Every doc written through writeBatch, in order — lets createHome's payload
 *  be asserted without an emulator. */
const batchWrites: Array<{ path: string; data: unknown }> = []

vi.mock("firebase/firestore", () => ({
  // `Timestamp` must be a real class: toHome's date coercion does
  // `v instanceof Timestamp`, and `instanceof undefined` throws a TypeError that
  // the service's catch turns into a generic error — which looks like a logic
  // bug rather than a missing mock.
  Timestamp: class {},
  collection: vi.fn((_db: unknown, path?: string) => ({ path: path ?? "homes" })),
  collectionGroup: vi.fn(),
  doc: vi.fn((_db: unknown, path: string) => ({ path })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  getDocs: (...a: unknown[]) => getDocs(...a),
  query: vi.fn(),
  where: vi.fn(),
  serverTimestamp: vi.fn(),
  writeBatch: vi.fn(() => {
    const batch = {
      set: vi.fn((ref: { path?: string }, data: unknown) => {
        batchWrites.push({ path: ref?.path ?? "", data })
        return batch
      }),
      commit: vi.fn(async () => undefined),
    }
    return batch
  }),
  updateDoc: vi.fn(),
}))
vi.mock("@/integrations/firebase", () => ({
  db: {},
  auth: { currentUser: { uid: "uid-1" } },
}))

import { getMyHomes, createHome } from "./homeService"

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


/**
 * createHome writes the ownership anchor.
 *
 * firestore.rules refuses a home create unless `createdBy == request.auth.uid`,
 * and refuses the caller's own owner member row unless the home it is being
 * created in carries that same uid. So this one field is what stands between a
 * working onboarding flow and nobody being able to create a home at all — and
 * equally, between the current rules and the old ones, where any signed-in user
 * who knew a homeId could write themselves in as owner.
 *
 * The matching server-side half — that these two writes, committed in ONE batch,
 * are actually ACCEPTED by the rules — is proven against the emulator in
 * firebase/rules.test.ts ("createHome's ONE-batch bootstrap still works").
 * Keep the two in step: this test pins the payload, that one pins the verdict.
 */
describe("createHome", () => {
  beforeEach(() => {
    batchWrites.length = 0
    getDoc.mockReset()
  })

  it("stamps createdBy with the creator's uid, and takes the owner row", async () => {
    const res = await createHome({ name: "My House", userId: "uid-42" })
    expect(res.error).toBeNull()

    const home = batchWrites.find((w) => !w.path.includes("/members/"))!
    const member = batchWrites.find((w) => w.path.includes("/members/"))!

    expect(home.data).toMatchObject({ name: "My House", createdBy: "uid-42" })
    expect(member.path).toContain("/members/uid-42")
    expect(member.data).toMatchObject({ uid: "uid-42", role: "owner" })
  })

  it("writes the home and the member row in the SAME batch", async () => {
    // Load-bearing: the rule uses getAfter() precisely because these commit
    // together. Splitting them into two commits would make the member-create
    // check consult a home doc that does not exist yet, and home creation would
    // start failing for everyone.
    await createHome({ name: "Second Home", userId: "uid-7", isPrimary: false })
    const firstCommitWrites = batchWrites.slice(0, 2)
    expect(firstCommitWrites).toHaveLength(2)
    expect(firstCommitWrites.some((w) => w.path.includes("/members/"))).toBe(true)
    expect(firstCommitWrites.some((w) => !w.path.includes("/members/"))).toBe(true)
  })

  it("never stamps createdBy with anything but the passed uid", async () => {
    await createHome({ name: "H", userId: "uid-99" })
    const home = batchWrites.find((w) => !w.path.includes("/members/"))!
    expect((home.data as { createdBy: string }).createdBy).toBe("uid-99")
  })
})
